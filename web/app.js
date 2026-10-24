/* VoiceCall 网页客户端：账号、联系人、WebRTC 语音通话、安卓桥接 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STORAGE_KEY = 'voicecall.session.v1';
  const DEVICE_KEY = 'voicecall.device.v1';
  const CHAT_READ_KEY = 'voicecall.chatread.v1';
  const UI_KEY = 'voicecall.ui.v1';
  const FAVICON_ALERT = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="9" fill="#b9a4ff"/><path d="M16 6.4c-6.4 0-11.6 4.2-11.6 9.4 0 3 2 5.7 5 7.4l-.9 4.6 4.7-2.2c.9.2 1.9.2 2.8.2 6.4 0 11.6-4.2 11.6-9.4S22.4 6.4 16 6.4z" fill="#1a1033"/><g transform="translate(11.7 10.95) scale(0.39)"><path d="M6.62,10.79c1.44,2.83 3.76,5.14 6.59,6.59l2.2,-2.2c0.27,-0.27 0.67,-0.36 1.02,-0.24 1.12,0.37 2.33,0.57 3.57,0.57 0.55,0 1,0.45 1,1L20,20c0,0.55 -0.45,1 -1,1 -9.39,0 -17,-7.61 -17,-17 0,-0.55 0.45,-1 1,-1h3.5c0.55,0 1,0.45 1,1 0,1.25 0.2,2.45 0.57,3.57 0.11,0.35 0.03,0.74 -0.25,1.02l-2.2,2.2z" fill="#b9a4ff"/></g><circle cx="25" cy="7" r="6" fill="#fa5151" stroke="#0e0f11" stroke-width="2"/></svg>'
  )}`;
  const bridge = window.AndroidBridge || null;

  const I18N = {
    zh: {
      'app.title': 'VoiceCall · 语音聊天',
      'app.version': 'VoiceCall · 局域网语音与聊天',
      'auth.tagline': '校园网语音通话与聊天',
      'auth.point.voice': '实时语音',
      'auth.point.chat': '即时消息',
      'auth.point.lock': '锁屏接听',
      'auth.login': '登录',
      'auth.register': '注册',
      'auth.account': '账号',
      'auth.accountPh': '例如 xiaoming',
      'auth.nickname': '昵称',
      'auth.nicknamePh': '显示给联系人的名字',
      'auth.password': '密码',
      'auth.passwordPh': '至少 6 位',
      'auth.submit': '登录',
      'auth.foot': '同一账号可同时在网页端与手机端在线',
      'nav.chats': '聊天',
      'nav.me': '我',
      'nav.settings': '设置',
      'nav.addContact': '添加联系人',
      'list.searchPh': '搜索聊天',
      'list.searchAllPh': '搜索联系人或聊天',
      'list.emptyTitle': '还没有联系人',
      'list.emptyHint': '点击右上角 + 添加对方账号，即可聊天或通话',
      'list.online': '{n} 在线',
      'list.callAria': '呼叫 {name}',
      'me.changeAvatar': '点击头像更换',
      'me.settings': '设置与权限',
      'net.connected': '已连接',
      'net.connecting': '连接中',
      'net.reconnecting': '重连中',
      'net.online': '在线',
      'net.offline': '离线',
      'net.notLoggedIn': '未登录',
      'net.serviceOffline': '后台服务离线',
      'device.android': '安卓客户端',
      'device.mobile': '移动网页',
      'device.web': '网页端',
      'welcome.hint': '选择聊天开始对话，或在通讯录里发起语音通话',
      'welcome.chip.online': '实时在线',
      'welcome.chip.call': '语音通话',
      'welcome.chip.sync': '消息同步',
      'chat.peer': '联系人',
      'chat.online': '在线',
      'chat.offline': '离线',
      'chat.typing': '正在输入…',
      'chat.messagePh': '发送消息',
      'chat.send': '发送',
      'chat.callAria': '语音呼叫',
      'chat.empty': '还没有消息，打个招呼吧',
      'chat.loading': '加载中…',
      'chat.today': '今天',
      'chat.yesterday': '昨天',
      'chat.date': '{m}月{d}日',
      'chat.prefixMe': '我：',
      'chat.sending': '发送中…',
      'chat.failed': '发送失败',
      'common.back': '返回',
      'common.close': '关闭',
      'common.add': '添加',
      'common.added': '已添加',
      'add.title': '添加联系人',
      'add.desc': '输入对方的账号（不是昵称），添加后即可互相呼叫与聊天',
      'add.searchPh': '搜索账号或昵称',
      'add.empty': '输入账号或昵称开始搜索',
      'add.noMatch': '没有找到匹配的账号',
      'add.addedToast': '已添加 {name}',
      'settings.title': '设置',
      'settings.language': '语言',
      'settings.theme': '外观',
      'settings.theme.dark': '深色',
      'settings.theme.light': '浅色',
      'settings.status': '通话状态',
      'settings.device': '设备',
      'settings.server': '服务器',
      'settings.serverAddr': '服务器地址',
      'settings.logout': '退出登录',
      'incoming.label': '语音来电',
      'incoming.unknown': '未知',
      'incoming.hint': 'VoiceCall 高清语音',
      'incoming.decline': '拒绝',
      'incoming.answer': '接听',
      'call.ringing': '正在呼叫',
      'call.waiting': '等待对方接听…',
      'call.connecting': '正在接通',
      'call.settingUp': '建立加密语音通道…',
      'call.active': '通话中',
      'call.secure': '端到端加密 · 语音通话',
      'call.mute': '静音',
      'call.unmute': '取消静音',
      'call.speaker': '扬声器',
      'call.hangup': '挂断',
      'title.incoming': '来电 · {name}',
      'title.newMessage': '新消息 · {name}',
      'title.calling': '呼叫 · {name}',
      'notification.message': '新消息',
      'media.artist': '语音通话',
      'toast.serverDown': '无法连接服务器，请检查网络',
      'toast.requestFailed': '请求失败 ({status})',
      'toast.bridgeOffline': '安卓后台服务未连接',
      'toast.wsClosed': '与服务器连接已断开',
      'toast.callEndedConn': '连接已断开，通话结束',
      'toast.bridgeFail': '安卓后台服务启动失败',
      'toast.avatarUpdated': '头像已更新',
      'toast.avatarFailed': '头像上传失败',
      'toast.pickImage': '请选择图片文件',
      'toast.readImage': '无法读取图片',
      'toast.parseImage': '图片无法解析',
      'toast.loadChatFailed': '无法加载聊天记录',
      'toast.micLost': '麦克风已断开',
      'toast.voiceFailed': '语音连接失败，请检查网络或 TURN 配置',
      'toast.inCall': '当前正在通话中',
      'toast.notOnline': '尚未连接到服务器',
      'toast.micDenied': '无法使用麦克风',
      'toast.callNotEstablished': '通话未能建立',
      'toast.callFailed': '建立通话失败',
      'toast.negotiationFailed': '通话协商失败',
      'toast.voiceNegotiation': '语音协商失败',
      'toast.newMessage': '新消息 · {name}',
      'toast.speakerOn': '已切换到扬声器',
      'toast.speakerOff': '已切换回听筒',
      'toast.sinkOn': '已切换到默认扬声器',
      'toast.sinkOff': '已切换回系统默认输出',
      'toast.speakerManual': '网页端请使用系统音量或音频输出设备切换',
      'toast.loginExpired': '登录状态已失效',
      'toast.operationFailed': '操作失败',
      'toast.insecure': '当前不是安全连接，请使用 https 地址访问',
      'toast.noMicSupport': '当前浏览器不支持麦克风采集',
      'auth.err.account': '请输入账号',
      'auth.err.password': '请输入密码',
      'auth.err.passwordShort': '密码至少 6 位',
      'auth.signingIn': '登录中…',
      'auth.creating': '创建中…',
      'reject.busy': '对方正在通话中',
      'reject.mic': '对方无法使用麦克风',
      'reject.declined': '对方已拒绝',
      'cancel.handled': '已在其他设备接听',
      'cancel.noAnswer': '未接来电',
      'cancel.cancelled': '对方已取消呼叫',
      'cancel.declined': '已拒绝来电',
      'cancel.disconnect': '对方已断开',
      'ended.noAnswer': '对方无应答',
      'ended.hangup': '通话已结束',
      'ended.disconnect': '对方已断开连接',
      'ended.micLost': '麦克风已断开',
      'ended.failed': '连接失败',
      'ended.timeout': '通话未能建立',
      'err.offline': '对方当前不在线',
      'err.busy': '当前正在通话中',
      'err.busyPeer': '对方正在通话中',
      'err.notContact': '请先添加对方为联系人',
      'err.notFound': '联系人不存在',
      'err.noSession': '登录状态已失效',
      'err.empty': '消息不能为空',
      'err.tooLong': '消息不能超过 2000 字',
      'err.self': '不能给自己发消息'
    },
    en: {
      'app.title': 'VoiceCall · Voice & Chat',
      'app.version': 'VoiceCall · LAN voice & chat',
      'auth.tagline': 'Campus voice calls and chat',
      'auth.point.voice': 'Live voice',
      'auth.point.chat': 'Instant chat',
      'auth.point.lock': 'Answer on lock screen',
      'auth.login': 'Sign in',
      'auth.register': 'Sign up',
      'auth.account': 'Account',
      'auth.accountPh': 'e.g. xiaoming',
      'auth.nickname': 'Nickname',
      'auth.nicknamePh': 'Name shown to contacts',
      'auth.password': 'Password',
      'auth.passwordPh': 'At least 6 characters',
      'auth.submit': 'Sign in',
      'auth.foot': 'One account can stay online on web and mobile at the same time',
      'nav.chats': 'Chats',
      'nav.me': 'Me',
      'nav.settings': 'Settings',
      'nav.addContact': 'Add contact',
      'list.searchPh': 'Search chats',
      'list.searchAllPh': 'Search contacts or chats',
      'list.emptyTitle': 'No contacts yet',
      'list.emptyHint': 'Tap + at the top right to add someone, then chat or call',
      'list.online': '{n} online',
      'list.callAria': 'Call {name}',
      'me.changeAvatar': 'Tap avatar to change',
      'me.settings': 'Settings & permissions',
      'net.connected': 'Connected',
      'net.connecting': 'Connecting',
      'net.reconnecting': 'Reconnecting',
      'net.online': 'Online',
      'net.offline': 'Offline',
      'net.notLoggedIn': 'Not signed in',
      'net.serviceOffline': 'Background service offline',
      'device.android': 'Android app',
      'device.mobile': 'Mobile web',
      'device.web': 'Web',
      'welcome.hint': 'Pick a chat to start talking, or call someone from your contacts',
      'welcome.chip.online': 'Online now',
      'welcome.chip.call': 'Voice calls',
      'welcome.chip.sync': 'Synced messages',
      'chat.peer': 'Contact',
      'chat.online': 'Online',
      'chat.offline': 'Offline',
      'chat.typing': 'Typing…',
      'chat.messagePh': 'Message',
      'chat.send': 'Send',
      'chat.callAria': 'Voice call',
      'chat.empty': 'No messages yet. Say hi!',
      'chat.loading': 'Loading…',
      'chat.today': 'Today',
      'chat.yesterday': 'Yesterday',
      'chat.date': '{m}/{d}',
      'chat.prefixMe': 'Me: ',
      'chat.sending': 'Sending…',
      'chat.failed': 'Failed',
      'common.back': 'Back',
      'common.close': 'Close',
      'common.add': 'Add',
      'common.added': 'Added',
      'add.title': 'Add contact',
      'add.desc': 'Enter their account ID (not nickname) to call and chat with each other',
      'add.searchPh': 'Search account or nickname',
      'add.empty': 'Type an account or nickname to search',
      'add.noMatch': 'No matching account',
      'add.addedToast': 'Added {name}',
      'settings.title': 'Settings',
      'settings.language': 'Language',
      'settings.theme': 'Appearance',
      'settings.theme.dark': 'Dark',
      'settings.theme.light': 'Light',
      'settings.status': 'Connection',
      'settings.device': 'Device',
      'settings.server': 'Server',
      'settings.serverAddr': 'Server address',
      'settings.logout': 'Sign out',
      'incoming.label': 'Incoming voice call',
      'incoming.unknown': 'Unknown',
      'incoming.hint': 'VoiceCall HD audio',
      'incoming.decline': 'Decline',
      'incoming.answer': 'Answer',
      'call.ringing': 'Calling',
      'call.waiting': 'Waiting for answer…',
      'call.connecting': 'Connecting',
      'call.settingUp': 'Setting up encrypted audio…',
      'call.active': 'In call',
      'call.secure': 'End-to-end encrypted · voice call',
      'call.mute': 'Mute',
      'call.unmute': 'Unmute',
      'call.speaker': 'Speaker',
      'call.hangup': 'Hang up',
      'title.incoming': 'Incoming · {name}',
      'title.newMessage': 'New message · {name}',
      'title.calling': 'Calling · {name}',
      'notification.message': 'New message',
      'media.artist': 'Voice call',
      'toast.serverDown': 'Cannot reach the server. Check your network',
      'toast.requestFailed': 'Request failed ({status})',
      'toast.bridgeOffline': 'Android background service is offline',
      'toast.wsClosed': 'Disconnected from server',
      'toast.callEndedConn': 'Connection lost. Call ended',
      'toast.bridgeFail': 'Failed to start the Android background service',
      'toast.avatarUpdated': 'Avatar updated',
      'toast.avatarFailed': 'Avatar upload failed',
      'toast.pickImage': 'Please choose an image file',
      'toast.readImage': 'Could not read the image',
      'toast.parseImage': 'Could not decode the image',
      'toast.loadChatFailed': 'Could not load messages',
      'toast.micLost': 'Microphone disconnected',
      'toast.voiceFailed': 'Voice connection failed. Check network or TURN settings',
      'toast.inCall': 'You are already in a call',
      'toast.notOnline': 'Not connected to the server',
      'toast.micDenied': 'Microphone unavailable',
      'toast.callNotEstablished': 'Call could not be established',
      'toast.callFailed': 'Failed to start call',
      'toast.negotiationFailed': 'Call negotiation failed',
      'toast.voiceNegotiation': 'Voice negotiation failed',
      'toast.newMessage': 'New message · {name}',
      'toast.speakerOn': 'Switched to speaker',
      'toast.speakerOff': 'Switched to earpiece',
      'toast.sinkOn': 'Switched to default speaker',
      'toast.sinkOff': 'Switched to system default output',
      'toast.speakerManual': 'Use system audio output to switch speakers on web',
      'toast.loginExpired': 'Session expired. Please sign in again',
      'toast.operationFailed': 'Operation failed',
      'toast.insecure': 'Not a secure connection. Use an https address',
      'toast.noMicSupport': 'This browser does not support microphone capture',
      'auth.err.account': 'Enter your account',
      'auth.err.password': 'Enter your password',
      'auth.err.passwordShort': 'Password must be at least 6 characters',
      'auth.signingIn': 'Signing in…',
      'auth.creating': 'Creating…',
      'reject.busy': 'The other person is on another call',
      'reject.mic': 'The other person cannot use their microphone',
      'reject.declined': 'Call declined',
      'cancel.handled': 'Answered on another device',
      'cancel.noAnswer': 'Missed call',
      'cancel.cancelled': 'Call cancelled',
      'cancel.declined': 'Call declined',
      'cancel.disconnect': 'The other person disconnected',
      'ended.noAnswer': 'No answer',
      'ended.hangup': 'Call ended',
      'ended.disconnect': 'The other person disconnected',
      'ended.micLost': 'Microphone disconnected',
      'ended.failed': 'Connection failed',
      'ended.timeout': 'Call could not be established',
      'err.offline': 'The other person is offline',
      'err.busy': 'You are already in a call',
      'err.busyPeer': 'The other person is on another call',
      'err.notContact': 'Add them as a contact first',
      'err.notFound': 'Contact not found',
      'err.noSession': 'Session expired',
      'err.empty': 'Message cannot be empty',
      'err.tooLong': 'Message cannot exceed 2000 characters',
      'err.self': 'You cannot message yourself'
    }
  };

  let lang = 'zh';
  let theme = 'dark';

  function t(key, vars) {
    const table = I18N[lang] || I18N.zh;
    let text = table[key] !== undefined ? table[key] : (I18N.zh[key] !== undefined ? I18N.zh[key] : key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  }

  function loadUiPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_KEY) || 'null') || {};
      lang = saved.lang === 'en' ? 'en' : 'zh';
      theme = saved.theme === 'light' ? 'light' : 'dark';
    } catch {
      lang = 'zh';
      theme = 'dark';
    }
  }

  function saveUiPrefs() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ lang, theme }));
    } catch { /* 隐私模式下忽略 */ }
  }

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f5f3fa' : '#0e0f11';
  }

  function applyStaticText() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');
    $$('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
    $$('[data-i18n-ph]').forEach((node) => { node.placeholder = t(node.dataset.i18nPh); });
    $$('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
    $$('#lang-seg button').forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === lang));
    $$('#theme-seg button').forEach((btn) => btn.classList.toggle('active', btn.dataset.themeOpt === theme));
  }

  /** 语言切换后刷新所有动态文案，保持当前界面状态。 */
  function refreshText() {
    applyStaticText();
    if (state.user) renderProfile();
    renderListNow();
    if (state.chat.peer) {
      renderMessages();
      updateChatStatus();
      if (state.chat.loading) {
        $('#chat-empty').textContent = t('chat.loading');
        $('#chat-empty').classList.add('loading');
      }
    }
    switchTab(state.tab || 'chats');
    setNet(state.online, state.online ? 'net.connected' : (state.token ? 'net.connecting' : 'net.notLoggedIn'));
    if (state.call) setCallPhase(state.call.phase);
    setAuthMode(state.authMode);
    updateSendButton();
  }

  function setLanguage(next) {
    lang = next === 'en' ? 'en' : 'zh';
    saveUiPrefs();
    refreshText();
  }

  function setTheme(next) {
    applyTheme(next);
    saveUiPrefs();
  }

  const state = {
    token: '',
    user: null,
    contacts: new Map(),
    online: false,
    deviceId: '',
    platform: bridge ? 'android' : 'web',
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    ws: null,
    wsRetry: 0,
    wsTimer: null,
    pingTimer: null,
    call: null,
    pc: null,
    localStream: null,
    remoteStream: null,
    pendingCandidates: [],
    micPromise: null,
    callTimer: null,
    answerTimer: null,
    dismissedCalls: new Set(),
    chat: { peer: null, messages: [], loading: false, typingTimer: null, closeTimer: null },
    conversations: new Map(),
    chatRead: new Map(),
    tab: 'chats',
    soundTimer: null,
    vibrateTimer: null,
    audioCtx: null,
    analyser: null,
    waveRaf: null,
    waveFallback: null,
    titleTimer: null,
    authMode: 'login',
    addResults: [],
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const icon = (name) => `<svg><use href="#i-${name}"/></svg>`;

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function initial(name) {
    const clean = String(name || '?').trim();
    if (!clean) return '?';
    const first = [...clean][0];
    return /[a-z]/i.test(first) ? first.toUpperCase() : first;
  }

  function gradientClass(id) {
    return `g${(hash(String(id || '')) % 5) + 1}`;
  }

  function paintAvatar(node, name, id, avatar) {
    if (!node) return;
    const keepPulse = node.classList.contains('pulse');
    const big = node.classList.contains('big-avatar');
    const meBig = node.classList.contains('me-big');
    const photo = Boolean(avatar && /^data:image\//.test(avatar));
    node.className = `${big ? 'big-avatar' : 'avatar'}${meBig ? ' me-big' : ''} `
      + `${photo ? 'has-photo' : gradientClass(id)}${keepPulse ? ' pulse' : ''}`;
    node.textContent = '';
    if (photo) {
      const img = document.createElement('img');
      img.src = avatar;
      img.alt = '';
      img.decoding = 'async';
      node.appendChild(img);
    } else {
      node.textContent = initial(name);
    }
  }

  function avatarEl(name, id, avatar, className = 'avatar') {
    const node = el('div', className);
    paintAvatar(node, name, id, avatar);
    return node;
  }

  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  let toastTimer = null;
  function toast(message, duration = 2600) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.remove('hidden');
    requestAnimationFrame(() => node.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.classList.add('hidden'), 280);
    }, duration);
  }

  function setError(message) {
    const node = $('#auth-error');
    node.textContent = message || '';
    node.classList.toggle('show', Boolean(message));
  }

  function showAuth() {
    $('#home').classList.add('hidden');
    $('#auth').classList.remove('hidden');
    const tabBar = $('#tab-bar');
    if (tabBar) tabBar.classList.add('hidden');
    setTimeout(() => $('#auth-id').focus(), 320);
  }

  async function showHome() {
    $('#auth').classList.add('hidden');
    $('#home').classList.remove('hidden');
    const tabBar = $('#tab-bar');
    if (tabBar) tabBar.classList.remove('hidden');
    renderProfile();
    renderContacts();
    renderChats();
    switchTab(state.tab || 'chats');
  }

  // ---------------- API ----------------
  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error(t('toast.serverDown'));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || t('toast.requestFailed', { status: res.status }));
    return data;
  }

  async function fetchIce() {
    try {
      const data = await api('/api/ice');
      if (Array.isArray(data.iceServers) && data.iceServers.length) state.iceServers = data.iceServers;
    } catch { /* 使用默认 STUN */ }
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: state.token,
        user: state.user,
        contacts: [...state.contacts.values()]
      }));
    } catch { /* 隐私模式下忽略 */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* 忽略 */ }
  }

  // ---------------- 传输层 ----------------
  function send(payload) {
    if (bridge) {
      try {
        bridge.send(JSON.stringify(payload));
      } catch {
        toast(t('toast.bridgeOffline'));
      }
      return;
    }
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    } else {
      toast(t('toast.wsClosed'));
    }
  }

  function setNet(online, key) {
    state.online = online;
    const node = $('#net-status');
    node.classList.toggle('off', !online);
    node.querySelector('em').textContent = t(key || (online ? 'net.connected' : 'net.connecting'));
    $('#settings-net').textContent = t(online ? 'net.online' : 'net.offline');
    const indicator = $('#net-indicator');
    if (indicator) indicator.classList.toggle('off', !online);
  }

  function wsURL() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws?token=${encodeURIComponent(state.token)}&deviceId=${encodeURIComponent(state.deviceId)}&platform=${state.platform}`;
  }

  function connectWS() {
    if (bridge || !state.token) return;
    clearTimeout(state.wsTimer);
    if (state.ws) {
      try { state.ws.onclose = null; state.ws.close(); } catch { /* 忽略 */ }
    }
    setNet(false, 'net.connecting');
    let ws;
    try {
      ws = new WebSocket(wsURL());
    } catch {
      scheduleReconnect();
      return;
    }
    state.ws = ws;

    ws.onopen = () => {
      state.wsRetry = 0;
      setNet(true, 'net.connected');
      if (state.call) {
        try { ws.send(JSON.stringify({ type: 'call:status', callId: state.call.id })); } catch { /* 忽略 */ }
      }
      clearInterval(state.pingTimer);
      state.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }, 25000);
    };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleServerMessage(msg);
    };
    ws.onclose = () => {
      clearInterval(state.pingTimer);
      setNet(false, 'net.reconnecting');
      if (state.call) {
        resetCallState();
        toast(t('toast.callEndedConn'));
      }
      if (state.token) scheduleReconnect();
    };
    ws.onerror = () => { /* onclose 统一处理 */ };
  }

  function scheduleReconnect() {
    if (bridge) return;
    state.wsRetry = Math.min(state.wsRetry + 1, 8);
    const delay = Math.min(1000 * Math.pow(1.7, state.wsRetry), 15000);
    clearTimeout(state.wsTimer);
    state.wsTimer = setTimeout(connectWS, delay);
  }

  // ---------------- 登录 ----------------
  function setAuthMode(mode) {
    state.authMode = mode;
    const seg = $('#segmented');
    seg.dataset.mode = mode;
    $$('#segmented button').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    $('#name-field').classList.toggle('hidden', mode === 'login');
    $('#auth-submit').textContent = mode === 'login' ? t('auth.login') : t('auth.register');
    $('#auth-pwd').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    setError('');
  }

  async function submitAuth(event) {
    event.preventDefault();
    requestNotifyPermission();
    const id = $('#auth-id').value.trim();
    const name = $('#auth-name').value.trim();
    const password = $('#auth-pwd').value;
    if (!id) return setError(t('auth.err.account'));
    if (!password) return setError(t('auth.err.password'));
    if (state.authMode === 'register' && password.length < 6) return setError(t('auth.err.passwordShort'));

    const button = $('#auth-submit');
    button.disabled = true;
    button.textContent = state.authMode === 'login' ? t('auth.signingIn') : t('auth.creating');
    setError('');
    try {
      const data = await api(state.authMode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        auth: false,
        body: { id, name, password }
      });
      state.token = data.token;
      state.user = data.user;
      state.contacts = new Map((data.contacts || []).map((c) => [c.id, c]));
      saveSession();
      await showHome();
      startTransport();
      loadConversations();
      $('#auth-pwd').value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      button.disabled = false;
      button.textContent = state.authMode === 'login' ? t('auth.login') : t('auth.register');
    }
  }

  function startTransport() {
    if (bridge) {
      try {
        bridge.onLogin(state.token, state.user.id, state.user.name);
        bridge.onBridgeReady();
      } catch (err) {
        toast(t('toast.bridgeFail'));
      }
      return;
    }
    fetchIce();
    connectWS();
  }

  function logout() {
    if (state.call) hangup('logout');
    if (bridge) {
      try { bridge.onLogout(); } catch { /* 忽略 */ }
    }
    if (state.ws) {
      try { state.ws.onclose = null; state.ws.close(); } catch { /* 忽略 */ }
      state.ws = null;
    }
    clearInterval(state.pingTimer);
    clearTimeout(state.wsTimer);
    state.token = '';
    state.user = null;
    state.contacts.clear();
    state.conversations.clear();
    state.tab = 'chats';
    closeChat();
    setNet(false, 'net.notLoggedIn');
    clearSession();
    closeSheet('sheet-settings');
    showAuth();
  }

  // ---------------- 联系人 ----------------
  function renderProfile() {
    if (!state.user) return;
    const avatar = state.user.avatar || '';
    paintAvatar($('#me-avatar'), state.user.name, state.user.id, avatar);
    paintAvatar($('#settings-avatar'), state.user.name, state.user.id, avatar);
    const railAvatar = $('#rail-avatar');
    if (railAvatar) {
      railAvatar.textContent = '';
      if (/^data:image\//.test(avatar)) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = '';
        railAvatar.appendChild(img);
      } else {
        railAvatar.textContent = initial(state.user.name);
      }
    }
    $('#me-name').textContent = state.user.name;
    $('#me-id').textContent = `@${state.user.id}`;
    $('#settings-name').textContent = state.user.name;
    $('#settings-id').textContent = `@${state.user.id}`;
    $('#settings-server').textContent = location.origin;
    $('#settings-device').textContent = bridge
      ? t('device.android')
      : (/Mobi|Android/i.test(navigator.userAgent) ? t('device.mobile') : t('device.web'));
    const settingsServer = $('#btn-server-config');
    if (settingsServer) settingsServer.hidden = !bridge;
  }

  function contactLabel(contact) {
    return contact.online ? t('chat.online') : t('chat.offline');
  }

  function squareAvatar(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error(t('toast.pickImage')));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t('toast.readImage')));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error(t('toast.parseImage')));
        img.onload = () => {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#1b1c1f';
          ctx.fillRect(0, 0, size, size);
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadAvatar(file) {
    try {
      const avatar = await squareAvatar(file);
      const data = await api('/api/profile/avatar', { method: 'POST', body: { avatar } });
      state.user = { ...state.user, ...(data.user || {}), avatar };
      saveSession();
      renderProfile();
      toast(t('toast.avatarUpdated'));
    } catch (err) {
      toast(err.message || t('toast.avatarFailed'));
    }
  }

  let listRenderQueued = false;
  function scheduleListRender() {
    if (listRenderQueued) return;
    listRenderQueued = true;
    requestAnimationFrame(() => {
      listRenderQueued = false;
      renderListNow();
    });
  }

  // 聊天与通讯录合并为同一个列表
  function renderContacts() {
    scheduleListRender();
  }

  function renderChats() {
    scheduleListRender();
  }

  function renderListNow() {
    const list = $('#chat-list');
    if (!list) return;
    const keyword = $('#contact-search').value.trim().toLowerCase();
    const rows = [];
    const seen = new Set();

    for (const contact of state.contacts.values()) {
      seen.add(contact.id);
      rows.push({ contact, conv: state.conversations.get(contact.id) || null });
    }
    for (const conv of state.conversations.values()) {
      if (seen.has(conv.id)) continue;
      rows.push({
        contact: {
          id: conv.id,
          name: conv.name || conv.id,
          avatar: conv.avatar || '',
          online: Boolean(conv.online)
        },
        conv
      });
    }

    const filtered = rows.filter(({ contact }) => !keyword
      || contact.id.includes(keyword)
      || String(contact.name || '').toLowerCase().includes(keyword));

    filtered.sort((a, b) => {
      const at = a.conv ? a.conv.lastAt : 0;
      const bt = b.conv ? b.conv.lastAt : 0;
      if (at !== bt) return bt - at;
      return (Number(b.contact.online) - Number(a.contact.online))
        || String(a.contact.name).localeCompare(String(b.contact.name), lang === 'en' ? 'en' : 'zh-CN');
    });

    list.textContent = '';
    for (const { contact, conv } of filtered) {
      const unread = isChatUnread(contact.id);
      const li = el('li', `contact${contact.online ? '' : ' offline'}${unread ? ' unread' : ''}`);
      const av = avatarEl(contact.name, contact.id, contact.avatar);
      if (contact.online) av.appendChild(el('span', 'dot'));
      if (unread) av.appendChild(el('span', 'msg-dot'));

      const meta = el('div', 'contact-meta');
      const top = el('div', 'row-top');
      top.appendChild(el('strong', '', contact.name));
      if (conv) top.appendChild(el('span', 'row-time', chatListTime(conv.lastAt)));
      meta.appendChild(top);

      const preview = conv
        ? `${conv.fromMe ? t('chat.prefixMe') : ''}${conv.lastText || ''}`
        : '';
      if (preview) {
        const sub = el('span', 'contact-sub', preview);
        sub.title = preview;
        meta.appendChild(sub);
      }

      const call = el('button', 'contact-call');
      call.type = 'button';
      call.setAttribute('aria-label', t('list.callAria', { name: contact.name }));
      call.innerHTML = icon('phone');
      call.addEventListener('click', (event) => {
        event.stopPropagation();
        startCall(contact);
      });

      li.append(av, meta, call);
      li.addEventListener('click', () => openChat(contact));
      list.appendChild(li);
    }

    const online = [...state.contacts.values()].filter((c) => c.online).length;
    $('#online-count').textContent = t('list.online', { n: online });
    $('#empty-chats').classList.toggle('hidden', filtered.length > 0);
  }

  function chatListTime(ts) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= start) return chatTime(ts);
    if (ts >= start - 86400000) return t('chat.yesterday');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function switchTab(tab) {
    const next = tab === 'me' ? 'me' : 'chats';
    state.tab = next;
    $$('[data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === next));

    $('#pane-chats').classList.toggle('hidden', next !== 'chats');
    $('#pane-me').classList.toggle('hidden', next !== 'me');
    $('#list-title').textContent = next === 'chats' ? t('nav.chats') : t('nav.me');
    const title = $('#list-title');
    title.classList.remove('title-swap');
    void title.offsetWidth;
    title.classList.add('title-swap');
    $('#btn-add').classList.toggle('hidden', next === 'me');
    $('#online-count').classList.toggle('hidden', next === 'me');
    $('#search-wrap').classList.toggle('hidden', next === 'me');

    const input = $('#contact-search');
    input.value = '';
    input.placeholder = t('list.searchAllPh');
    if (next === 'chats') scheduleListRender();
  }

  function upsertContact(contact) {
    const prev = state.contacts.get(contact.id) || {};
    state.contacts.set(contact.id, { ...prev, ...contact });
    renderContacts();
    renderChats();
    saveSession();
    if (state.chat.peer && state.chat.peer.id === contact.id) {
      state.chat.peer = { ...state.chat.peer, ...contact };
      updateChatStatus();
    }
  }

  // ---------------- 聊天 ----------------
  function loadChatRead() {
    try {
      state.chatRead = new Map(Object.entries(JSON.parse(localStorage.getItem(CHAT_READ_KEY) || '{}')));
    } catch {
      state.chatRead = new Map();
    }
  }

  function saveChatRead() {
    try {
      const obj = {};
      for (const [key, value] of state.chatRead) obj[key] = value;
      localStorage.setItem(CHAT_READ_KEY, JSON.stringify(obj));
    } catch { /* 忽略 */ }
  }

  function markChatRead(id) {
    if (!id) return;
    state.chatRead.set(id, Date.now());
    saveChatRead();
  }

  function isChatUnread(id) {
    const conv = state.conversations.get(id);
    if (!conv || conv.fromMe) return false;
    return conv.lastAt > (state.chatRead.get(id) || 0);
  }

  function updateConversation(message) {
    if (!message || !message.from || !message.to) return;
    const mine = Boolean(state.user && message.from === state.user.id);
    const peerId = mine ? message.to : message.from;
    state.conversations.set(peerId, {
      id: peerId,
      lastAt: message.at || Date.now(),
      lastText: message.text || '',
      fromMe: mine
    });
  }

  async function loadConversations() {
    if (!state.token) return;
    try {
      const data = await api('/api/conversations');
      state.conversations = new Map((data.conversations || []).map((c) => [c.id, c]));
      renderChats();
      renderContacts();
    } catch { /* 忽略 */ }
  }

  function chatDay(ts) {
    const date = new Date(ts);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= start) return t('chat.today');
    if (ts >= start - 86400000) return t('chat.yesterday');
    return t('chat.date', { m: date.getMonth() + 1, d: date.getDate() });
  }

  function chatTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderMessages() {
    const list = $('#chat-messages');
    list.textContent = '';
    let lastDay = '';
    for (const m of state.chat.messages) {
      const day = chatDay(m.at);
      if (day !== lastDay) {
        lastDay = day;
        list.appendChild(el('li', 'chat-day', day));
      }
      const mine = Boolean(state.user && m.from === state.user.id);
      const li = el('li', `msg ${mine ? 'mine' : 'theirs'}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}`);
      li.appendChild(el('div', 'bubble', m.text));
      li.appendChild(el('time', '', m.failed ? t('chat.failed') : (m.pending ? t('chat.sending') : chatTime(m.at))));
      list.appendChild(li);
    }
    $('#chat-empty').classList.toggle('hidden', state.chat.messages.length > 0);
  }

  function scrollChatBottom() {
    requestAnimationFrame(() => {
      const body = $('#chat-body');
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  function updateSendButton() {
    $('#chat-send').disabled = !$('#chat-input').value.trim();
  }

  function updateChatStatus() {
    if (!state.chat.peer) return;
    $('#chat-status').textContent = state.chat.peer.online ? t('chat.online') : '';
  }

  async function openChat(contact) {
    if (!contact) return;
    clearTimeout(state.chat.closeTimer);
    state.chat.closeTimer = null;
    const pane = $('#chat');
    pane.classList.remove('hidden', 'closing');
    $('#welcome').classList.add('hidden');
    state.chat.peer = contact;
    state.chat.messages = [];
    state.chat.loading = true;
    $('#chat-name').textContent = contact.name;
    paintAvatar($('#chat-avatar'), contact.name, contact.id, contact.avatar);
    updateChatStatus();
    $('#chat-messages').textContent = '';
    $('#chat-empty').textContent = t('chat.loading');
    $('#chat-empty').classList.add('loading');
    $('#chat-empty').classList.remove('hidden');
    $('#chat-input').value = '';
    updateSendButton();

    try {
      const data = await api(`/api/messages?with=${encodeURIComponent(contact.id)}&limit=100`);
      if (!state.chat.peer || state.chat.peer.id !== contact.id) return;
      state.chat.messages = (data.messages || []).map((m) => ({ ...m }));
    } catch (err) {
      toast(err.message || t('toast.loadChatFailed'));
    }
    state.chat.loading = false;
    $('#chat-empty').classList.remove('loading');
    $('#chat-empty').textContent = t('chat.empty');
    renderMessages();
    markChatRead(contact.id);
    clearChatAlert();
    renderChats();
    renderContacts();
    scrollChatBottom();
    if (!window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => { $('#chat-input').focus(); }, 120);
    }
  }

  function closeChat() {
    const pane = $('#chat');
    if (!pane || pane.classList.contains('hidden') || state.chat.closeTimer) return;
    pane.style.transform = '';
    pane.style.opacity = '';
    clearTimeout(state.chat.typingTimer);
    state.chat.typingTimer = null;
    state.chat.peer = null;
    state.chat.messages = [];
    state.chat.loading = false;

    const finalize = () => {
      pane.classList.add('hidden');
      pane.classList.remove('closing');
      $('#welcome').classList.remove('hidden');
      state.chat.closeTimer = null;
    };
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile) {
      pane.classList.add('closing');
      state.chat.closeTimer = setTimeout(finalize, 160);
    } else {
      finalize();
    }
  }

  function sendChat() {
    const input = $('#chat-input');
    const text = input.value.trim();
    const peer = state.chat.peer;
    if (!text || !peer || !state.user) return;
    const clientId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const message = {
      id: clientId,
      clientId,
      from: state.user.id,
      to: peer.id,
      text,
      at: Date.now(),
      pending: true
    };
    state.chat.messages.push(message);
    input.value = '';
    updateSendButton();
    renderMessages();
    scrollChatBottom();
    send({ type: 'chat:send', to: peer.id, text, clientId });
  }

  let lastTypingSent = 0;
  function sendTyping() {
    if (!state.chat.peer) return;
    const now = Date.now();
    if (now - lastTypingSent < 2000) return;
    lastTypingSent = now;
    send({ type: 'chat:typing', to: state.chat.peer.id });
  }

  function showPeerTyping() {
    if (!state.chat.peer) return;
    $('#chat-status').textContent = t('chat.typing');
    clearTimeout(state.chat.typingTimer);
    state.chat.typingTimer = setTimeout(() => {
      if (state.chat.peer) updateChatStatus();
    }, 3000);
  }

  // ---------------- 添加联系人 ----------------
  function openSheet(id) {
    $(`#${id}`).classList.remove('hidden');
    if (id === 'sheet-add') {
      $('#add-search').value = '';
      renderAddResults([]);
      setTimeout(() => $('#add-search').focus(), 200);
    }
  }

  function closeSheet(id) {
    if (id === 'chat') {
      closeChat();
      return;
    }
    const node = $(`#${id}`);
    if (node) node.classList.add('hidden');
  }

  function renderAddResults(users) {
    const listEl = $('#add-results');
    listEl.textContent = '';
    if (!users.length) {
      listEl.appendChild(el('li', 'add-empty', $('#add-search').value.trim() ? t('add.noMatch') : t('add.empty')));
      return;
    }
    for (const user of users) {
      const li = el('li', 'add-result');
      const av = avatarEl(user.name, user.id, user.avatar);
      const info = el('div');
      info.appendChild(el('strong', '', user.name));
      info.appendChild(el('span', '', `@${user.id}`));
      const btn = el('button', '', state.contacts.has(user.id) ? t('common.added') : t('common.add'));
      btn.type = 'button';
      if (state.contacts.has(user.id)) btn.classList.add('added');
      btn.disabled = state.contacts.has(user.id);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const data = await api('/api/contacts', { method: 'POST', body: { id: user.id } });
          state.contacts = new Map((data.contacts || []).map((c) => [c.id, c]));
          renderContacts();
          saveSession();
          btn.textContent = t('common.added');
          btn.classList.add('added');
          toast(t('add.addedToast', { name: user.name }));
        } catch (err) {
          btn.disabled = false;
          toast(err.message);
        }
      });
      li.append(av, info, btn);
      listEl.appendChild(li);
    }
  }

  let addTimer = null;
  function searchUsers() {
    clearTimeout(addTimer);
    const q = $('#add-search').value.trim();
    if (!q) return renderAddResults([]);
    addTimer = setTimeout(async () => {
      try {
        const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
        if ($('#add-search').value.trim() === q) renderAddResults(data.users || []);
      } catch (err) {
        toast(err.message);
      }
    }, 260);
  }

  // ---------------- 声音 ----------------
  function audioContext() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    return state.audioCtx;
  }

  function tone(freq, at, duration, volume, type = 'sine') {
    const ctx = audioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function startSound(kind) {
    stopSound();
    audioContext();
    if (kind === 'incoming') {
      const ring = () => {
        tone(784, 0, 0.32, 0.17, 'triangle');
        tone(1046.5, 0.2, 0.34, 0.15, 'sine');
        tone(784, 0.62, 0.3, 0.14, 'triangle');
        tone(659.25, 0.96, 0.42, 0.12, 'sine');
      };
      ring();
      state.soundTimer = setInterval(ring, 2200);
      if (navigator.vibrate) {
        navigator.vibrate([650, 250, 650, 850]);
        state.vibrateTimer = setInterval(() => navigator.vibrate([650, 250, 650, 850]), 2600);
      }
    } else if (kind === 'ringback') {
      const ring = () => {
        tone(440, 0, 0.9, 0.028, 'sine');
        tone(480, 0, 0.9, 0.028, 'sine');
      };
      ring();
      state.soundTimer = setInterval(ring, 3200);
    } else if (kind === 'connect') {
      tone(659.25, 0, 0.14, 0.09, 'sine');
      tone(987.77, 0.14, 0.22, 0.08, 'sine');
    } else if (kind === 'end') {
      tone(520, 0, 0.18, 0.06, 'sine');
      tone(392, 0.16, 0.3, 0.05, 'sine');
    }
  }

  function stopSound() {
    clearInterval(state.soundTimer);
    clearInterval(state.vibrateTimer);
    state.soundTimer = null;
    state.vibrateTimer = null;
    if (navigator.vibrate) navigator.vibrate(0);
  }

  /** 新消息提示音：短促双音，不与来电铃声混淆。 */
  function playChatSound() {
    if (state.call) return;
    audioContext();
    tone(1046.5, 0, 0.12, 0.11, 'sine');
    tone(1568, 0.1, 0.18, 0.085, 'sine');
  }

  // ---------------- 音量可视化 ----------------
  function buildWaveBars() {
    const wrap = $('#wave-bars');
    wrap.textContent = '';
    for (let i = 0; i < 21; i += 1) wrap.appendChild(el('i'));
  }

  function attachAnalyser(stream) {
    detachAnalyser();
    try {
      const ctx = audioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      state.analyser = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = $$('#wave-bars i');
      const tick = (now) => {
        analyser.getByteFrequencyData(data);
        const t = now / 320;
        for (let i = 0; i < bars.length; i += 1) {
          const idx = Math.min(data.length - 1, 2 + Math.floor((i / bars.length) * data.length * 0.72));
          const value = (data[idx] || 0) / 255;
          const idle = 0.24 + 0.1 * Math.sin(t + i * 0.55) + 0.05 * Math.sin(t * 1.7 + i * 0.9);
          bars[i].style.transform = `scaleY(${Math.max(0.12, Math.min(1, idle + value * 1.5)).toFixed(3)})`;
        }
        state.waveRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // 部分浏览器无法分析 MediaStream，使用随机波纹代替
      state.waveFallback = setInterval(() => {
        $$('#wave-bars i').forEach((bar) => {
          bar.style.transform = `scaleY(${(0.15 + Math.random() * 0.75).toFixed(3)})`;
        });
      }, 130);
    }
  }

  function detachAnalyser() {
    cancelAnimationFrame(state.waveRaf);
    state.waveRaf = null;
    state.analyser = null;
    clearInterval(state.waveFallback);
    state.waveFallback = null;
    $$('#wave-bars i').forEach((bar) => { bar.style.transform = 'scaleY(0.15)'; });
  }

  // ---------------- 通话 UI ----------------
  function setCallPhase(phase) {
    const overlay = $('#call');
    overlay.classList.toggle('active', phase === 'active');
    const status = $('#call-status');
    const hint = $('#call-hint');
    const timer = $('#call-timer');
    if (phase === 'ringing') {
      status.textContent = t('call.ringing');
      hint.textContent = t('call.waiting');
      timer.textContent = '—';
    } else if (phase === 'connecting') {
      status.textContent = t('call.connecting');
      hint.textContent = t('call.settingUp');
      timer.textContent = '—';
    } else if (phase === 'active') {
      status.textContent = t('call.active');
      hint.textContent = t('call.secure');
    }
  }

  function showCallOverlay(peer, phase) {
    const overlay = $('#call');
    overlay.classList.remove('hidden');
    $('#incoming').classList.add('hidden');
    paintAvatar($('#call-avatar'), peer.name, peer.id, peer.avatar);
    $('#call-avatar').classList.remove('pulse');
    $('#call-name').textContent = peer.name;
    setCallPhase(phase);
  }

  function hideCallOverlay() {
    $('#call').classList.add('hidden');
    $('#call').classList.remove('active');
  }

  function showIncoming(peer) {
    const overlay = $('#incoming');
    overlay.classList.remove('hidden');
    paintAvatar($('#incoming-avatar'), peer.name, peer.id, peer.avatar);
    $('#incoming-avatar').classList.add('pulse');
    $('#incoming-name').textContent = peer.name;
    $('#incoming-id').textContent = `@${peer.id}`;
    startSound('incoming');
    startTitleFlash(t('title.incoming', { name: peer.name }));
    if (navigator.vibrate) navigator.vibrate([500, 300, 500, 900]);
  }

  function hideIncoming() {
    $('#incoming').classList.add('hidden');
    stopSound();
    stopTitleFlash();
  }

  function startTitleFlash(text) {
    stopTitleFlash();
    let flip = false;
    const base = document.title;
    state.titleTimer = setInterval(() => {
      document.title = flip ? text : base;
      flip = !flip;
    }, 1200);
  }

  function stopTitleFlash() {
    clearInterval(state.titleTimer);
    state.titleTimer = null;
    document.title = t('app.title');
  }

  function setFavicon(alert) {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    link.href = alert ? FAVICON_ALERT : '/favicon.svg';
  }

  function clearChatAlert() {
    setFavicon(false);
    if (!state.call) stopTitleFlash();
  }

  function requestNotifyPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    try { Notification.requestPermission(); } catch { /* 忽略 */ }
  }

  /** 新消息：提示音 + 标签页标题/图标闪烁 + 系统通知（浏览器允许时）。 */
  function notifyChat(contact, text) {
    if (!contact) return;
    if (!(bridge && document.hidden)) playChatSound();
    if (navigator.vibrate && !bridge) navigator.vibrate(30);
    const openWithSender = state.chat.peer && state.chat.peer.id === contact.id && !document.hidden;
    if (!openWithSender && !state.call) {
      startTitleFlash(t('title.newMessage', { name: contact.name || contact.id }));
      setFavicon(true);
    }
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const note = new Notification(contact.name || t('notification.message'), {
          body: text || '',
          tag: 'voicecall-chat',
          icon: '/favicon.svg',
          silent: true
        });
        note.onclick = () => {
          window.focus();
          note.close();
        };
      } catch { /* 忽略 */ }
    }
  }

  function startCallTimer() {
    stopCallTimer();
    const startedAt = Date.now();
    const render = () => {
      $('#call-timer').textContent = formatDuration(Date.now() - startedAt);
    };
    render();
    state.callTimer = setInterval(render, 500);
  }

  function stopCallTimer() {
    clearInterval(state.callTimer);
    state.callTimer = null;
  }

  function setMute(muted) {
    if (!state.localStream) return;
    state.call && (state.call.muted = muted);
    for (const track of state.localStream.getAudioTracks()) track.enabled = !muted;
    $('#btn-mute').classList.toggle('is-muted', muted);
    $('#btn-mute').setAttribute('aria-label', muted ? t('call.unmute') : t('call.mute'));
  }

  // ---------------- 麦克风 & WebRTC ----------------
  async function ensureMic() {
    if (state.localStream && state.localStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return state.localStream;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      throw new Error(t('toast.insecure'));
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(t('toast.noMicSupport'));
    }
    state.micPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    }).then((stream) => {
      state.localStream = stream;
      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          if (state.call) {
            toast(t('toast.micLost'));
            hangup('mic-lost');
          }
        };
      }
      return stream;
    }).finally(() => {
      state.micPromise = null;
    });
    return state.micPromise;
  }

  function releaseMic() {
    if (state.localStream) {
      for (const track of state.localStream.getTracks()) {
        try { track.stop(); } catch { /* 忽略 */ }
      }
      state.localStream = null;
    }
  }

  function createPeer(role) {
    if (state.pc) {
      try { state.pc.close(); } catch { /* 忽略 */ }
      state.pc = null;
    }
    const pc = new RTCPeerConnection({
      iceServers: state.iceServers,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle'
    });
    state.pc = pc;
    state.pendingCandidates = [];

    if (role === 'caller' && state.localStream) {
      for (const track of state.localStream.getAudioTracks()) pc.addTrack(track, state.localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: 'call:ice', callId: state.call && state.call.id, candidate: event.candidate.toJSON() });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      state.remoteStream = stream;
      const audio = $('#remote-audio');
      audio.srcObject = stream;
      audio.play().catch(() => {});
      attachAnalyser(stream);
    };

    pc.onconnectionstatechange = () => {
      if (!state.call) return;
      if (pc.connectionState === 'connected') markConnected();
      if (pc.connectionState === 'failed') {
        toast(t('toast.voiceFailed'));
        hangup('failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!state.call) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') markConnected();
    };

    return pc;
  }

  function markConnected() {
    if (!state.call) return;
    if (state.call.phase === 'active') return;
    state.call.phase = 'active';
    state.call.startedAt = Date.now();
    showCallOverlay(state.call.peer, 'active');
    startCallTimer();
    stopSound();
    startSound('connect');
    if (bridge) {
      try { bridge.setCallState(true); } catch { /* 忽略 */ }
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: state.call.peer.name,
          artist: t('media.artist')
        });
      } catch { /* 忽略 */ }
    }
  }

  function flushCandidates() {
    if (!state.pc || !state.pc.remoteDescription) return;
    const pending = state.pendingCandidates;
    state.pendingCandidates = [];
    for (const candidate of pending) {
      state.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  // ---------------- 呼叫流程 ----------------
  async function startCall(contact) {
    if (state.call) return toast(t('toast.inCall'));
    if (state.online === false && !bridge) return toast(t('toast.notOnline'));
    const callId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    state.call = { id: callId, peer: contact, direction: 'outgoing', phase: 'ringing', muted: false };
    showCallOverlay(contact, 'ringing');
    setCallPhase('ringing');
    startSound('ringback');
    startTitleFlash(t('title.calling', { name: contact.name }));
    try {
      await ensureMic();
    } catch (err) {
      resetCallState();
      toast(err.message || t('toast.micDenied'));
      return;
    }
    if (!state.call || state.call.id !== callId) return;
    send({ type: 'call:invite', callId, to: contact.id, mode: 'audio' });
  }

  async function acceptIncoming() {
    if (!state.call || state.call.direction !== 'incoming') return;
    const call = state.call;
    hideIncoming();
    try {
      await ensureMic();
    } catch (err) {
      send({ type: 'call:reject', callId: call.id, reason: 'mic' });
      resetCallState();
      toast(err.message || t('toast.micDenied'));
      return;
    }
    if (!state.call || state.call.id !== call.id) return;
    state.call.phase = 'connecting';
    showCallOverlay(call.peer, 'connecting');
    const audio = $('#remote-audio');
    audio.play().catch(() => {});
    send({ type: 'call:accept', callId: call.id });
    if (bridge) {
      try { bridge.setCallState(true); } catch { /* 忽略 */ }
    }
  }

  function declineIncoming() {
    if (!state.call || state.call.direction !== 'incoming') return;
    send({ type: 'call:reject', callId: state.call.id, reason: 'declined' });
    resetCallState();
  }

  function hangup(reason = 'hangup') {
    if (!state.call) return;
    const call = state.call;
    if (call.phase === 'active' || call.phase === 'connecting') {
      send({ type: 'call:hangup', callId: call.id });
    } else if (call.direction === 'outgoing') {
      send({ type: 'call:cancel', callId: call.id });
    } else {
      send({ type: 'call:reject', callId: call.id, reason });
    }
    resetCallState();
  }

  function rememberDismissed(callId) {
    if (!callId) return;
    state.dismissedCalls.add(callId);
    while (state.dismissedCalls.size > 20) {
      state.dismissedCalls.delete(state.dismissedCalls.values().next().value);
    }
  }

  function resetCallState() {
    stopCallTimer();
    stopSound();
    stopTitleFlash();
    hideCallOverlay();
    $('#incoming').classList.add('hidden');
    clearTimeout(state.answerTimer);
    state.answerTimer = null;
    detachAnalyser();
    releaseMic();
    if (state.pc) {
      try {
        state.pc.ontrack = null;
        state.pc.onicecandidate = null;
        state.pc.close();
      } catch { /* 忽略 */ }
    }
    state.pc = null;
    state.remoteStream = null;
    state.pendingCandidates = [];
    const audio = $('#remote-audio');
    audio.srcObject = null;
    state.call = null;
    state.muted = false;
    $('#btn-mute').classList.remove('is-muted');
    $('#btn-speaker').classList.remove('is-on');
    if (bridge) {
      try { bridge.setCallState(false); } catch { /* 忽略 */ }
    }
  }

  // ---------------- 信令处理 ----------------
  async function handleServerMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'ready': {
        setNet(true, 'net.connected');
        if (msg.user && state.user) {
          state.user = { ...state.user, ...msg.user };
          renderProfile();
          saveSession();
        }
        if (Array.isArray(msg.contacts)) {
          state.contacts = new Map(msg.contacts.map((c) => [c.id, c]));
          renderContacts();
          saveSession();
        }
        break;
      }
      case 'contacts': {
        if (Array.isArray(msg.contacts)) {
          state.contacts = new Map(msg.contacts.map((c) => [c.id, c]));
          renderContacts();
          saveSession();
        }
        break;
      }
      case 'profile': {
        const user = msg.user;
        if (!user || !user.id) break;
        if (state.user && user.id === state.user.id) {
          state.user = { ...state.user, ...user };
          saveSession();
          renderProfile();
        }
        const existing = state.contacts.get(user.id);
        if (existing) upsertContact({ ...existing, ...user });
        if (state.chat.peer && state.chat.peer.id === user.id) {
          state.chat.peer = { ...state.chat.peer, ...user };
          paintAvatar($('#chat-avatar'), state.chat.peer.name, state.chat.peer.id, state.chat.peer.avatar);
          $('#chat-name').textContent = state.chat.peer.name;
        }
        break;
      }
      case 'presence': {
        const existing = state.contacts.get(msg.user.id);
        if (existing) upsertContact({ ...existing, name: msg.user.name, online: Boolean(msg.online) });
        break;
      }
      case 'chat:conversations': {
        if (Array.isArray(msg.conversations)) {
          state.conversations = new Map(msg.conversations.map((c) => [c.id, c]));
          renderChats();
          renderContacts();
        }
        break;
      }
      case 'chat:message': {
        const message = msg.message;
        if (!message || !message.id) break;
        updateConversation(message);
        if (state.user && message.from === state.user.id) break;
        const sender = state.contacts.get(message.from) || {
          id: message.from,
          name: (msg.from && msg.from.name) || message.from,
          avatar: (msg.from && msg.from.avatar) || ''
        };
        notifyChat(sender, message.text);
        if (state.chat.peer && state.chat.peer.id === message.from) {
          state.chat.messages.push(message);
          renderMessages();
          scrollChatBottom();
          markChatRead(message.from);
          renderChats();
          renderContacts();
        } else {
          renderChats();
          renderContacts();
          const peer = state.contacts.get(message.from);
          toast(t('toast.newMessage', { name: msg.from && msg.from.name ? msg.from.name : (peer ? peer.name : message.from) }));
        }
        break;
      }
      case 'chat:sent': {
        const message = msg.message;
        if (!message || !message.id) break;
        updateConversation(message);
        if (state.chat.peer && state.chat.peer.id === message.to) {
          const index = state.chat.messages.findIndex((item) => item.clientId === msg.clientId
            || (item.pending && item.text === message.text));
          if (index >= 0) state.chat.messages[index] = { ...message };
          else state.chat.messages.push({ ...message });
          renderMessages();
          scrollChatBottom();
        }
        renderChats();
        break;
      }
      case 'chat:typing': {
        if (msg.from && state.chat.peer && state.chat.peer.id === msg.from.id) showPeerTyping();
        break;
      }
      case 'pong':
        break;
      case 'call:incoming': {
        if (state.call) {
          send({ type: 'call:reject', callId: msg.callId, reason: 'busy' });
          break;
        }
        state.call = {
          id: msg.callId,
          peer: msg.from,
          direction: 'incoming',
          phase: 'ringing',
          muted: false,
          receivedAt: Date.now()
        };
        showIncoming(msg.from);
        break;
      }
      case 'call:ringing':
        break;
      case 'call:accepted': {
        if (!state.call || state.call.id !== msg.callId) break;
        state.call.phase = 'connecting';
        state.call.peer = { ...state.call.peer, ...(msg.by || {}) };
        stopSound();
        showCallOverlay(state.call.peer, 'connecting');
        try {
          const pc = createPeer('caller');
          state.call.role = 'caller';
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          send({ type: 'call:sdp', callId: state.call.id, sdp: pc.localDescription });
          // 发完 offer 迟迟收不到 answer 时主动结束，避免界面卡在“正在接通”
          clearTimeout(state.answerTimer);
          const callId = state.call.id;
          state.answerTimer = setTimeout(() => {
            if (!state.call || state.call.id !== callId || state.call.phase === 'active') return;
            if (state.pc && state.pc.remoteDescription) return;
            toast(t('toast.callNotEstablished'));
            hangup('failed');
          }, 20000);
        } catch (err) {
          toast(t('toast.callFailed'));
          hangup('failed');
        }
        break;
      }
      case 'call:rejected': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = { busy: t('reject.busy'), mic: t('reject.mic'), declined: t('reject.declined') };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || t('reject.declined'));
        break;
      }
      case 'call:cancelled': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = {
          handled: t('cancel.handled'),
          'no-answer': t('cancel.noAnswer'),
          cancelled: t('cancel.cancelled'),
          declined: t('cancel.declined'),
          disconnect: t('cancel.disconnect')
        };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || t('ended.hangup'));
        break;
      }
      case 'call:ended': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = {
          'no-answer': t('ended.noAnswer'),
          hangup: t('ended.hangup'),
          disconnect: t('ended.disconnect'),
          'mic-lost': t('ended.micLost'),
          failed: t('ended.failed'),
          timeout: t('ended.timeout')
        };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || t('ended.hangup'));
        break;
      }
      case 'call:sdp': {
        if (!state.call || state.call.id !== msg.callId) break;
        const sdp = msg.sdp;
        if (!sdp || !sdp.type) break;
        if (sdp.type === 'offer') {
          await handleOffer(sdp);
        } else if (sdp.type === 'answer') {
          try {
            if (state.pc) {
              await state.pc.setRemoteDescription(sdp);
              flushCandidates();
              clearTimeout(state.answerTimer);
              state.answerTimer = null;
            }
          } catch {
            toast(t('toast.negotiationFailed'));
            hangup('failed');
          }
        }
        break;
      }
      case 'call:ice': {
        if (!state.call || state.call.id !== msg.callId || !msg.candidate) break;
        const candidate = msg.candidate;
        if (state.pc && state.pc.remoteDescription) {
          state.pc.addIceCandidate(candidate).catch(() => {});
        } else {
          state.pendingCandidates.push(candidate);
        }
        break;
      }
      case 'error': {
        const messages = {
          offline: t('err.offline'),
          busy: t('err.busy'),
          busy_peer: t('err.busyPeer'),
          not_contact: t('err.notContact'),
          not_found: t('err.notFound'),
          no_session: t('err.noSession'),
          empty: t('err.empty'),
          too_long: t('err.tooLong'),
          self: t('err.self')
        };
        toast(messages[msg.code] || msg.message || t('toast.operationFailed'));
        if (msg.clientId) {
          const item = state.chat.messages.find((m) => m.clientId === msg.clientId);
          if (item) {
            item.pending = false;
            item.failed = true;
            renderMessages();
          }
        }
        if (msg.callId) {
          resetCallState();
        }
        if (msg.code === 'no_session') logout();
        break;
      }
      default:
        break;
    }
  }

  async function handleOffer(sdp) {
    if (!state.call) return;
    if (state.call.direction === 'outgoing') {
      // 同一通话收到重复 offer，忽略
      return;
    }
    const call = state.call;
    try {
      await ensureMic();
    } catch (err) {
      send({ type: 'call:hangup', callId: call.id });
      resetCallState();
      toast(err.message || t('toast.micDenied'));
      return;
    }
    let pc = state.pc;
    if (!pc) {
      pc = createPeer('callee');
      for (const track of state.localStream.getAudioTracks()) pc.addTrack(track, state.localStream);
    }
    try {
      await pc.setRemoteDescription(sdp);
      flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'call:sdp', callId: call.id, sdp: pc.localDescription });
      state.call.phase = 'connecting';
      showCallOverlay(state.call.peer, 'connecting');
      startSound('connect');
      // 部分 WebView 不触发 connectionstatechange，主动确认一次真实连接状态
      setTimeout(() => {
        if (!state.call || state.call.id !== call.id || state.call.phase === 'active') return;
        if (state.pc && (state.pc.connectionState === 'connected'
          || ['connected', 'completed'].includes(state.pc.iceConnectionState))) {
          markConnected();
        }
      }, 2500);
      // 一直停在“正在接通”说明协商失败（对端可能已挂断），避免界面卡死
      setTimeout(() => {
        if (!state.call || state.call.id !== call.id || state.call.phase === 'active') return;
        toast(t('toast.callNotEstablished'));
        hangup('failed');
      }, 30000);
    } catch {
      toast(t('toast.voiceNegotiation'));
      hangup('failed');
    }
  }

  // ---------------- 安卓桥接 ----------------
  window.VC = {
    onSignaling(json) {
      let msg;
      try { msg = JSON.parse(json); } catch { return; }
      handleServerMessage(msg);
    },
    onTransportState(online) {
      setNet(Boolean(online), online ? 'net.connected' : 'net.serviceOffline');
      // 服务重连后核对当前通话是否还存在于服务器，避免界面卡在已失效的通话
      if (online && state.call) {
        send({ type: 'call:status', callId: state.call.id });
      }
    },
    onPendingAccept(json) {
      // 安卓来电界面已接听，页面加载后接管
      let pending;
      try { pending = JSON.parse(json); } catch { return; }
      if (!pending || !pending.callId || state.call) return;
      // 该呼叫在页面接管前已经结束（例如主叫挂断），不要再建立界面
      if (state.dismissedCalls.has(pending.callId)) {
        state.dismissedCalls.delete(pending.callId);
        return;
      }
      const pendingId = pending.callId;
      state.call = {
        id: pendingId,
        peer: pending.from || { id: pending.fromId || '', name: pending.fromName || t('incoming.label') },
        direction: 'incoming',
        phase: 'connecting',
        muted: false,
        acceptedNatively: true
      };
      showCallOverlay(state.call.peer, 'connecting');
      if (bridge) {
        try { bridge.setCallState(true); } catch { /* 忽略 */ }
      }
      ensureMic().catch((err) => {
        toast(err.message || t('toast.micDenied'));
        send({ type: 'call:hangup', callId: state.call && state.call.id });
        resetCallState();
      });
      // 接管后迟迟没有 SDP/ICE，自动结束，避免停在“正在接通”
      setTimeout(() => {
        if (!state.call || state.call.id !== pendingId || state.call.phase === 'active') return;
        toast(t('toast.callNotEstablished'));
        hangup('failed');
      }, 30000);
    },
    /** 安卓返回键：优先关闭页面上的弹层，返回 true 表示已消费。 */
    handleBack() {
      if (!$('#chat').classList.contains('hidden')) {
        closeChat();
        return true;
      }
      if (!$('#sheet-add').classList.contains('hidden')) {
        closeSheet('sheet-add');
        return true;
      }
      if (!$('#sheet-settings').classList.contains('hidden')) {
        closeSheet('sheet-settings');
        return true;
      }
      return false;
    }
  };

  // ---------------- 事件绑定 ----------------
  function bindEvents() {
    $('#segmented').addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-mode]');
      if (btn) setAuthMode(btn.dataset.mode);
    });
    $('#auth-form').addEventListener('submit', submitAuth);
    $('#contact-search').addEventListener('input', () => {
      renderContacts();
      renderChats();
    });
    $$('[data-tab]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $('#rail-avatar').addEventListener('click', () => switchTab('me'));
    $('#btn-settings-me').addEventListener('click', () => openSheet('sheet-settings'));
    $('#me-avatar-btn').addEventListener('click', () => $('#avatar-input').click());
    $('#avatar-input').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) uploadAvatar(file);
      event.target.value = '';
    });
    $('#chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      sendChat();
    });
    $('#chat-input').addEventListener('input', () => {
      updateSendButton();
      sendTyping();
    });
    $('#chat-call').addEventListener('click', () => {
      const peer = state.chat.peer;
      if (!peer) return;
      closeChat();
      startCall(peer);
    });

    // 移动端左缘右滑返回（仿微信）
    const chatPane = $('#chat');
    let swipe = null;
    const onMobile = () => window.matchMedia('(max-width: 900px)').matches;
    chatPane.addEventListener('touchstart', (event) => {
      if (!onMobile() || state.chat.closeTimer || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX > 44) return;
      swipe = { x: touch.clientX, y: touch.clientY, active: false };
    }, { passive: true });
    chatPane.addEventListener('touchmove', (event) => {
      if (!swipe) return;
      const touch = event.touches[0];
      const dx = touch.clientX - swipe.x;
      const dy = touch.clientY - swipe.y;
      if (!swipe.active) {
        if (Math.abs(dy) > 12) { swipe = null; return; }
        if (dx < 10) return;
        swipe.active = true;
      }
      event.preventDefault();
      const shift = Math.max(0, dx);
      chatPane.style.transform = `translateX(${shift}px)`;
      chatPane.style.opacity = String(1 - Math.min(shift / 360, 0.25));
    }, { passive: false });
    const endSwipe = () => {
      if (!swipe) return;
      const moved = swipe.active;
      swipe = null;
      const match = /translateX\(([\d.]+)px\)/.exec(chatPane.style.transform || '');
      const shift = match ? Number(match[1]) : 0;
      chatPane.style.transform = '';
      chatPane.style.opacity = '';
      if (moved && shift > 80) closeChat();
    };
    chatPane.addEventListener('touchend', endSwipe);
    chatPane.addEventListener('touchcancel', endSwipe);
    $('#btn-add').addEventListener('click', () => openSheet('sheet-add'));
    $('#add-search').addEventListener('input', searchUsers);
    $('#btn-settings').addEventListener('click', () => openSheet('sheet-settings'));
    $$('#lang-seg button').forEach((btn) => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
    $$('#theme-seg button').forEach((btn) => {
      btn.addEventListener('click', () => setTheme(btn.dataset.themeOpt));
    });
    const serverConfigBtn = $('#btn-server-config');
    if (serverConfigBtn) {
      serverConfigBtn.addEventListener('click', () => {
        if (bridge) {
          try { bridge.openServerSettings(); } catch { /* 忽略 */ }
        }
      });
    }
    $('#btn-logout').addEventListener('click', logout);
    $$('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeSheet(btn.dataset.close));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeSheet('sheet-add');
        closeSheet('sheet-settings');
        closeChat();
      }
    });

    $('#btn-answer').addEventListener('click', acceptIncoming);
    $('#btn-decline').addEventListener('click', declineIncoming);
    $('#btn-hangup').addEventListener('click', () => hangup('hangup'));
    $('#btn-mute').addEventListener('click', () => {
      if (!state.localStream) return;
      setMute(!state.call.muted);
    });
    $('#btn-speaker').addEventListener('click', async () => {
      const button = $('#btn-speaker');
      const on = !button.classList.contains('is-on');
      button.classList.toggle('is-on', on);
      if (bridge) {
        try { bridge.setSpeaker(on); } catch { /* 忽略 */ }
        toast(on ? t('toast.speakerOn') : t('toast.speakerOff'));
        return;
      }
      const audio = $('#remote-audio');
      if (audio.setSinkId) {
        try {
          await audio.setSinkId(on ? 'default' : '');
          toast(on ? t('toast.sinkOn') : t('toast.sinkOff'));
          return;
        } catch { /* 继续提示 */ }
      }
      toast(t('toast.speakerManual'));
    });

    window.addEventListener('beforeunload', () => {
      if (state.call && state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'call:hangup', callId: state.call.id }));
      }
      if (bridge) {
        try { bridge.setCallState(false); } catch { /* 忽略 */ }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        clearChatAlert();
        if (state.ws && state.ws.readyState > 1 && state.token) connectWS();
      }
    });
    window.addEventListener('focus', clearChatAlert);
  }

  // ---------------- 启动 ----------------
  async function boot() {
    buildWaveBars();
    loadUiPrefs();
    applyTheme(theme);
    bindEvents();
    applyStaticText();
    setAuthMode('login');
    loadChatRead();

    // 浏览器端不需要服务器地址入口，直接移除；安卓端保留用于修改地址
    if (!bridge) {
      const serverRow = $('#btn-server-config');
      if (serverRow) serverRow.remove();
    }

    try {
      state.deviceId = localStorage.getItem(DEVICE_KEY) || '';
      if (!state.deviceId) {
        state.deviceId = `web_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(DEVICE_KEY, state.deviceId);
      }
    } catch {
      state.deviceId = `web_${Math.random().toString(36).slice(2, 10)}`;
    }

    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch { /* 忽略 */ }
    if (!saved && bridge) {
      try {
        const native = bridge.getSession && bridge.getSession();
        if (native) saved = JSON.parse(native);
      } catch { /* 忽略 */ }
    }
    if (!saved || !saved.token) {
      showAuth();
      setNet(false, 'net.notLoggedIn');
      return;
    }

    state.token = saved.token;
    state.user = saved.user || null;
    state.contacts = new Map((saved.contacts || []).map((c) => [c.id, c]));
    if (state.user) {
      await showHome();
      renderContacts();
    }
    try {
      const data = await api('/api/me');
      state.user = data.user;
      state.contacts = new Map((data.contacts || []).map((c) => [c.id, c]));
      saveSession();
      await showHome();
      startTransport();
      loadConversations();
    } catch (err) {
      state.token = '';
      clearSession();
      showAuth();
      setError(err.message || t('toast.loginExpired'));
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
