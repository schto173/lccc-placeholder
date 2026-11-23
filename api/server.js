// LCCC interest forms for lccc.lu (coming-soon site): vendors and sponsors. No dependencies.
//
// POST /api/interest  { type: 'vendor' | 'sponsor', ...fields, consent }
//   -> saved in DATA_DIR/vendor-interest.json or sponsor-interest.json,
//      the team gets an email (NOTIFY_TO) and the person a short confirmation.
//
// Environment (in .env next to docker-compose.yml):
//   NOTIFY_TO   where sign-ups are emailed to, e.g. royalfamilyeventing+web@gmail.com
//   SMTP_*, MAIL_FROM, MAIL_FROM_VENDORS, MAIL_REPLY_TO   see mail.js (same values as on beta)
//   DATA_DIR    default /data

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sendMail } = require('./mail');

const PORT = 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const NOTIFY_TO = process.env.NOTIFY_TO || '';
const EVENT = 'LCCC 2027 (17–18 April 2027, Hall Victor Hugo, Luxembourg)';

// What each form asks for: field -> [label, max length, required]
const FORMS = {
  vendor: {
    file: 'vendor-interest.json',
    sender: 'vendors',
    fields: { name: ['Name', 80, true], shop: ['Shop / brand', 100, false], about: ['What they sell', 300, false] },
    subject: (e) => 'Vendor interest LCCC 2027: ' + (e.shop || e.name),
    thanks: 'thanks for your interest in selling at ' + EVENT + '.\n\nWe\'ll email you as soon as vendor applications open on our new website.'
  },
  sponsor: {
    file: 'sponsor-interest.json',
    sender: 'default',
    fields: { company: ['Company', 100, true], name: ['Contact person', 80, true], phone: ['Phone', 40, false], about: ['How they\'d like to be involved', 500, false] },
    subject: (e) => 'Sponsor request LCCC 2027: ' + e.company,
    thanks: 'thanks for your interest in sponsoring ' + EVENT + '.\n\nWe\'ll get back to you personally within a few days with our sponsorship options.'
  }
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
const str = (x, max) => String(x == null ? '' : x).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// At most 5 sign-ups per IP and hour
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function readList(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch (e) { return []; }
}

function writeList(file, list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const full = path.join(DATA_DIR, file);
  fs.writeFileSync(full + '.tmp', JSON.stringify(list, null, 2) + '\n');
  fs.renameSync(full + '.tmp', full);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > max) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(Object.assign(new Error('Invalid request'), { status: 400 })); } });
  });
}

async function interest(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const b = await readBody(req, 10000);
  const form = FORMS[b.type];
  if (!form) return send(res, 400, { error: 'Unknown form.' });
  if (b.website) return send(res, 200, { ok: true }); // honeypot: bots fill in the hidden field

  const entry = { email: str(b.email, 200).toLowerCase() };
  for (const [key, [label, max, required]] of Object.entries(form.fields)) {
    entry[key] = str(b[key], max);
    if (required && !entry[key]) return send(res, 400, { error: 'Please fill in: ' + label + '.' });
  }
  if (!validEmail(entry.email)) return send(res, 400, { error: 'Please enter a valid email.' });
  if (!b.consent) return send(res, 400, { error: 'Please agree that we may contact you.' });
  if (limited(ip)) return send(res, 429, { error: 'Too many sign-ups. Please try again later.' });
  entry.date = new Date().toISOString();

  // One entry per email: sending the form again updates it
  const list = readList(form.file).filter((e) => e.email !== entry.email);
  list.push(entry);
  writeList(form.file, list);
  log(b.type + ' interest: ' + entry.email + ' (' + list.length + ' in total)');

  const lines = Object.entries(form.fields).map(([key, [label]]) => label + ': ' + (entry[key] || '-')).join('\n') + '\nEmail: ' + entry.email;
  if (NOTIFY_TO) {
    sendMail({ sender: form.sender, to: NOTIFY_TO, replyTo: entry.email, subject: form.subject(entry),
      text: 'New ' + b.type + ' sign-up on lccc.lu:\n\n' + lines + '\n\nReply to this email to answer them directly.' })
      .catch((err) => log('Notification failed: ' + err.message));
  }
  sendMail({ sender: form.sender, to: entry.email, subject: 'Thanks for your interest in LCCC 2027',
    text: 'Hi ' + entry.name + ',\n\n' + form.thanks + ' You sent us:\n\n' + lines +
      '\n\nIf this wasn\'t you, or you want us to delete your details, just reply to this email.\n\nThe LCCC team\nRoyal Family Eventing a.s.b.l.' })
    .catch((err) => log('Confirmation to ' + entry.email + ' failed: ' + err.message));
  return send(res, 200, { ok: true });
}

http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (route === '/api/interest' && req.method === 'POST') {
    return interest(req, res).catch((err) => send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong. Please try again.' }));
  }
  return send(res, 404, { error: 'Not found' });
}).listen(PORT, () => log('LCCC interest forms on :' + PORT));
