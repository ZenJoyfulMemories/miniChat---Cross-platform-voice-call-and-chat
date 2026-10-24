'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const selfsigned = require('selfsigned');

const { config } = require('./config');
const { Store, HttpError } = require('./lib/store');
const { TokenService } = require('./lib/auth');
const { Signaling } = require('./lib/signaling');
const { buildIceServers } = require('./lib/ice');

const log = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args)
};

fs.mkdirSync(config.dataDir, { recursive: true });
const store = new Store(config.dataDir);
const tokens = new TokenService(config.dataDir, config.sessionDays);
const signaling = new Signaling({ store, tokens, config, log });

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) out.push(iface.address);
    }
  }
  return [...new Set(out)];
}

function publicHostName() {
  if (!config.publicUrl) return '';
  try {
    return new URL(config.publicUrl).hostname;
  } catch {
    return '';
  }
}

function loadTls() {
  if (!config.tls.enabled) return null;
  const dir = path.join(config.dataDir, 'tls');
  const certFile = config.tls.cert || path.join(dir, 'cert.pem');
  const keyFile = config.tls.key || path.join(dir, 'key.pem');
  // 手动配置了正式证书（如 Let's Encrypt / 腾讯云免费证书）时直接使用，不再生成自签名证书
  if (config.tls.cert && config.tls.key) {
    log.info(`[tls] 使用自定义证书 ${certFile}`);
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
  }
  const metaFile = path.join(dir, 'meta.json');
  const ips = lanAddresses();
  const extraHosts = [...new Set([publicHostName(), ...(config.tls.hosts || [])]
    .map((host) => String(host || '').trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+$/i.test(host) && !/^\d/.test(host)))];

  const needsGenerate = () => {
    if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return true;
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      return JSON.stringify(meta.ips || []) !== JSON.stringify(ips)
        || JSON.stringify(meta.hosts || []) !== JSON.stringify(extraHosts);
    } catch {
      return true;
    }
  };

  if (needsGenerate()) {
    fs.mkdirSync(dir, { recursive: true });
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...ips.map((ip) => ({ type: 7, ip })),
      ...extraHosts.map((host) => ({ type: 2, value: host }))
    ];
    const pems = selfsigned.generate(
      [{ name: 'commonName', value: extraHosts[0] || 'VoiceCall-LAN' }],
      {
        days: 3650,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
          { name: 'basicConstraints', cA: false },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
          { name: 'extKeyUsage', serverAuth: true },
          { name: 'subjectAltName', altNames }
        ]
      }
    );
    fs.writeFileSync(certFile, pems.cert);
    fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
    fs.writeFileSync(metaFile, JSON.stringify({ ips, hosts: extraHosts, publicUrl: config.publicUrl, createdAt: new Date().toISOString() }, null, 2));
    log.info(`[tls] 已生成自签名证书（SAN: ${['localhost', ...ips, ...extraHosts].join(', ')}）`);
  }
  return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'too_large', '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'bad_json', '请求格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : '';
}

function requireUser(req) {
  const uid = tokens.verify(bearer(req));
  const user = uid ? store.get(uid) : null;
  if (!user) throw new HttpError(401, 'no_session', '登录状态已失效，请重新登录');
  return user;
}

