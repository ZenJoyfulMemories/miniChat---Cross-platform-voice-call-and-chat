'use strict';

const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const OPEN = WebSocket.OPEN;

class Signaling {
  constructor({ store, tokens, config, log = console }) {
    this.store = store;
    this.tokens = tokens;
    this.config = config;
    this.log = log;
    this.conns = new Map();
    this.byUser = new Map();
    this.calls = new Map();
    this.seq = 0;
    this.heartbeat = null;
  }

  attach(httpServer, wssPath = '/ws') {
    if (!this.wss) {
      this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
      this.wss.on('connection', (ws, req, uid, url) => {
        this.register(ws, uid, url, req);
      });
      this.startHeartbeat();
    }
    httpServer.on('upgrade', (req, socket, head) => {
      let url;
      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        socket.destroy();
        return;
      }
      if (url.pathname !== wssPath) {
        socket.destroy();
        return;
      }
      const uid = this.tokens.verify(url.searchParams.get('token'));
      if (!uid || !this.store.get(uid)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req, uid, url);
      });
    });
    return this;
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      for (const conn of this.conns.values()) {
        if (!conn.alive && now - conn.lastSeen > 90000) {
          conn.ws.terminate();
          continue;
        }
        conn.alive = false;
        try {
          conn.ws.ping();
        } catch {
          /* 连接已断开，close 事件会清理 */
        }
      }
    }, 30000);
    this.heartbeat.unref?.();
    return this;
  }

  register(ws, uid, url, req) {
    const conn = {
      id: `c${++this.seq}`,
      uid,
      ws,
      deviceId: String(url.searchParams.get('deviceId') || 'unknown').slice(0, 64),
      platform: String(url.searchParams.get('platform') || 'web').slice(0, 16),
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0],
      callId: null,
      alive: true,
      lastSeen: Date.now(),
      msgWindow: []
    };
    this.conns.set(conn.id, conn);
    if (!this.byUser.has(uid)) this.byUser.set(uid, new Set());
    const isFirstDevice = this.byUser.get(uid).size === 0;
    this.byUser.get(uid).add(conn);
    this.log.info?.(`[ws] ${uid} 上线 (${conn.platform}/${conn.deviceId}) ip=${conn.ip || '?'} 设备数=${this.byUser.get(uid).size}`);

    ws.on('pong', () => {
      conn.alive = true;
      conn.lastSeen = Date.now();
    });
    ws.on('message', (data) => this.onMessage(conn, data));
    ws.on('close', () => this.unregister(conn));
    ws.on('error', () => {});

    const user = this.store.get(uid);
    this.send(conn, {
      type: 'ready',
      user: { id: user.id, name: user.name, avatar: user.avatar || '' },
      contacts: this.contactsWithPresence(user),
      deviceId: conn.deviceId,
      serverTime: Date.now()
    });
    // 补发断线期间错过的 SDP/ICE（手机切网、锁屏重连时常见）
    for (const call of this.calls.values()) {
      const involved = call.caller.uid === uid || call.toUid === uid
        || (call.callee && call.callee.uid === uid);
      if (involved) this.flushPending(call, conn);
    }
    this.send(conn, { type: 'chat:conversations', conversations: this.store.conversationsFor(uid) });
    if (isFirstDevice) this.broadcastPresence(user, true);
  }

  unregister(conn) {
    if (!this.conns.delete(conn.id)) return;
    const set = this.byUser.get(conn.uid);
    if (set) {
      set.delete(conn);
      if (set.size === 0) this.byUser.delete(conn.uid);
    }
    if (conn.callId) {
      const call = this.calls.get(conn.callId);
      // 响铃阶段断线（手机锁屏/切网重连）不结束呼叫，等接听或超时
      if (call && call.state === 'ringing') {
        // 保持响铃
      } else if (call) {
        // 通话中短暂断线（手机解锁、切网）给重连宽限，避免媒体正常却被误挂断
        this.scheduleDisconnect(call, conn);
      }
    }
    const user = this.store.get(conn.uid);
    if (user && !this.byUser.has(conn.uid)) this.broadcastPresence(user, false);
    this.log.info?.(`[ws] ${conn.uid} 下线 (${conn.platform}/${conn.deviceId})`);
  }

  send(conn, payload) {
    if (!conn || conn.ws.readyState !== OPEN) return false;
    try {
      conn.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  sendUser(uid, payload, exceptConnId) {
    const set = this.byUser.get(uid);
    if (!set) return 0;
    let count = 0;
    for (const conn of set) {
      if (conn.id === exceptConnId) continue;
      if (this.send(conn, payload)) count += 1;
    }
    return count;
  }

  isOnline(uid) {
    return this.byUser.has(uid);
  }

  contactsWithPresence(user) {
    return this.store.contactsOf(user).map((c) => ({ ...c, online: this.isOnline(c.id) }));
  }

  broadcastPresence(user, online) {
    for (const cid of user.contacts) {
      const contact = this.store.get(cid);
      if (!contact || !this.isOnline(cid)) continue;
      this.sendUser(cid, { type: 'presence', user: { id: user.id, name: user.name }, online });
    }
  }

  rateLimited(conn) {
    const now = Date.now();
    conn.lastSeen = now;
    conn.msgWindow = conn.msgWindow.filter((t) => now - t < 10000);
    conn.msgWindow.push(now);
    return conn.msgWindow.length > 120;
  }

  onMessage(conn, data) {
    if (this.rateLimited(conn)) {
      conn.ws.close(1008, 'rate limited');
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return this.fail(conn, 'bad_message', '消息格式错误');
    }
    if (!msg || typeof msg.type !== 'string') return this.fail(conn, 'bad_message', '缺少消息类型');

    switch (msg.type) {
      case 'ping':
        return this.send(conn, { type: 'pong', t: msg.t || Date.now() });
      case 'hello':
        if (msg.deviceId) conn.deviceId = String(msg.deviceId).slice(0, 64);
        if (msg.platform) conn.platform = String(msg.platform).slice(0, 16);
        return;
      case 'contacts:refresh': {
        const user = this.store.get(conn.uid);
        return this.send(conn, { type: 'contacts', contacts: this.contactsWithPresence(user) });
      }
      case 'call:status': {
        // 重连后核对呼叫是否仍然存在，避免页面停留在已失效的通话界面
        const call = this.calls.get(msg.callId);
        const uid = conn.uid;
        const known = call && (call.caller.uid === uid
          || (call.callee && call.callee.uid === uid)
          || call.toUid === uid);
        if (!known) return this.send(conn, { type: 'call:ended', callId: msg.callId, reason: 'disconnect' });
        if (call.state === 'active') conn.callId = call.id;
        return this.send(conn, { type: 'call:status', callId: call.id, state: call.state });
      }
      case 'call:invite':
        return this.invite(conn, msg);
      case 'chat:send':
        return this.chatSend(conn, msg);
      case 'chat:typing':
        return this.chatTyping(conn, msg);
      case 'call:accept':
        return this.accept(conn, msg);
      case 'call:reject':
        return this.reject(conn, msg);
      case 'call:cancel':
        return this.cancel(conn, msg);
      case 'call:hangup':
        return this.hangup(conn, msg);
      case 'call:sdp':
      case 'call:ice':
        return this.relay(conn, msg);
      case 'call:trace':
        this.log.info?.(`[trace] ${new Date().toISOString().slice(11, 23)} ${msg.callId || '-'} ${conn.uid} ${msg.label || '?'}${msg.detail ? ' ' + msg.detail : ''}`);
        return;
      default:
        return this.fail(conn, 'unknown_type', `未知消息类型 ${msg.type}`);
    }
  }

  fail(conn, code, message, extra = {}) {
    this.send(conn, { type: 'error', code, message, ...extra });
  }

  callOf(conn) {
    return conn.callId ? this.calls.get(conn.callId) : null;
  }

  activeCallForUser(uid) {
    for (const call of this.calls.values()) {
      if (call.state !== 'active') continue;
      if (call.caller.uid === uid || (call.callee && call.callee.uid === uid)) return call;
    }
    return null;
  }

  broadcastProfile(user) {
    const payload = {
      type: 'profile',
      user: { id: user.id, name: user.name, avatar: user.avatar || '' }
    };
    this.sendUser(user.id, payload);
    for (const cid of user.contacts) this.sendUser(cid, payload);
  }

  // ---------------- 聊天 ----------------

  chatSend(conn, msg) {
    const user = this.store.get(conn.uid);
    const toId = String(msg.to || '').trim().toLowerCase();
    const text = String(msg.text || '').trim();
    const target = this.store.get(toId);
    const clientId = typeof msg.clientId === 'string' ? msg.clientId : '';

    if (!target) return this.fail(conn, 'not_found', '联系人不存在', { clientId });
    if (toId === conn.uid) return this.fail(conn, 'self', '不能给自己发消息', { clientId });
    if (!this.store.isContact(user, toId)) {
      return this.fail(conn, 'not_contact', '请先添加对方为联系人', { clientId });
    }
    if (!text) return this.fail(conn, 'empty', '消息不能为空', { clientId });
    if (text.length > 2000) return this.fail(conn, 'too_long', '消息不能超过 2000 字', { clientId });

    const message = this.store.addMessage(conn.uid, toId, text);
    this.sendUser(conn.uid, { type: 'chat:sent', message, clientId });
    this.sendUser(toId, { type: 'chat:message', message, from: { id: user.id, name: user.name, avatar: user.avatar || '' } });
    this.log.info?.(`[chat] ${conn.uid} -> ${toId} ${message.id}`);
  }

  chatTyping(conn, msg) {
    const toId = String(msg.to || '').trim().toLowerCase();
    const user = this.store.get(conn.uid);
    if (!user || !this.store.get(toId) || !this.store.isContact(user, toId)) return;
    this.sendUser(toId, { type: 'chat:typing', from: { id: user.id, name: user.name } });
  }

  invite(conn, msg) {
    const callerUser = this.store.get(conn.uid);
    const toId = String(msg.to || '').trim().toLowerCase();
    const targetUser = this.store.get(toId);

    if (!targetUser) return this.fail(conn, 'not_found', '联系人不存在', { callId: msg.callId });
    if (toId === conn.uid) return this.fail(conn, 'self', '不能呼叫自己', { callId: msg.callId });
    if (!this.store.isContact(callerUser, toId)) {
      return this.fail(conn, 'not_contact', '只能呼叫联系人，请先添加对方', { callId: msg.callId });
    }
    if (conn.callId) return this.fail(conn, 'busy', '当前已在通话中', { callId: msg.callId });

    const targetConns = [...(this.byUser.get(toId) || [])];
    if (!targetConns.length) return this.fail(conn, 'offline', '对方当前不在线', { callId: msg.callId });
    if (this.activeCallForUser(toId)) return this.fail(conn, 'busy_peer', '对方正在通话中', { callId: msg.callId });

    const callId = typeof msg.callId === 'string' && msg.callId.length <= 80
      ? msg.callId
      : crypto.randomBytes(8).toString('hex');

    const call = {
      id: callId,
      mode: 'audio',
      state: 'ringing',
      caller: { uid: conn.uid, connId: conn.id, deviceId: conn.deviceId },
      toUid: toId,
      callee: null,
      calleeConns: new Set(targetConns.map((c) => c.id)),
      createdAt: Date.now(),
      timeout: null
    };
    this.calls.set(callId, call);
    conn.callId = callId;

    for (const targetConn of targetConns) {
      this.send(targetConn, {
        type: 'call:incoming',
        callId,
        mode: 'audio',
        from: { id: callerUser.id, name: callerUser.name, avatar: callerUser.avatar || '' },
        at: call.createdAt
      });
    }
    this.send(conn, { type: 'call:ringing', callId, to: { id: targetUser.id, name: targetUser.name } });
    this.log.info?.(`[call] ${callId} ${conn.uid} -> ${toId} 邀请`);

    const ringMs = Math.max(10, Number(this.config.callRingTimeoutSec) || 45) * 1000;
    call.timeout = setTimeout(() => {
      if (this.calls.get(callId) !== call || call.state !== 'ringing') return;
      this.sendUser(call.toUid, { type: 'call:cancelled', callId, reason: 'no-answer' });
      this.sendUser(call.caller.uid, { type: 'call:ended', callId, reason: 'no-answer' });
      this.cleanupCall(call);
    }, ringMs);
    call.timeout.unref?.();
  }

  accept(conn, msg) {
    const call = this.calls.get(msg.callId);
    if (!call || call.state !== 'ringing') return this.fail(conn, 'no_call', '呼叫已结束', { callId: msg.callId });
    // 按用户校验，手机解锁/切网导致重连后仍可接听
    if (conn.uid !== call.toUid) return this.fail(conn, 'not_callee', '你不是该呼叫的接收方', { callId: msg.callId });
    if (this.activeCallForUser(conn.uid)) return this.fail(conn, 'busy', '当前已在通话中', { callId: msg.callId });

    clearTimeout(call.timeout);
    call.state = 'active';
    call.callee = { uid: conn.uid, connId: conn.id, deviceId: conn.deviceId };
    conn.callId = call.id;

    for (const cid of call.calleeConns) {
      if (cid !== conn.id) this.send(this.conns.get(cid), { type: 'call:cancelled', callId: call.id, reason: 'handled' });
    }
    call.calleeConns = new Set([conn.id]);

    const calleeUser = this.store.get(conn.uid);
    const accepted = {
      type: 'call:accepted',
      callId: call.id,
      by: { id: calleeUser.id, name: calleeUser.name, deviceId: conn.deviceId }
    };
    if (!this.sendUser(call.caller.uid, accepted)) {
      // 主叫恰好断线时保留，重连后补发
      this.queueTo(call, call.caller.uid, accepted);
    }
    // 接听后长期没有 SDP/ICE，视为未能建立通话，避免呼叫一直占用
    call.sdpTimer = setTimeout(() => {
      if (this.calls.get(call.id) !== call || call.state !== 'active' || call.sdpSeen) return;
      this.endCall(call, 'timeout', null);
    }, 40000);
    call.sdpTimer.unref?.();
    this.log.info?.(`[call] ${call.id} ${conn.uid} 接听`);
  }

  reject(conn, msg) {
    const call = this.calls.get(msg.callId);
    if (!call || call.state !== 'ringing') return;
    if (conn.uid !== call.toUid) return;
    this.sendUser(call.caller.uid, { type: 'call:rejected', callId: call.id, reason: msg.reason || 'declined' });
    for (const cid of call.calleeConns) {
      if (cid !== conn.id) this.send(this.conns.get(cid), { type: 'call:cancelled', callId: call.id, reason: 'declined' });
    }
    this.cleanupCall(call);
  }

  cancel(conn, msg) {
    const call = this.calls.get(msg.callId);
    if (!call || conn.uid !== call.caller.uid) return;
    this.sendUser(call.toUid, { type: 'call:cancelled', callId: call.id, reason: 'cancelled' });
    this.cleanupCall(call);
  }

  hangup(conn, msg) {
    const call = this.calls.get(msg.callId);
    if (!call || !this.isParticipant(call, conn)) return;
    this.endCall(call, 'hangup', conn);
  }

  isParticipant(call, conn) {
    return call.caller.uid === conn.uid || (call.callee && call.callee.uid === conn.uid);
  }

  relay(conn, msg) {
    const call = this.calls.get(msg.callId);
    if (!call || call.state !== 'active') return;
    let peerUid = null;
    if (conn.uid === call.caller.uid) {
      call.caller.connId = conn.id;
      peerUid = call.callee ? call.callee.uid : null;
    } else if (call.callee && conn.uid === call.callee.uid) {
      call.callee.connId = conn.id;
      peerUid = call.caller.uid;
    }
    if (!peerUid) return;
    // 重连后连接 id 会变化，按用户把 SDP/ICE 投递到对端当前连接
    conn.callId = call.id;
    const payload = {
      type: msg.type,
      callId: call.id,
      from: { id: conn.uid },
      sdp: msg.sdp,
      candidate: msg.candidate
    };
    const delivered = this.sendUser(peerUid, payload);
    if (delivered > 0) {
      // 对端在线并收到后才算协商开始，否则保留超时
      call.sdpSeen = true;
      clearTimeout(call.sdpTimer);
      call.sdpTimer = null;
    } else {
      // 对端短暂离线（手机切网/锁屏）时排队，重连后补发
      this.queueTo(call, peerUid, payload);
    }
    if (msg.type === 'call:sdp') {
      this.log.info?.(`[call] ${call.id} SDP ${msg.sdp && msg.sdp.type} ${conn.uid}->${peerUid} delivered=${delivered}`);
    } else {
      call.iceCount = (call.iceCount || 0) + 1;
      if (call.iceCount <= 8) {
        const raw = (msg.candidate && msg.candidate.candidate) || '';
        const kind = / typ (\w+)/.exec(raw);
        this.log.info?.(`[call] ${call.id} ICE #${call.iceCount} ${conn.uid}->${peerUid} type=${kind ? kind[1] : '?'} delivered=${delivered}`);
      }
    }
  }

  endCall(call, reason, fromConn) {
    if (this.calls.get(call.id) !== call) return;
    this.log.info?.(`[call] ${call.id} 结束 reason=${reason}`);
    const uids = new Set([call.caller.uid]);
    if (call.toUid) uids.add(call.toUid);
    if (call.callee) uids.add(call.callee.uid);
    const payload = {
      type: call.state === 'ringing' ? 'call:cancelled' : 'call:ended',
      callId: call.id,
      reason
    };
    for (const uid of uids) {
      this.sendUser(uid, payload, fromConn ? fromConn.id : undefined);
    }
    this.cleanupCall(call);
  }

  /** 把对端离线期间错过的信令暂存到呼叫上。 */
  queueTo(call, uid, payload) {
    if (!call.pendingRelay) call.pendingRelay = [];
    if (call.pendingRelay.length >= 300) call.pendingRelay.shift();
    call.pendingRelay.push({ uid, payload });
  }

  flushPending(call, conn) {
    if (!call.pendingRelay || !call.pendingRelay.length) return;
    const keep = [];
    let sent = false;
    for (const item of call.pendingRelay) {
      if (item.uid === conn.uid) {
        this.send(conn, item.payload);
        sent = true;
      } else {
        keep.push(item);
      }
    }
    call.pendingRelay = keep;
    if (sent) {
      call.sdpSeen = true;
      clearTimeout(call.sdpTimer);
      call.sdpTimer = null;
    }
  }

  /** 通话中连接断开后给一段重连宽限，期间重新上线则继续通话。 */
  scheduleDisconnect(call, conn) {
    if (!call.offline) call.offline = new Set();
    call.offline.add(conn.uid);
    if (call.disconnectTimer) return;
    call.disconnectTimer = setTimeout(() => {
      call.disconnectTimer = null;
      if (this.calls.get(call.id) !== call) return;
      for (const uid of call.offline) {
        if (!this.byUser.has(uid)) {
          this.endCall(call, 'disconnect', null);
          return;
        }
      }
    }, Math.max(200, Number(this.config.callReconnectGraceMs) || 12000));
    call.disconnectTimer.unref?.();
  }

  cleanupCall(call) {
    clearTimeout(call.timeout);
    clearTimeout(call.sdpTimer);
    clearTimeout(call.disconnectTimer);
    this.calls.delete(call.id);
    for (const conn of this.conns.values()) {
      if (conn.callId === call.id) conn.callId = null;
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const conn of this.conns.values()) conn.ws.close(1001, 'server shutdown');
  }
}

module.exports = { Signaling };
