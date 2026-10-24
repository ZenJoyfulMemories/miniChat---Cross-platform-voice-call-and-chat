'use strict';

const crypto = require('node:crypto');

/**
 * 生成 ICE 服务器列表。
 * TURN 使用 coturn 的 REST 临时密码方案（shared secret + HMAC），避免在页面上暴露长期凭据。
 */
function buildIceServers(config) {
  const servers = [];
  if (Array.isArray(config.stun) && config.stun.length) {
    servers.push({ urls: config.stun });
  }
  const turn = config.turn || {};
  if (turn.enabled && Array.isArray(turn.urls) && turn.urls.length) {
    if (turn.username && turn.credential) {
      // 静态账号密码
      servers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
    } else if (turn.secret) {
      const ttl = Number(turn.ttl) || 86400;
      const username = `${Math.floor(Date.now() / 1000) + ttl}:voicecall`;
      const credential = crypto.createHmac('sha1', turn.secret).update(username).digest('base64');
      servers.push({ urls: turn.urls, username, credential });
    }
  }
  return servers;
}

module.exports = { buildIceServers };
