// Minimal SMTP client — no dependencies. Works with Brevo (smtp-relay.brevo.com) and Gmail.
//
// Environment:
//   SMTP_HOST      e.g. smtp-relay.brevo.com (default smtp.gmail.com)
//   SMTP_PORT      465 = TLS from the start, 587 = STARTTLS (default 465)
//   SMTP_USER      Brevo: your SMTP login (…@smtp-brevo.com); Gmail: the address
//   SMTP_PASS      Brevo: the SMTP key; Gmail: an app password
//   MAIL_FROM          default sender, e.g. info@lccc.lu (domain verified in Brevo). Default SMTP_USER
//   MAIL_FROM_TICKETS  sender of ticket emails, e.g. tickets@lccc.lu                    (default MAIL_FROM)
//   MAIL_FROM_VENDORS  sender of vendor login codes and decisions, e.g. vendors@lccc.lu (default MAIL_FROM)
//   MAIL_FROM_INFO     sender of volunteer / press confirmations, e.g. info@lccc.lu     (default MAIL_FROM)
//   MAIL_REPLY_TO      where replies go, e.g. royalfamilyeventing+web@gmail.com
//
// Without SMTP_USER/SMTP_PASS, emails are written to the log instead of being sent (useful for development).

'use strict';
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const FROM = process.env.MAIL_FROM || USER;
const REPLY_TO = process.env.MAIL_REPLY_TO || '';

// Sender per kind of email: msg.sender = 'tickets' | 'vendors' | 'info' (anything else: the default)
const SENDERS = {
  default: { name: 'LCCC', address: FROM },
  tickets: { name: 'LCCC Tickets', address: process.env.MAIL_FROM_TICKETS || FROM },
  vendors: { name: 'LCCC Vendors', address: process.env.MAIL_FROM_VENDORS || FROM },
  info: { name: 'LCCC', address: process.env.MAIL_FROM_INFO || FROM }
};

function senderOf(msg) {
  return SENDERS[msg.sender] || SENDERS.default;
}

function configured() {
  return !!(USER && PASS);
}

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/.{76}/g, '$&\r\n');

// The message body as one MIME part (with its own Content-Type header)
function bodyPart(msg) {
  const textPart = 'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64(msg.text) + '\r\n';
  if (!msg.html) return textPart;

  const alt = 'alt-' + crypto.randomUUID();
  const htmlPart = 'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64(msg.html) + '\r\n';
  const alternative = 'Content-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n' +
    '--' + alt + '\r\n' + textPart + '--' + alt + '\r\n' + htmlPart + '--' + alt + '--\r\n';
  if (!msg.images || !msg.images.length) return alternative;

  // HTML with inline images (cid:…), e.g. ticket QR codes
  const rel = 'rel-' + crypto.randomUUID();
  let body = 'Content-Type: multipart/related; boundary="' + rel + '"\r\n\r\n--' + rel + '\r\n' + alternative;
  msg.images.forEach((img) => {
    body += '--' + rel + '\r\nContent-Type: ' + (img.type || 'image/png') + '; name="' + img.filename + '"\r\n' +
      'Content-Transfer-Encoding: base64\r\nContent-ID: <' + img.cid + '>\r\n' +
      'Content-Disposition: inline; filename="' + img.filename + '"\r\n\r\n' + b64(img.content) + '\r\n';
  });
  return body + '--' + rel + '--\r\n';
}

