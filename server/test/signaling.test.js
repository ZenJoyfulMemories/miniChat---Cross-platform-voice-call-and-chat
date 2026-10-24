'use strict';

/**
 * 端到端信令测试：真实启动服务器，模拟两台设备完成注册、联系人、上线状态、
 * 呼叫邀请、接听、SDP/ICE 转发、挂断与离线通知。
 * 运行：npm test
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const PORT = 17110;
const HTTPS_PORT = 17443;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'voicecall-test-'));
const ROOT = path.join(__dirname, '..');

let server;
const sockets = [];

function log(step) {
  process.stdout.write(`  ✓ ${step}\n`);
}

async function waitHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return;
    } catch { /* 服务器尚未就绪 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务器启动超时');
}

async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`http://localhost:${PORT}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function makeClient(token, deviceId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://localhost:${PORT}/ws?token=${encodeURIComponent(token)}&deviceId=${deviceId}&platform=test`
    );
    const queue = [];
    const waiters = [];
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const idx = waiters.findIndex((w) => w.type === msg.type);
      if (idx >= 0) {
        const waiter = waiters.splice(idx, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        queue.push(msg);
      }
    });
    ws.on('error', reject);
    ws.on('open', () => {
      sockets.push(ws);
      resolve({
        ws,
        queue,
        send: (msg) => ws.send(JSON.stringify(msg)),
        next(type, ms = 5000) {
          const idx = queue.findIndex((m) => m.type === type);
          if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]);
          return new Promise((res, rej) => {
            const waiter = { type, resolve: res };
            waiter.timer = setTimeout(() => {
              const pos = waiters.indexOf(waiter);
              if (pos >= 0) waiters.splice(pos, 1);
              rej(new Error(`等待消息超时: ${type}；已收到: ${queue.map((m) => m.type).join(', ')}`));
            }, ms);
            waiters.push(waiter);
          });
        }
      });
    });
  });
}

async function main() {
  server = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(HTTPS_PORT), DATA_DIR, CALL_RECONNECT_GRACE_MS: '600' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverLog = [];
  server.stdout.on('data', (d) => serverLog.push(d.toString()));
  server.stderr.on('data', (d) => serverLog.push(d.toString()));
  await waitHealth();
  log('服务器启动成功（HTTP + HTTPS）');

  const alice = await api('/api/register', { method: 'POST', body: { id: 'alice', name: 'Alice', password: 'secret123' } });
  const bob = await api('/api/register', { method: 'POST', body: { id: 'bob', name: 'Bob', password: 'secret123' } });
  assert.equal(alice.status, 200, JSON.stringify(alice.data));
  assert.equal(bob.status, 200, JSON.stringify(bob.data));
  assert.ok(alice.data.token && bob.data.token);
  log('注册并自动登录两个账号');

  const dup = await api('/api/register', { method: 'POST', body: { id: 'alice', name: 'A', password: 'secret123' } });
  assert.equal(dup.status, 409);
  const badLogin = await api('/api/login', { method: 'POST', body: { id: 'alice', password: 'wrong-pass' } });
  assert.equal(badLogin.status, 401);
  const me = await api('/api/me', { token: alice.data.token });
  assert.equal(me.data.user.name, 'Alice');
  log('重复注册/错误密码/鉴权校验通过');

  const added = await api('/api/contacts', { method: 'POST', body: { id: 'bob' }, token: alice.data.token });
  assert.equal(added.status, 200);
  assert.equal(added.data.contacts.length, 1);
  const mirrored = await api('/api/me', { token: bob.data.token });
  assert.equal(mirrored.data.contacts.length, 1);
  assert.equal(mirrored.data.contacts[0].id, 'alice');
  log('一方添加后双方互为联系人');
  await api('/api/contacts', { method: 'POST', body: { id: 'alice' }, token: bob.data.token });

  const aliceWs = await makeClient(alice.data.token, 'alice-web');
  const aliceReady = await aliceWs.next('ready');
  assert.equal(aliceReady.user.id, 'alice');
  assert.equal(aliceReady.contacts[0].online, false);
  log('网页端 WebSocket 连接并收到 ready');

  let bobWs = await makeClient(bob.data.token, 'bob-android');
  await bobWs.next('ready');
  const presence = await aliceWs.next('presence');
  assert.equal(presence.online, true);
  assert.equal(presence.user.id, 'bob');
  log('在线状态实时推送');

  aliceWs.send({ type: 'call:invite', callId: 'call-test-1', to: 'bob', mode: 'audio' });
  const ringing = await aliceWs.next('call:ringing');
  const incoming = await bobWs.next('call:incoming');
  assert.equal(ringing.callId, 'call-test-1');
  assert.equal(incoming.from.id, 'alice');
  assert.equal(incoming.from.name, 'Alice');
  log('呼叫邀请送达被叫方');

  bobWs.send({ type: 'call:accept', callId: 'call-test-1' });
  const accepted = await aliceWs.next('call:accepted');
  assert.equal(accepted.by.id, 'bob');
  log('接听后主叫收到 accepted');

  const sdpOffer = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
  aliceWs.send({ type: 'call:sdp', callId: 'call-test-1', sdp: sdpOffer });
  const offerAtBob = await bobWs.next('call:sdp');
  assert.equal(offerAtBob.sdp.type, 'offer');
  assert.equal(offerAtBob.from.id, 'alice');

  bobWs.send({ type: 'call:sdp', callId: 'call-test-1', sdp: { type: 'answer', sdp: 'v=0\r\n' } });
  const answerAtAlice = await aliceWs.next('call:sdp');
  assert.equal(answerAtAlice.sdp.type, 'answer');
  log('SDP offer/answer 双向转发');

  const candidate = { candidate: 'candidate:1 1 udp 2130706431 192.168.1.9 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  aliceWs.send({ type: 'call:ice', callId: 'call-test-1', candidate });
  const iceAtBob = await bobWs.next('call:ice');
  assert.equal(iceAtBob.candidate.candidate, candidate.candidate);
  log('ICE 候选转发');

  const busy = await (async () => {
    const third = await api('/api/register', { method: 'POST', body: { id: 'carol', name: 'Carol', password: 'secret123' } });
    await api('/api/contacts', { method: 'POST', body: { id: 'bob' }, token: third.data.token });
    const carolWs = await makeClient(third.data.token, 'carol-web');
    await carolWs.next('ready');
    carolWs.send({ type: 'call:invite', callId: 'call-busy', to: 'bob', mode: 'audio' });
    const err = await carolWs.next('error');
    carolWs.ws.close();
    return err;
  })();
  assert.equal(busy.code, 'busy_peer');
  log('被叫忙线时拒绝新呼叫');

  bobWs.send({ type: 'call:hangup', callId: 'call-test-1' });
  const ended = await aliceWs.next('call:ended');
  assert.equal(ended.reason, 'hangup');
  log('挂断通知对端');

  // 模拟手机锁屏/切网：被叫连接断开后重连，仍可用新连接接听
  aliceWs.send({ type: 'call:invite', callId: 'call-reconnect', to: 'bob', mode: 'audio' });
  await aliceWs.next('call:ringing');
  await bobWs.next('call:incoming');
  bobWs.ws.close();
  bobWs = await makeClient(bob.data.token, 'bob-android-2');
  await bobWs.next('ready');
  await aliceWs.next('presence', 6000);
  const backOnline = await aliceWs.next('presence', 6000);
  assert.equal(backOnline.online, true);
  bobWs.send({ type: 'call:accept', callId: 'call-reconnect' });
  const reconnectAccepted = await aliceWs.next('call:accepted');
  assert.equal(reconnectAccepted.callId, 'call-reconnect');
  aliceWs.send({ type: 'call:sdp', callId: 'call-reconnect', sdp: { type: 'offer', sdp: 'v=0\r\n' } });
  const reconnectedOffer = await bobWs.next('call:sdp');
  assert.equal(reconnectedOffer.callId, 'call-reconnect');
  log('被叫重连后仍可接听并完成 SDP 转发');

  // 通话中短暂断线：宽限期（600ms）内重连，呼叫不应结束，离线期间的 ICE 会补发
  bobWs.ws.close();
  await aliceWs.next('presence', 6000);
  aliceWs.send({ type: 'call:ice', callId: 'call-reconnect', candidate: { candidate: 'candidate:2 1 udp 1 192.168.1.9 54401 typ host' } });
  bobWs = await makeClient(bob.data.token, 'bob-android-3');
  await bobWs.next('ready');
  await aliceWs.next('presence', 6000);
  const queuedIce = await bobWs.next('call:ice', 4000);
  assert.equal(queuedIce.callId, 'call-reconnect');
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(!aliceWs.queue.some((m) => m.type === 'call:ended'), '宽限内重连不应结束通话');
  bobWs.send({ type: 'call:hangup', callId: 'call-reconnect' });
  await aliceWs.next('call:ended');
  log('通话中重连后呼叫保持，离线期间的 ICE 已补发');

  bobWs.ws.close();
  const offline = await aliceWs.next('presence', 6000);
  assert.equal(offline.online, false);
  log('设备下线后推送离线状态');

  const unread = await api('/api/contacts', { token: alice.data.token });
  assert.equal(unread.data.contacts[0].online, false);
  log('REST 联系人状态与服务端一致');

  process.stdout.write('\n所有信令测试通过 ✅\n\n');
}

main()
  .catch((err) => {
    console.error('\n测试失败 ❌');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const ws of sockets) {
      try { ws.close(); } catch { /* 忽略 */ }
    }
    if (server) server.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });
