# VoiceCall · 网页 + 安卓语音通话与聊天

一套可自托管的跨平台语音通话与即时聊天系统：网页端打开即可呼叫与接听，安卓端在锁屏或后台也能弹出原生来电界面。内置账号、联系人、聊天记录、自定义头像、消息推送提醒，支持中文 / English 与深色 / 浅色主题。

> 品牌图标为「紫色圆角方块 + 深色气泡 + 听筒」的组合图形，全站统一使用，不再使用字母 V 作为标识。

---

## 功能特性

### 语音通话
- WebRTC 纯音频通话，浏览器与安卓端互通
- 网页端保持打开即可接收来电；安卓端未打开应用、锁屏状态下也能响铃并显示来电界面
- 来电全屏通知 + 主动拉起界面双通道，适配华为 / EMUI 等后台限制机型
- 静音、扬声器 / 听筒切换、通话计时、实时声纹条
- 振铃、接听、挂断、新消息均有独立提示音；来电支持震动

### 聊天
- 聊天与通讯录合并为统一列表，按最近消息排序
- 文字消息实时送达、未读红点、输入中状态、消息发送中 / 失败状态
- 浏览器标签页标题闪烁、favicon 红点、系统通知
- 自定义头像上传（自动居中裁剪为 192×192），联系人与设备间实时同步

### 界面与设置
- 微信式三栏布局（桌面端侧边栏 / 移动端底部 Tab）
- 中文 / English 双语切换，覆盖登录、列表、聊天、通话、设置等全部界面文案
- 深色 / 浅色主题一键切换，偏好保存在本地
- 页面切换、列表渲染、Tab 图标均有轻量过渡动画，优先使用 `transform / opacity`

### 稳定性
- WebSocket 断线自动重连（指数退避），重连后按顺序补发 SDP / ICE / 接听状态
- 服务端对离线端的信令做暂存，支持 12 秒重连宽限
- 多层兜底超时（20 / 25 / 30 秒），避免协商失败后界面卡死、双方状态不一致
- 安卓端原生加载失败兜底页：可直接重试或修改服务器地址

---

## 目录结构

```
.
├─ config.json              # 端口、公网地址、TLS、STUN / TURN 配置
├─ start.bat                # Windows 一键启动（自动安装依赖）
├─ server/
│  ├─ index.js              # HTTP / HTTPS / WebSocket 入口与 REST API
│  ├─ lib/store.js          # 账号、联系人、消息、会话持久化
│  ├─ lib/signaling.js      # 在线状态、通话与聊天信令
│  ├─ lib/ice.js            # ICE 服务器下发
│  ├─ test/signaling.test.js# 信令与接口测试
│  └─ data/                 # 运行时数据（已忽略提交）
├─ web/
│  ├─ index.html            # 页面结构与图标 sprite
│  ├─ styles.css            # 深色 / 浅色主题与响应式布局
│  ├─ app.js                # 客户端逻辑、WebRTC、i18n、主题
│  ├─ favicon.svg           # 品牌图标
│  └─ manifest.webmanifest
└─ android/                 # 原生壳工程（WebView + 前台服务 + 来电 Activity）
   ├─ build.ps1             # 构建 / 签名 / 校验脚本
   └─ out/VoiceCall.apk     # 构建产物（已忽略提交）
```

---

## 快速开始

环境要求：Node.js 18+（推荐 20 / 24），安卓构建另需 JDK 21 与 Android SDK 35（脚本已内置工具链）。

### 1. 启动服务端

Windows 下双击 `start.bat`，或手动执行：

```bash
cd server
npm install --omit=dev
npm start
```

启动后：

- 本机：<https://localhost:3443>
- 局域网：`https://<你的局域网 IP>:3443`
- HTTP：`http://<你的局域网 IP>:3000`（局域网设备会 302 跳转到 HTTPS）

首次使用自签名证书，浏览器会提示不安全，选择「继续访问」即可。

### 2. 网页端

用两个浏览器或两台设备分别注册账号 → 在右上角 `+` 搜索对方账号并添加 → 即可聊天或发起语音通话。

### 3. 安卓端

将 `android/out/VoiceCall.apk` 安装到手机，首次打开填写服务器地址（局域网 HTTPS 地址或公网域名）。需要授予通知、悬浮窗 / 后台弹出界面、自启动、麦克风权限，否则来电可能只响铃不显示界面。

重新构建 APK：

```powershell
powershell -ExecutionPolicy Bypass -File android\build.ps1
```

产物：`android/out/VoiceCall.apk`（当前版本 1.0.10）。

### 4. 公网访问（可选）

使用 chmlfrp / frp 等工具将 `3443` 映射到公网，并把域名写入 `config.json`：

```json
{
  "publicUrl": "https://your-domain.example",
  "tls": { "enabled": true, "hosts": ["your-domain.example"] }
}
```

服务端会自动生成包含该域名的自签名证书（SAN），并按请求 Host 判断是否为反向代理场景。公网隧道可能出现 WebSocket 频繁断线，校园网内建议优先使用局域网地址。

---

## 配置说明

| 字段 | 说明 |
| --- | --- |
| `httpPort` / `httpsPort` | 监听端口，默认 3000 / 3443 |
| `publicUrl` | 对外展示的公网地址，写入启动日志与客户端提示 |
| `sessionDays` | 登录 Token 有效期（天） |
| `callRingTimeoutSec` | 振铃超时（秒） |
| `tls.enabled` | 是否启用 HTTPS；未提供证书时自动生成自签名证书 |
| `tls.cert` / `tls.key` | 可选的自有证书路径 |
| `tls.hosts` | 证书需要覆盖的额外域名（自动加入 SAN） |
| `stun` | STUN 服务器列表 |
| `turn.enabled` | 是否启用 TURN；支持静态账号或 `secret` 动态凭证 |

账号密码使用 scrypt 加盐存储，登录 Token 为 HMAC-SHA256 无状态令牌。

---

## 测试

```bash
cd server
npm test          # 信令、联系人、头像、聊天、断线补发等接口测试
```

网页端使用本机 Edge / Chromium 做端到端验证（登录、双人通话、聊天、未读提醒、头像、移动端布局、语言与主题切换）。该测试工具目录不纳入公开仓库。

---

## 已知限制

- 华为 / 小米等机型对后台弹窗限制严格，需手动开启「悬浮窗 / 后台弹出界面」与「自启动」，并关闭电池优化。
- 使用自签名证书时，安卓 WebView 与浏览器需先信任该地址；更换域名后需重新生成证书。
- 公网免费隧道带宽与稳定性有限，弱网下通话可能中断并自动结束。
- TURN 未默认启用；跨 NAT / 严格防火墙环境下建议自建 TURN 服务。

## License

仅供学习与内部使用。
