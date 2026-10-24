package com.voicecall.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;

import java.net.URI;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;

/**
 * 常驻前台服务：独占 WebSocket 信令，负责来电通知、原生来电界面、音频路由。
 * 即使应用界面未打开，也能收到并响铃。
 */
public class CallService extends Service {
    static final String ACTION_CALL_EVENT = "com.voicecall.app.CALL_EVENT";
    static final String ACTION_ANSWER = "com.voicecall.app.action.ANSWER";
    static final String ACTION_DECLINE = "com.voicecall.app.action.DECLINE";
    static final String ACTION_RECONNECT = "com.voicecall.app.action.RECONNECT";

    private static final String CH_SERVICE = "voicecall.service";
    static final String CH_CALL = "voicecall.incoming";
    private static final int NOTIF_SERVICE = 1001;
    private static final int NOTIF_CALL = 1002;

    private static volatile CallService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    /** 连接短暂断开时暂存待发信令（接听、SDP、ICE），重连后补发。 */
    private final ArrayDeque<String> outbox = new ArrayDeque<String>();
    private final Runnable pingTask = new Runnable() {
        @Override
        public void run() {
            sendRaw("{\"type\":\"ping\",\"t\":" + System.currentTimeMillis() + "}");
            handler.postDelayed(this, 25000);
        }
    };
    private final Runnable connectTask = new Runnable() {
        @Override
        public void run() {
            connect();
        }
    };

    private SocketClient client;
    private int retry;
    private boolean closing;
    private boolean inCall;
    private boolean speakerOn;
    private PowerManager.WakeLock wakeLock;
    private AudioFocusRequest focusRequest;
    private AudioManager audioManager;
    private MediaPlayer ringPlayer;
    private Vibrator vibrator;

    private String ringingCallId;
    private String ringingFromId = "";
    private String ringingFromName = "";
    private String pendingCallId;
    private BroadcastReceiver unlockReceiver;
    private Runnable ringTimeoutTask;

    static CallService get() {
        return instance;
    }

    static void start(Context context) {
        Intent intent = new Intent(context, CallService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception ignored) {
            // 系统限制后台启动时忽略，用户下次打开应用会自动重连
        }
    }

    /** 正在响铃时把来电界面重新拉到前台（应用解锁/打开时调用）。 */
    static void surfaceIncoming(Context context) {
        CallService service = instance;
        if (service == null || service.ringingCallId == null || context == null) return;
        try {
            context.startActivity(service.incomingIntent(service.ringingCallId, null));
        } catch (Exception ignored) {
            // 仍被系统拦截时，用户可点击通知进入
        }
    }

    static void stop(Context context) {
        try {
            context.stopService(new Intent(context, CallService.class));
        } catch (Exception ignored) {
            // 忽略
        }
    }

    static void sendStatic(String json) {
        CallService service = instance;
        if (service != null) service.sendRaw(json);
    }

    static void setCallStateStatic(boolean active) {
        CallService service = instance;
        if (service != null) service.setCallState(active);
    }

    static void setSpeakerStatic(boolean on) {
        CallService service = instance;
        if (service != null) service.setSpeaker(on);
    }

    static void answerStatic(String callId) {
        CallService service = instance;
        if (service != null) service.answerCall(callId);
    }

