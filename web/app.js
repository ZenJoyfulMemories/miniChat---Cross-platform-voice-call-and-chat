/* VoiceCall 网页客户端：账号、联系人、WebRTC 语音通话、安卓桥接 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STORAGE_KEY = 'voicecall.session.v1';
  const DEVICE_KEY = 'voicecall.device.v1';
  const bridge = window.AndroidBridge || null;

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

  function paintAvatar(node, name, id) {
    const keepPulse = node.classList.contains('pulse');
    node.className = `${node.classList.contains('big-avatar') ? 'big-avatar' : 'avatar'} ${gradientClass(id)}${keepPulse ? ' pulse' : ''}`;
    node.textContent = initial(name);
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
    setTimeout(() => $('#auth-id').focus(), 320);
  }

  async function showHome() {
    $('#auth').classList.add('hidden');
    $('#home').classList.remove('hidden');
    renderProfile();
    renderContacts();
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
      throw new Error('无法连接服务器，请检查网络');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `请求失败 (${res.status})`);
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
        toast('安卓后台服务未连接');
      }
      return;
    }
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    } else {
      toast('与服务器连接已断开');
    }
  }

  function setNet(online, label) {
    state.online = online;
    const node = $('#net-status');
    node.classList.toggle('off', !online);
    node.querySelector('em').textContent = label || (online ? '已连接' : '连接中');
    $('#settings-net').textContent = online ? '在线' : '离线';
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
    setNet(false, '连接中');
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
      setNet(true, '已连接');
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
      setNet(false, '重连中');
      if (state.call) {
        resetCallState();
        toast('连接已断开，通话结束');
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
    $('#auth-submit').textContent = mode === 'login' ? '登录' : '创建账号并登录';
    $('#auth-pwd').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    setError('');
  }

  async function submitAuth(event) {
    event.preventDefault();
    const id = $('#auth-id').value.trim();
    const name = $('#auth-name').value.trim();
    const password = $('#auth-pwd').value;
    if (!id) return setError('请输入账号');
    if (!password) return setError('请输入密码');
    if (state.authMode === 'register' && password.length < 6) return setError('密码至少 6 位');

    const button = $('#auth-submit');
    button.disabled = true;
    button.textContent = state.authMode === 'login' ? '登录中…' : '创建中…';
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
      $('#auth-pwd').value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      button.disabled = false;
      button.textContent = state.authMode === 'login' ? '登录' : '创建账号并登录';
    }
  }

  function startTransport() {
    if (bridge) {
      try {
        bridge.onLogin(state.token, state.user.id, state.user.name);
        bridge.onBridgeReady();
      } catch (err) {
        toast('安卓后台服务启动失败');
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
    setNet(false, '未登录');
    clearSession();
    closeSheet('sheet-settings');
    showAuth();
  }

  // ---------------- 联系人 ----------------
  function renderProfile() {
    if (!state.user) return;
    for (const node of [$('#me-avatar'), $('#settings-avatar')]) {
      node.className = `avatar ${gradientClass(state.user.id)}`;
      node.textContent = initial(state.user.name);
    }
    $('#me-name').textContent = state.user.name;
    $('#me-id').textContent = `@${state.user.id}`;
    $('#settings-name').textContent = state.user.name;
    $('#settings-id').textContent = `@${state.user.id}`;
    $('#settings-server').textContent = location.origin;
    $('#settings-device').textContent = bridge ? '安卓客户端' : (/Mobi|Android/i.test(navigator.userAgent) ? '移动网页' : '网页端');
    $('#btn-server-config').hidden = !bridge;
  }

  function contactLabel(contact) {
    return contact.online ? '在线' : (contact.lastSeen ? '离线' : '离线');
  }

  function renderContacts() {
    const list = $('#contact-list');
    const keyword = $('#contact-search').value.trim().toLowerCase();
    const all = [...state.contacts.values()];
    const filtered = all
      .filter((c) => !keyword || c.id.includes(keyword) || c.name.toLowerCase().includes(keyword))
      .sort((a, b) => (Number(b.online) - Number(a.online)) || a.name.localeCompare(b.name, 'zh-CN'));

    $('#empty-contacts').classList.toggle('hidden', all.length !== 0);
    list.classList.toggle('hidden', all.length === 0);
    $('#online-count').textContent = `${all.filter((c) => c.online).length} 在线`;

    list.textContent = '';
    for (const contact of filtered) {
      const li = el('li', `contact${contact.online ? '' : ' offline'}`);
      const av = el('div', `avatar ${gradientClass(contact.id)}`, initial(contact.name));
      if (contact.online) av.appendChild(el('span', 'dot'));
      const meta = el('div', 'contact-meta');
      meta.appendChild(el('strong', '', contact.name));
      meta.appendChild(el('span', '', `@${contact.id} · ${contactLabel(contact)}`));
      const call = el('button', 'contact-call');
      call.type = 'button';
      call.setAttribute('aria-label', `呼叫 ${contact.name}`);
      call.innerHTML = icon('phone');
      call.addEventListener('click', (event) => {
        event.stopPropagation();
        startCall(contact);
      });
      li.append(av, meta, call);
      list.appendChild(li);
    }
  }

  function upsertContact(contact) {
    const prev = state.contacts.get(contact.id) || {};
    state.contacts.set(contact.id, { ...prev, ...contact });
    renderContacts();
    saveSession();
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
    $(`#${id}`).classList.add('hidden');
  }

  function renderAddResults(users) {
    const listEl = $('#add-results');
    listEl.textContent = '';
    if (!users.length) {
      listEl.appendChild(el('li', 'add-empty', $('#add-search').value.trim() ? '没有找到匹配的账号' : '输入账号或昵称开始搜索'));
      return;
    }
    for (const user of users) {
      const li = el('li', 'add-result');
      const av = el('div', `avatar ${gradientClass(user.id)}`, initial(user.name));
      const info = el('div');
      info.appendChild(el('strong', '', user.name));
      info.appendChild(el('span', '', `@${user.id}`));
      const btn = el('button', '', state.contacts.has(user.id) ? '已添加' : '添加');
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
          btn.textContent = '已添加';
          btn.classList.add('added');
          toast(`已添加 ${user.name}`);
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
        tone(880, 0, 0.22, 0.08, 'sine');
        tone(1174.66, 0.24, 0.26, 0.07, 'sine');
        tone(880, 0.7, 0.22, 0.06, 'sine');
      };
      ring();
      state.soundTimer = setInterval(ring, 2400);
      if (navigator.vibrate) {
        navigator.vibrate([500, 300, 500, 900]);
        state.vibrateTimer = setInterval(() => navigator.vibrate([500, 300, 500, 900]), 2400);
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
      status.textContent = '正在呼叫';
      hint.textContent = '等待对方接听…';
      timer.textContent = '—';
    } else if (phase === 'connecting') {
      status.textContent = '正在接通';
      hint.textContent = '建立加密语音通道…';
      timer.textContent = '—';
    } else if (phase === 'active') {
      status.textContent = '通话中';
      hint.textContent = '端到端加密 · 语音通话';
    }
  }

  function showCallOverlay(peer, phase) {
    const overlay = $('#call');
    overlay.classList.remove('hidden');
    $('#incoming').classList.add('hidden');
    paintAvatar($('#call-avatar'), peer.name, peer.id);
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
    paintAvatar($('#incoming-avatar'), peer.name, peer.id);
    $('#incoming-avatar').classList.add('pulse');
    $('#incoming-name').textContent = peer.name;
    $('#incoming-id').textContent = `@${peer.id}`;
    startSound('incoming');
    startTitleFlash(`来电 · ${peer.name}`);
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
    document.title = 'VoiceCall · 语音通话';
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
    $('#btn-mute').setAttribute('aria-label', muted ? '取消静音' : '静音');
  }

  // ---------------- 麦克风 & WebRTC ----------------
  async function ensureMic() {
    if (state.localStream && state.localStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return state.localStream;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      throw new Error('当前不是安全连接，请使用 https 地址访问');
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风采集');
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
            toast('麦克风已断开');
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
        toast('语音连接失败，请检查网络或 TURN 配置');
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
          artist: 'VoiceCall 语音通话'
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
    if (state.call) return toast('当前正在通话中');
    if (state.online === false && !bridge) return toast('尚未连接到服务器');
    const callId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    state.call = { id: callId, peer: contact, direction: 'outgoing', phase: 'ringing', muted: false };
    showCallOverlay(contact, 'ringing');
    setCallPhase('ringing');
    startSound('ringback');
    startTitleFlash(`呼叫 · ${contact.name}`);
    try {
      await ensureMic();
    } catch (err) {
      resetCallState();
      toast(err.message || '无法使用麦克风');
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
      toast(err.message || '无法使用麦克风');
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
        setNet(true, '已连接');
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
      case 'presence': {
        const existing = state.contacts.get(msg.user.id);
        if (existing) upsertContact({ ...existing, name: msg.user.name, online: Boolean(msg.online) });
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
            toast('通话未能建立');
            hangup('failed');
          }, 20000);
        } catch (err) {
          toast('建立通话失败');
          hangup('failed');
        }
        break;
      }
      case 'call:rejected': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = { busy: '对方正在通话中', mic: '对方无法使用麦克风', declined: '对方已拒绝' };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || '对方已拒绝');
        break;
      }
      case 'call:cancelled': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = {
          handled: '已在其他设备接听',
          'no-answer': '未接来电',
          cancelled: '对方已取消呼叫',
          declined: '已拒绝来电',
          disconnect: '对方已断开'
        };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || '通话已结束');
        break;
      }
      case 'call:ended': {
        if (!state.call || state.call.id !== msg.callId) {
          rememberDismissed(msg.callId);
          break;
        }
        const reasonMap = {
          'no-answer': '对方无应答',
          hangup: '通话已结束',
          disconnect: '对方已断开连接',
          'mic-lost': '麦克风已断开',
          failed: '连接失败',
          timeout: '通话未能建立'
        };
        resetCallState();
        startSound('end');
        toast(reasonMap[msg.reason] || '通话已结束');
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
            toast('通话协商失败');
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
          offline: '对方当前不在线',
          busy: '当前正在通话中',
          busy_peer: '对方正在通话中',
          not_contact: '请先添加对方为联系人',
          not_found: '联系人不存在',
          no_session: '登录状态已失效'
        };
        toast(messages[msg.code] || msg.message || '操作失败');
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
      toast(err.message || '无法使用麦克风');
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
        toast('通话未能建立');
        hangup('failed');
      }, 30000);
    } catch {
      toast('语音协商失败');
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
      setNet(Boolean(online), online ? '已连接' : '后台服务离线');
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
        peer: pending.from || { id: pending.fromId || '', name: pending.fromName || '来电' },
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
        toast(err.message || '无法使用麦克风');
        send({ type: 'call:hangup', callId: state.call && state.call.id });
        resetCallState();
      });
      // 接管后迟迟没有 SDP/ICE，自动结束，避免停在“正在接通”
      setTimeout(() => {
        if (!state.call || state.call.id !== pendingId || state.call.phase === 'active') return;
        toast('通话未能建立');
        hangup('failed');
      }, 30000);
    }
  };

  // ---------------- 事件绑定 ----------------
  function bindEvents() {
    $('#segmented').addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-mode]');
      if (btn) setAuthMode(btn.dataset.mode);
    });
    $('#auth-form').addEventListener('submit', submitAuth);
    $('#contact-search').addEventListener('input', renderContacts);
    $('#btn-add').addEventListener('click', () => openSheet('sheet-add'));
    $('#add-search').addEventListener('input', searchUsers);
    $('#btn-settings').addEventListener('click', () => openSheet('sheet-settings'));
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-server-config').addEventListener('click', () => {
      if (bridge) {
        try { bridge.openServerSettings(); } catch { /* 忽略 */ }
      }
    });
    $$('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeSheet(btn.dataset.close));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeSheet('sheet-add');
        closeSheet('sheet-settings');
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
        toast(on ? '已切换到扬声器' : '已切换回听筒');
        return;
      }
      const audio = $('#remote-audio');
      if (audio.setSinkId) {
        try {
          await audio.setSinkId(on ? 'default' : '');
          toast(on ? '已切换到默认扬声器' : '已切换回系统默认输出');
          return;
        } catch { /* 继续提示 */ }
      }
      toast('网页端请使用系统音量或音频输出设备切换');
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
      if (!document.hidden && state.ws && state.ws.readyState > 1 && state.token) connectWS();
    });
  }

  // ---------------- 启动 ----------------
  async function boot() {
    buildWaveBars();
    bindEvents();
    setAuthMode('login');

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
      setNet(false, '未登录');
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
    } catch (err) {
      state.token = '';
      clearSession();
      showAuth();
      setError(err.message || '登录状态已失效');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
