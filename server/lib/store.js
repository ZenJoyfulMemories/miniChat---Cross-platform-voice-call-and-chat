'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const USER_ID_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MAX_CONTACTS = 300;
const MAX_MESSAGES = 10000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

class Store {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'users.json');
    this.messageFile = path.join(dataDir, 'messages.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.users = new Map();
    this.messages = [];
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const user of raw.users || []) this.users.set(user.id, user);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[store] 读取用户数据失败:', err.message);
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.messageFile, 'utf8'));
      if (Array.isArray(raw.messages)) this.messages = raw.messages;
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[store] 读取消息数据失败:', err.message);
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${this.file}.tmp`;
    const payload = JSON.stringify({ version: 1, users: [...this.users.values()] }, null, 2);
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, this.file);

    const msgTmp = `${this.messageFile}.tmp`;
    fs.writeFileSync(msgTmp, JSON.stringify({ version: 1, messages: this.messages }), 'utf8');
    fs.renameSync(msgTmp, this.messageFile);
  }

  get(id) {
    return this.users.get(String(id || '').trim().toLowerCase());
  }

  publicUser(user) {
    return { id: user.id, name: user.name, avatar: user.avatar || '', createdAt: user.createdAt };
  }

  async register(id, name, password) {
    const uid = String(id || '').trim().toLowerCase();
    if (!USER_ID_RE.test(uid)) {
      throw new HttpError(400, 'invalid_id', '账号需为 3-32 位字母、数字、下划线、点或短横线');
    }
    if (this.users.has(uid)) throw new HttpError(409, 'exists', '该账号已被注册');
    const pwd = String(password || '');
    if (pwd.length < 6 || pwd.length > 128) throw new HttpError(400, 'invalid_password', '密码长度需为 6-128 位');

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(pwd, salt)).toString('hex');
    const user = {
      id: uid,
      name: String(name || uid).trim().slice(0, 24) || uid,
      avatar: '',
      salt,
      hash,
      contacts: [],
      createdAt: new Date().toISOString()
    };
    this.users.set(uid, user);
    this.save();
    return this.publicUser(user);
  }

  async authenticate(id, password) {
    const user = this.get(id);
    // 无论账号是否存在都执行一次 scrypt，避免通过耗时差异探测账号
    const salt = user ? user.salt : '00000000000000000000000000000000';
    const hash = await scrypt(String(password || ''), salt);
    if (!user || !crypto.timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) {
      throw new HttpError(401, 'bad_credentials', '账号或密码不正确');
    }
    return this.publicUser(user);
  }

  contactsOf(user) {
    const out = [];
    for (const cid of user.contacts) {
      const c = this.users.get(cid);
      if (c) out.push({ id: c.id, name: c.name, avatar: c.avatar || '' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  setAvatar(uid, avatar) {
    const user = this.get(uid);
    if (!user) throw new HttpError(401, 'no_session', '登录状态已失效');
    user.avatar = avatar;
    this.save();
    return this.publicUser(user);
  }

  isContact(user, otherId) {
    return user.contacts.includes(otherId);
  }

  addContact(ownerId, contactId) {
    const owner = this.get(ownerId);
    if (!owner) throw new HttpError(401, 'no_session', '登录状态已失效');
    const target = this.get(contactId);
    if (!target) throw new HttpError(404, 'not_found', '未找到该联系人账号');
    if (target.id === owner.id) throw new HttpError(400, 'self', '不能添加自己为联系人');
    if (!owner.contacts.includes(target.id)) {
      if (owner.contacts.length >= MAX_CONTACTS) throw new HttpError(400, 'too_many', '联系人数量已达上限');
      owner.contacts.push(target.id);
      this.save();
    }
    // 互为联系人：一方添加后，双方的联系人列表都会显示对方
    if (!target.contacts.includes(owner.id) && target.contacts.length < MAX_CONTACTS) {
      target.contacts.push(owner.id);
      this.save();
    }
    return this.contactsOf(owner);
  }

  removeContact(ownerId, contactId) {
    const owner = this.get(ownerId);
    if (!owner) throw new HttpError(401, 'no_session', '登录状态已失效');
    owner.contacts = owner.contacts.filter((id) => id !== String(contactId));
    this.save();
    return this.contactsOf(owner);
  }

  // ---------------- 聊天消息 ----------------

  addMessage(fromId, toId, text) {
    const message = {
      id: crypto.randomBytes(8).toString('hex'),
      from: fromId,
      to: toId,
      text,
      at: Date.now()
    };
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    this.save();
    return message;
  }

  conversation(a, b, { limit = 60, before = 0 } = {}) {
    const out = [];
    const max = Math.max(1, Math.min(100, Number(limit) || 60));
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      const msg = this.messages[i];
      if (!((msg.from === a && msg.to === b) || (msg.from === b && msg.to === a))) continue;
      if (before && msg.at >= before) continue;
      out.push(msg);
      if (out.length >= max) break;
    }
    return out.reverse();
  }

  conversationsFor(uid) {
    const map = new Map();
    for (const msg of this.messages) {
      if (msg.from !== uid && msg.to !== uid) continue;
      const peerId = msg.from === uid ? msg.to : msg.from;
      const peer = this.users.get(peerId);
      const prev = map.get(peerId);
      if (!prev || msg.at > prev.lastAt) {
        map.set(peerId, {
          id: peerId,
          name: peer ? peer.name : peerId,
          avatar: peer ? peer.avatar || '' : '',
          lastAt: msg.at,
          lastText: msg.text,
          fromMe: msg.from === uid
        });
      }
    }
    return [...map.values()].sort((x, y) => y.lastAt - x.lastAt);
  }

  search(ownerId, keyword) {
    const q = String(keyword || '').trim().toLowerCase();
    if (q.length < 1) return [];
    const results = [];
    for (const user of this.users.values()) {
      if (user.id === ownerId) continue;
      if (user.id.includes(q) || user.name.toLowerCase().includes(q)) {
        results.push({ id: user.id, name: user.name, avatar: user.avatar || '' });
        if (results.length >= 10) break;
      }
    }
    return results;
  }
}

module.exports = { Store, HttpError, USER_ID_RE };
