'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new Error(`配置文件解析失败 ${file}: ${err.message}`);
  }
}

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const defaults = {
  // 监听端口：HTTP 用于把局域网浏览器跳转到 HTTPS；HTTPS 用于真正承载通话页面
  httpPort: Number(process.env.PORT || 3000),
  httpsPort: Number(process.env.HTTPS_PORT || 3443),
  // 对外地址（例如 chmlfrp 映射后的 https://xxx.example.com），配置后 HTTP 跳转会使用它
  publicUrl: process.env.PUBLIC_URL || '',
  dataDir: path.join(ROOT, 'data'),
  webDir: path.join(__dirname, '..', 'web'),
  sessionDays: 30,
  callRingTimeoutSec: 45,
  // 通话中信令连接断开后给多长的重连宽限（毫秒）
  callReconnectGraceMs: 12000,
  // 自签名证书：cert/key 为空时按本机 IP 自动生成
  tls: {
    enabled: true,
    cert: '',
    key: '',
    // 额外写入证书 SAN 的域名（公网域名必须在这里，否则浏览器报证书名称不匹配）
    hosts: []
  },
  // 局域网内直连通常不需要 TURN；跨公网（chmlfrp 场景）建议启用 coturn
  stun: [
    'stun:stun.miwifi.com:3478',
    'stun:stun.l.google.com:19302'
  ],
  turn: {
    enabled: false,
    urls: [],
    secret: '',
    // 静态账号密码（部分 TURN 服务商使用），优先于 shared secret
    username: '',
    credential: '',
    ttl: 86400
  }
};

const fileConfig = readJson(path.join(ROOT, 'config.json'));
const config = merge(defaults, fileConfig);

if (process.env.PORT) config.httpPort = Number(process.env.PORT);
if (process.env.HTTPS_PORT) config.httpsPort = Number(process.env.HTTPS_PORT);
if (process.env.DATA_DIR) config.dataDir = process.env.DATA_DIR;
if (process.env.TLS_HOSTS) {
  config.tls.hosts = process.env.TLS_HOSTS.split(',').map((s) => s.trim()).filter(Boolean);
}
if (process.env.CALL_RECONNECT_GRACE_MS) {
  config.callReconnectGraceMs = Number(process.env.CALL_RECONNECT_GRACE_MS);
}
if (process.env.TURN_ENABLED === '1') config.turn.enabled = true;
if (process.env.TURN_SECRET) config.turn.secret = process.env.TURN_SECRET;
if (process.env.TURN_URLS) config.turn.urls = process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean);

config.dataDir = path.resolve(ROOT, config.dataDir);
config.webDir = path.resolve(ROOT, config.webDir);
config.tls.cert = config.tls.cert ? path.resolve(ROOT, config.tls.cert) : '';
config.tls.key = config.tls.key ? path.resolve(ROOT, config.tls.key) : '';

module.exports = { config, ROOT };