// 简单的登录 / 注册限速
const attempts = new Map();
function throttle(req, key, max = 20, windowMs = 60000) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const list = (attempts.get(id) || []).filter((t) => now - t < windowMs);
  list.push(now);
  attempts.set(id, list);
  if (list.length > max) throw new HttpError(429, 'too_many', '操作过于频繁，请稍后再试');
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  const withUser = (fn) => Promise.resolve().then(fn);

  if (method === 'GET' && p === '/api/health') {
    return sendJson(res, 200, { ok: true, time: Date.now() });
  }

  if (method === 'POST' && p === '/api/register') {
    throttle(req, 'register');
    const body = await readBody(req);
    const user = await store.register(body.id, body.name, body.password);
    const token = tokens.sign(user.id);
    log.info(`[api] 新账号 ${user.id}`);
    return sendJson(res, 200, {
      token,
      user,
      contacts: signaling.contactsWithPresence(store.get(user.id))
    });
  }

  if (method === 'POST' && p === '/api/login') {
    throttle(req, 'login');
    const body = await readBody(req);
    const user = await store.authenticate(body.id, body.password);
    return sendJson(res, 200, {
      token: tokens.sign(user.id),
      user,
      contacts: signaling.contactsWithPresence(store.get(user.id))
    });
  }

  if (method === 'GET' && p === '/api/me') {
    return withUser(() => {
      const user = requireUser(req);
      return sendJson(res, 200, { user: store.publicUser(user), contacts: signaling.contactsWithPresence(user) });
    });
  }

  if (method === 'GET' && p === '/api/contacts') {
    return withUser(() => {
      const user = requireUser(req);
      return sendJson(res, 200, { contacts: signaling.contactsWithPresence(user) });
    });
  }

  if (method === 'POST' && p === '/api/contacts') {
    return withUser(async () => {
      const user = requireUser(req);
      const body = await readBody(req);
      const contactId = String(body.id || '').trim().toLowerCase();
      const contacts = store.addContact(user.id, contactId);
      // 双方都刷新联系人列表（添加是互为联系人）
      signaling.sendUser(user.id, { type: 'contacts', contacts: signaling.contactsWithPresence(store.get(user.id)) });
      signaling.sendUser(contactId, { type: 'contacts', contacts: signaling.contactsWithPresence(store.get(contactId)) });
      return sendJson(res, 200, { contacts });
    });
  }

  if (method === 'DELETE' && p.startsWith('/api/contacts/')) {
    return withUser(() => {
      const user = requireUser(req);
      const id = decodeURIComponent(p.slice('/api/contacts/'.length));
      store.removeContact(user.id, id);
      signaling.sendUser(user.id, { type: 'contacts', contacts: signaling.contactsWithPresence(store.get(user.id)) });
      return sendJson(res, 200, { contacts: signaling.contactsWithPresence(store.get(user.id)) });
    });
  }

  if (method === 'GET' && p === '/api/users/search') {
    return withUser(() => {
      const user = requireUser(req);
      return sendJson(res, 200, { users: store.search(user.id, url.searchParams.get('q')) });
    });
  }

  if (method === 'GET' && p === '/api/messages') {
    return withUser(() => {
      const user = requireUser(req);
      const withId = String(url.searchParams.get('with') || '').trim().toLowerCase();
      const peer = store.get(withId);
      if (!peer) throw new HttpError(404, 'not_found', '联系人不存在');
      if (!store.isContact(user, peer.id) && !store.isContact(peer, user.id)) {
        throw new HttpError(403, 'not_contact', '只能查看联系人的消息');
      }
      const before = Number(url.searchParams.get('before')) || 0;
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 60));
      const messages = store.conversation(user.id, peer.id, { limit, before });
      return sendJson(res, 200, {
        peer: { ...store.publicUser(peer), online: signaling.isOnline(peer.id) },
        messages,
        hasMore: messages.length >= limit
      });
    });
  }

  if (method === 'GET' && p === '/api/conversations') {
    return withUser(() => {
      const user = requireUser(req);
      const conversations = store.conversationsFor(user.id)
        .map((item) => {
          const peer = store.get(item.id);
          return peer ? { ...item, name: peer.name, online: signaling.isOnline(peer.id) } : null;
        })
        .filter(Boolean);
      return sendJson(res, 200, { conversations });
    });
  }

  if (method === 'GET' && p === '/api/ice') {
    return withUser(() => {
      requireUser(req);
      return sendJson(res, 200, { iceServers: buildIceServers(config) });
    });
  }

  throw new HttpError(404, 'not_found', '接口不存在');
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = '/';
  }
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.resolve(config.webDir, '.' + pathname);
  if (!filePath.startsWith(config.webDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalHost(hostname) {
  return PRIVATE_HOSTS.has(hostname) || /^127\./.test(hostname) || hostname === '';
}

function isPublicHost(hostname) {
  const publicHost = publicHostName();
  return Boolean(publicHost) && hostname.toLowerCase() === publicHost.toLowerCase();
}

function proxiedHttps(req) {
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
}

function publicBase(req) {
  const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
  if (isPublicHost(host)) return (config.publicUrl || '').replace(/\/+$/, '');
  return `https://${host}:${config.httpsPort}`;
}

function httpRedirect(req, res) {
  const hostHeader = req.headers.host || 'localhost';
  const hostname = hostHeader.replace(/:\d+$/, '');
  // 反向代理（chmlfrp / Cloudflare 等）已完成 TLS 终止时，直接按 HTTP 提供服务
  if (isLocalHost(hostname) || proxiedHttps(req) || isPublicHost(hostname)) return false;
  const target = publicBase(req) + req.url;
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
  res.end(`正在跳转到安全连接：${target}`);
  return true;
}

async function requestHandler(req, res, isSecure) {
  const url = new URL(req.url, 'http://localhost');
  if (!isSecure && httpRedirect(req, res)) return;

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) log.error('[api] 未处理异常:', err);
    sendJson(res, status, { error: { code: err.code || 'internal', message: err.message || '服务器内部错误' } });
  }
}

const tls = loadTls();
const httpServer = http.createServer((req, res) => requestHandler(req, res, false));
httpServer.on('clientError', (err, socket) => socket.destroy());
signaling.attach(httpServer, '/ws');

let httpsServer = null;
if (tls) {
  httpsServer = https.createServer(tls, (req, res) => requestHandler(req, res, true));
  httpsServer.on('clientError', (err, socket) => socket.destroy());
  signaling.attach(httpsServer, '/ws');
}

function listen(server, port, label) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', reject);
      log.info(`[net] ${label} 监听 ${port}`);
      resolve();
    });
  });
}

async function start() {
  await listen(httpServer, config.httpPort, 'HTTP');
  if (httpsServer) await listen(httpsServer, config.httpsPort, 'HTTPS');

  const ips = lanAddresses();
  log.info('');
  log.info('  ===== 语音通话服务已启动 =====');
  if (httpsServer) {
    log.info(`  本机测试：https://localhost:${config.httpsPort}`);
    for (const ip of ips) log.info(`  局域网：  https://${ip}:${config.httpsPort}`);
    log.info(`  手机/电脑首次访问会出现自签名证书提示，选择“继续访问”即可。`);
  }
  log.info(`  HTTP：    http://localhost:${config.httpPort}（局域网其他设备会被跳转到 HTTPS）`);
  if (config.publicUrl) log.info(`  公网地址：${config.publicUrl}`);
  log.info('  ==============================');
  log.info('');
}

start().catch((err) => {
  log.error('启动失败:', err.message);
  process.exit(1);
});

function shutdown() {
  log.info('正在关闭服务...');
  try {
    signaling.close();
  } catch { /* 忽略关闭异常 */ }
  try {
    store.flush();
  } catch { /* 忽略写盘异常 */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => log.error('未处理的 Promise 拒绝:', err));
