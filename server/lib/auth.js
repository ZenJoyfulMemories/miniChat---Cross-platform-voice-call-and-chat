'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

class TokenService {
  constructor(dataDir, sessionDays) {
    fs.mkdirSync(dataDir, { recursive: true });
    const keyFile = path.join(dataDir, 'secret.key');
    try {
      this.secret = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
      if (this.secret.length < 32) throw new Error('密钥过短');
    } catch {
      this.secret = crypto.randomBytes(48);
      fs.writeFileSync(keyFile, this.secret.toString('hex'), { mode: 0o600 });
    }
    this.ttlMs = sessionDays * 24 * 60 * 60 * 1000;
  }

  sign(uid) {
    const payload = b64url(JSON.stringify({ uid, exp: Date.now() + this.ttlMs }));
    const mac = b64url(crypto.createHmac('sha256', this.secret).update(payload).digest());
    return `${payload}.${mac}`;
  }

  verify(token) {
    if (!token || typeof token !== 'string') return null;
    const [payload, mac] = token.split('.');
    if (!payload || !mac) return null;
    const expected = crypto.createHmac('sha256', this.secret).update(payload).digest();
    let actual;
    try {
      actual = fromB64url(mac);
    } catch {
      return null;
    }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    let data;
    try {
      data = JSON.parse(fromB64url(payload).toString('utf8'));
    } catch {
      return null;
    }
    if (!data || !data.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data.uid;
  }
}

module.exports = { TokenService };