// msg: { sender?, to, subject, text, html?, replyTo?,
//        images?: [{ cid, filename, content: Buffer, type }]        shown inside the HTML
//        attachments?: [{ filename, content: Buffer, type }] }      files, e.g. an invoice PDF
function buildMessage(msg) {
  const from = senderOf(msg);
  const domain = (from.address.split('@')[1] || 'lccc.lu');
  const headers = [
    'From: ' + encodeHeader(from.name) + ' <' + from.address + '>',
    'To: ' + msg.to,
    (msg.replyTo || REPLY_TO) ? 'Reply-To: ' + (msg.replyTo || REPLY_TO) : null,
    'Subject: ' + encodeHeader(msg.subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
    'MIME-Version: 1.0'
  ].filter(Boolean);

  let body = bodyPart(msg);
  if (msg.attachments && msg.attachments.length) {
    const mix = 'mix-' + crypto.randomUUID();
    let mixed = 'Content-Type: multipart/mixed; boundary="' + mix + '"\r\n\r\n--' + mix + '\r\n' + body;
    msg.attachments.forEach((a) => {
      mixed += '--' + mix + '\r\nContent-Type: ' + (a.type || 'application/octet-stream') + '; name="' + a.filename + '"\r\n' +
        'Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="' + a.filename + '"\r\n\r\n' + b64(a.content) + '\r\n';
    });
    body = mixed + '--' + mix + '--\r\n';
  }
  return headers.join('\r\n') + '\r\n' + body;
}

// Line-based SMTP conversation over a (TLS) socket
function conversation(socket) {
  let buffer = '';
  let waiting = null;
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\r\n');
    const last = lines[lines.length - 2];
    // A reply is complete when its last line has a space after the 3-digit code
    if (last && /^\d{3} /.test(last) && waiting) {
      const reply = buffer;
      buffer = '';
      const w = waiting;
      waiting = null;
      w(reply);
    }
  });
  const expect = (code) => new Promise((ok, fail) => {
    waiting = (reply) => (reply.startsWith(String(code)) ? ok(reply) : fail(new Error('SMTP: ' + reply.trim().split('\r\n').pop())));
  });
  const cmd = (line, code) => { const p = expect(code); socket.write(line + '\r\n'); return p; };
  return { expect, cmd };
}

// Sends one email. Resolves with { sent: true } when the server accepted it, { logged: true } without SMTP setup.
async function sendMail(msg) {
  if (!configured()) {
    console.log(new Date().toISOString(), '[mail not configured] From: ' + senderOf(msg).address + ' To: ' + msg.to + ' | ' + msg.subject + '\n' + msg.text +
      (msg.images && msg.images.length ? '\n[' + msg.images.length + ' inline image(s)]' : '') +
      (msg.attachments && msg.attachments.length ? '\n[attachments: ' + msg.attachments.map((a) => a.filename).join(', ') + ']' : ''));
    return { logged: true };
  }
  const starttls = PORT === 587 || PORT === 2525;
  let socket = starttls ? net.connect({ host: HOST, port: PORT }) : tls.connect({ host: HOST, port: PORT, servername: HOST });
  const fail = (err) => { socket.destroy(); throw err; };
  try {
    await new Promise((ok, err) => { socket.once(starttls ? 'connect' : 'secureConnect', ok); socket.once('error', err); });
    socket.setTimeout(30000, () => socket.destroy(new Error('SMTP timeout')));
    let c = conversation(socket);
    await c.expect(220);
    await c.cmd('EHLO lccc', 250);
    if (starttls) {
      await c.cmd('STARTTLS', 220);
      socket.removeAllListeners('data');
      socket = tls.connect({ socket, servername: HOST });
      await new Promise((ok, err) => { socket.once('secureConnect', ok); socket.once('error', err); });
      c = conversation(socket);
      await c.cmd('EHLO lccc', 250);
    }
    await c.cmd('AUTH PLAIN ' + Buffer.from('\0' + USER + '\0' + PASS).toString('base64'), 235);
    await c.cmd('MAIL FROM:<' + senderOf(msg).address + '>', 250);
    for (const rcpt of String(msg.to).split(',').map((s) => s.trim()).filter(Boolean)) {
      await c.cmd('RCPT TO:<' + rcpt + '>', 250);
    }
    await c.cmd('DATA', 354);
    await c.cmd(buildMessage(msg).replace(/^\./gm, '..') + '.', 250);
    socket.write('QUIT\r\n');
    socket.end();
    return { sent: true };
  } catch (err) {
    return fail(err);
  }
}

module.exports = { sendMail, configured, buildMessage };