    static void declineStatic(String callId) {
        CallService service = instance;
        if (service != null) service.declineCall(callId);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        registerUnlockReceiver();
        createChannels();
        try {
            startForeground(NOTIF_SERVICE, serviceNotification());
        } catch (Exception ignored) {
            // 部分定制系统可能拒绝前台通知，服务仍继续工作
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_ANSWER.equals(action)) {
                answerCall(intent.getStringExtra("callId"));
            } else if (ACTION_DECLINE.equals(action)) {
                declineCall(intent.getStringExtra("callId"));
            } else if (ACTION_RECONNECT.equals(action)) {
                reconnect();
            }
        }
        if (!Prefs.hasSession(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (client == null || client.isClosed()) connect();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        cleanup();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ---------------- 连接 ----------------

    void reconnect() {
        retry = 0;
        connect();
    }

    private void connect() {
        handler.removeCallbacks(connectTask);
        if (Prefs.token(this).isEmpty()) return;
        String url = Prefs.wsUrl(this);
        if (url.isEmpty()) return;
        closeClient();
        closing = false;
        try {
            SSLContext context = Net.insecureContext();
            SSLSocketFactory factory = context == null ? null : context.getSocketFactory();
            SocketClient next = new SocketClient(URI.create(url), factory);
            next.setConnectionLostTimeout(30);
            client = next;
            next.connect();
        } catch (Exception err) {
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (closing || !Prefs.hasSession(this)) return;
        retry = Math.min(retry + 1, 8);
        long delay = Math.min((long) (1000L * Math.pow(1.7, retry)), 15000L);
        handler.removeCallbacks(connectTask);
        handler.postDelayed(connectTask, delay);
    }

    private void closeClient() {
        SocketClient old = client;
        client = null;
        if (old != null) {
            try {
                old.close();
            } catch (Exception ignored) {
                // 忽略
            }
        }
    }

    private void sendRaw(String json) {
        SocketClient current = client;
        if (current == null || !current.isOpen()) {
            if (!json.contains("\"type\":\"ping\"")) enqueueOutbox(json);
            return;
        }
        try {
            current.send(json);
        } catch (Exception ignored) {
            if (!json.contains("\"type\":\"ping\"")) enqueueOutbox(json);
        }
    }

    private void enqueueOutbox(String json) {
        synchronized (outbox) {
            while (outbox.size() >= 120) outbox.removeFirst();
            outbox.addLast(json);
        }
    }

    /** 重连后补发断线期间产生的接听/SDP/ICE，避免通话协商中断。 */
    private void flushOutbox() {
        SocketClient current = client;
        if (current == null || !current.isOpen()) return;
        List<String> pending;
        synchronized (outbox) {
            pending = new ArrayList<String>(outbox);
            outbox.clear();
        }
        for (String json : pending) {
            try {
                current.send(json);
            } catch (Exception ignored) {
                enqueueOutbox(json);
            }
        }
    }

    // ---------------- 服务端消息 ----------------

    private void handleMessage(String text) {
        JSONObject msg;
        try {
            msg = new JSONObject(text);
        } catch (Exception err) {
            return;
        }
        String type = msg.optString("type");

        if ("ready".equals(type)) {
            Bridge.setOnline(true);
            Bridge.deliver(text);
            return;
        }

        if ("call:incoming".equals(type)) {
            if (ringingCallId != null) {
                try {
                    JSONObject reject = new JSONObject();
                    reject.put("type", "call:reject");
                    reject.put("callId", msg.optString("callId"));
                    reject.put("reason", "busy");
                    sendRaw(reject.toString());
                } catch (Exception ignored) {
                    // 忽略
                }
                return;
            }
            if (Bridge.canShowUi()) {
                Bridge.deliver(text);
                return;
            }
            final JSONObject incoming = msg;
            handler.post(new Runnable() {
                @Override
                public void run() {
                    showIncoming(incoming);
                }
            });
            return;
        }

        if ("call:cancelled".equals(type) || "call:rejected".equals(type) || "call:ended".equals(type)) {
            final String callId = msg.optString("callId");
            handler.post(new Runnable() {
                @Override
                public void run() {
                    dismissIncoming(callId);
                }
            });
            if (pendingCallId != null && pendingCallId.equals(callId)) {
                pendingCallId = null;
                Bridge.clearPending();
            }
            Bridge.deliver(text);
            return;
        }

        Bridge.deliver(text);
    }

    // ---------------- 原生来电 ----------------

    /** 解锁屏幕后若仍在响铃，再次尝试弹出来电界面（华为等机型常拦截后台启动）。 */
    private void registerUnlockReceiver() {
        if (unlockReceiver != null) return;
        unlockReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ringingCallId == null) return;
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        surfaceIncoming(CallService.this);
                    }
                });
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_USER_PRESENT);
        try {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(unlockReceiver, filter);
        } catch (Exception ignored) {
            unlockReceiver = null;
        }
    }

    private void showIncoming(JSONObject msg) {
        if (ringingCallId != null) return;
        String callId = msg.optString("callId");
        if (callId.isEmpty()) return;
        JSONObject from = msg.optJSONObject("from");
        ringingCallId = callId;
        ringingFromId = from == null ? "" : from.optString("id");
        ringingFromName = from == null ? "来电" : from.optString("name");
        if (ringingFromName.isEmpty()) ringingFromName = "来电";

        startRinging();
        showIncomingNotification(callId);
        // 全屏通知在部分系统（华为 EMUI / 小米 MIUI）可能不会被执行，
        // 同时主动拉起来电界面；拥有悬浮窗权限时后台也能成功弹出。
        try {
            startActivity(incomingIntent(callId, null));
        } catch (Exception ignored) {
            // 后台启动被系统拦截时依赖通知横幅兜底
        }
        // 服务端若因断线没送达取消消息，本地到点自动停止响铃，避免一直响
        final String ringId = callId;
        clearRingTimeout();
        ringTimeoutTask = new Runnable() {
            @Override
            public void run() {
                dismissIncoming(ringId);
            }
        };
        handler.postDelayed(ringTimeoutTask, 50000);
    }

    private void clearRingTimeout() {
        if (ringTimeoutTask != null) {
            handler.removeCallbacks(ringTimeoutTask);
            ringTimeoutTask = null;
        }
    }

    private Intent incomingIntent(String callId, String auto) {
        Intent intent = new Intent(this, IncomingCallActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("callId", callId);
        intent.putExtra("fromId", ringingFromId);
        intent.putExtra("fromName", ringingFromName);
        if (auto != null) intent.putExtra("auto", auto);
        return intent;
    }

    private void showIncomingNotification(String callId) {
        try {
            Intent full = incomingIntent(callId, null);
            PendingIntent pending = PendingIntent.getActivity(this, 11, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            PendingIntent answer = PendingIntent.getActivity(this, 12, incomingIntent(callId, "answer"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            PendingIntent decline = PendingIntent.getActivity(this, 13, incomingIntent(callId, "decline"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification.Builder builder = new Notification.Builder(this, CH_CALL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(ringingFromName)
                .setContentText("语音来电")
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(0xFF3B82F6)
                .setFullScreenIntent(pending, true)
                .setContentIntent(pending);

            boolean styled = false;
            if (Build.VERSION.SDK_INT >= 31) {
                try {
                    // 系统原生通话样式（接听 / 拒绝滑杆）
                    Person caller = new Person.Builder()
                        .setName(ringingFromName)
                        .setKey(ringingFromId.isEmpty() ? "voicecall" : ringingFromId)
                        .setImportant(true)
                        .build();
                    builder.setShortcutId("voicecall");
                    builder.setStyle(Notification.CallStyle.forIncomingCall(caller, decline, answer));
                    styled = true;
                } catch (Exception ignored) {
                    styled = false;
                }
            }
            if (!styled) {
                builder.addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_call), "接听", answer).build());
                builder.addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_call_end), "拒绝", decline).build());
            }

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify(NOTIF_CALL, builder.build());
        } catch (Exception ignored) {
            // 通知失败时仍会有铃声与震动
        }
    }

    private void cancelIncomingNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.cancel(NOTIF_CALL);
        } catch (Exception ignored) {
            // 忽略
        }
    }

    void answerCall(String callId) {
        if (callId == null || ringingCallId == null || !ringingCallId.equals(callId)) return;
        try {
            // 先把“已接听”交给页面（页面可见时才立即生效），再通知服务器，
            // 避免对端的 SDP offer 早于页面状态建立而被丢弃。
            JSONObject from = new JSONObject();
            from.put("id", ringingFromId);
            from.put("name", ringingFromName);
            JSONObject pending = new JSONObject();
            pending.put("callId", callId);
            pending.put("from", from);
            Bridge.setPendingAccept(pending.toString());
            pendingCallId = callId;
        } catch (Exception ignored) {
            // 忽略
        }
        stopRinging();
        cancelIncomingNotification();
        ringingCallId = null;
        clearRingTimeout();
        Bridge.flushPendingAccept();
        notifyEvent("answered", callId);
        try {
            JSONObject accept = new JSONObject();
            accept.put("type", "call:accept");
            accept.put("callId", callId);
            sendRaw(accept.toString());
        } catch (Exception ignored) {
            // 忽略
        }
    }

    void declineCall(String callId) {
        if (callId == null || ringingCallId == null || !ringingCallId.equals(callId)) return;
        try {
            JSONObject reject = new JSONObject();
            reject.put("type", "call:reject");
            reject.put("callId", callId);
            reject.put("reason", "declined");
            sendRaw(reject.toString());
        } catch (Exception ignored) {
            // 忽略
        }
        ringingCallId = null;
        stopRinging();
        cancelIncomingNotification();
        clearRingTimeout();
        notifyEvent("dismiss", callId);
    }

    private void dismissIncoming(String callId) {
        if (ringingCallId == null) return;
        if (callId != null && !callId.isEmpty() && !callId.equals(ringingCallId)) return;
        ringingCallId = null;
        stopRinging();
        cancelIncomingNotification();
        clearRingTimeout();
        notifyEvent("dismiss", callId);
    }

    private void notifyEvent(String event, String callId) {
        try {
            Intent intent = new Intent(ACTION_CALL_EVENT);
            intent.setPackage(getPackageName());
            intent.putExtra("event", event);
            intent.putExtra("callId", callId == null ? "" : callId);
            sendBroadcast(intent);
        } catch (Exception ignored) {
            // 忽略
        }
    }

    private void startRinging() {
        stopRinging();
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri != null) {
                MediaPlayer player = new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
                player.setDataSource(this, uri);
                player.setLooping(true);
                player.prepare();
                player.start();
                ringPlayer = player;
            }
        } catch (Exception ignored) {
            ringPlayer = null;
        }
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[] {0, 700, 600};
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {
            // 忽略
        }
    }

    private void stopRinging() {
        if (ringPlayer != null) {
            try {
                ringPlayer.stop();
            } catch (Exception ignored) {
                // 忽略
            }
            try {
                ringPlayer.release();
            } catch (Exception ignored) {
                // 忽略
            }
            ringPlayer = null;
        }
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
            // 忽略
        }
    }

    // ---------------- 音频 ----------------

    void setCallState(boolean active) {
        if (active == inCall) return;
        inCall = active;
        if (active) {
            enterCallMode();
        } else {
            leaveCallMode();
        }
    }

    void setSpeaker(boolean on) {
        speakerOn = on;
        if (audioManager == null) return;
        try {
            audioManager.setSpeakerphoneOn(on);
        } catch (Exception ignored) {
            // 忽略
        }
    }

    private void enterCallMode() {
        try {
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            if (Build.VERSION.SDK_INT >= 26) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setAcceptsDelayedFocusGain(false)
                    .build();
                audioManager.requestAudioFocus(focusRequest);
            }
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(speakerOn);
        } catch (Exception ignored) {
            // 忽略
        }
        try {
            PowerManager manager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "voicecall:call");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(2 * 60 * 60 * 1000L);
        } catch (Exception ignored) {
            wakeLock = null;
        }
    }

    private void leaveCallMode() {
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
            } catch (Exception ignored) {
                // 忽略
            }
            wakeLock = null;
        }
        try {
            if (focusRequest != null && Build.VERSION.SDK_INT >= 26) {
                audioManager.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            }
            audioManager.setSpeakerphoneOn(false);
            audioManager.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception ignored) {
            // 忽略
        }
        speakerOn = false;
    }

    private void cleanup() {
        closing = true;
        if (unlockReceiver != null) {
            try {
                unregisterReceiver(unlockReceiver);
            } catch (Exception ignored) {
                // 忽略
            }
            unlockReceiver = null;
        }
        handler.removeCallbacksAndMessages(null);
        synchronized (outbox) {
            outbox.clear();
        }
        closeClient();
        stopRinging();
        cancelIncomingNotification();
        if (inCall) setCallState(false);
        Bridge.setOnline(false);
        ringingCallId = null;
        pendingCallId = null;
        try {
            stopForeground(true);
        } catch (Exception ignored) {
            // 忽略
        }
    }

    // ---------------- 通知 ----------------

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        NotificationChannel service = new NotificationChannel(CH_SERVICE, "后台通话服务", NotificationManager.IMPORTANCE_LOW);
        service.setDescription("保持在线，随时接听语音来电");
        service.setShowBadge(false);
        manager.createNotificationChannel(service);

        NotificationChannel call = new NotificationChannel(CH_CALL, "语音来电", NotificationManager.IMPORTANCE_HIGH);
        call.setDescription("来电全屏提醒");
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        call.setSound(null, null);
        call.enableVibration(false);
        manager.createNotificationChannel(call);
    }

    private Notification serviceNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 21, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CH_SERVICE)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("语音通话运行中")
            .setContentText("可随时接收来电")
            .setOngoing(true)
            .setContentIntent(content)
            .setPriority(Notification.PRIORITY_LOW)
            .build();
    }

    private final class SocketClient extends WebSocketClient {
        private final SSLSocketFactory factory;

        SocketClient(URI serverUri, SSLSocketFactory factory) {
            super(serverUri);
            this.factory = factory;
            if (factory != null) setSocketFactory(factory);
        }

        @Override
        public void onOpen(ServerHandshake handshake) {
            retry = 0;
            Bridge.setOnline(true);
            flushOutbox();
            handler.removeCallbacks(pingTask);
            handler.postDelayed(pingTask, 20000);
        }

        @Override
        public void onMessage(String message) {
            handleMessage(message);
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            handler.removeCallbacks(pingTask);
            if (client != this) return;
            Bridge.setOnline(false);
            scheduleReconnect();
        }

        @Override
        public void onError(Exception ex) {
            // 由 onClose 统一处理
        }
    }
}
