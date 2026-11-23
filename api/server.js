// LCCC vendor interest form for lccc.lu (coming-soon site). No dependencies.
//
// POST /api/interest  { name, email, shop, about, consent }  ->  saved in DATA_DIR/vendor-interest.json,
// the team gets an email (NOTIFY_TO) and the vendor a short confirmation.
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
const FILE = path.join(DATA_DIR, 'vendor-interest.json');
const NOTIFY_TO = process.env.NOTIFY_TO || '';

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

function readList() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; }
}

function writeList(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n');
  fs.renameSync(tmp, FILE);
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
  if (b.website) return send(res, 200, { ok: true }); // honeypot: bots fill in the hidden field
  const entry = {
    name: str(b.name, 80),
    email: str(b.email, 200).toLowerCase(),
    shop: str(b.shop, 100),
    about: str(b.about, 300),
    date: new Date().toISOString()
  };
  if (!entry.name || !validEmail(entry.email)) return send(res, 400, { error: 'Please enter your name and a valid email.' });
  if (!b.consent) return send(res, 400, { error: 'Please agree that we may contact you.' });
  if (limited(ip)) return send(res, 429, { error: 'Too many sign-ups. Please try again later.' });

  // One entry per email: signing up again updates it
  const list = readList().filter((e) => e.email !== entry.email);
  list.push(entry);
  writeList(list);
  log('Vendor interest: ' + entry.email + ' (' + list.length + ' in total)');

  const lines = 'Name: ' + entry.name + '\nEmail: ' + entry.email + '\nShop / brand: ' + (entry.shop || '-') + '\nAbout: ' + (entry.about || '-');
  if (NOTIFY_TO) {
    sendMail({ sender: 'vendors', to: NOTIFY_TO, replyTo: entry.email, subject: 'Vendor interest LCCC 2027: ' + (entry.shop || entry.name),
      text: 'New sign-up on lccc.lu/vendors.html:\n\n' + lines + '\n\nReply to this email to answer them directly.' })
      .catch((err) => log('Notification failed: ' + err.message));
  }
  sendMail({ sender: 'vendors', to: entry.email, subject: 'Thanks for your interest in LCCC 2027',
    text: 'Hi ' + entry.name + ',\n\nthanks for your interest in selling at LCCC 2027 (17–18 April 2027, Hall Victor Hugo, Luxembourg).\n\n' +
      'We\'ll email you as soon as vendor applications open on our new website. You signed up with:\n\n' + lines +
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
}).listen(PORT, () => log('LCCC interest form on :' + PORT));
