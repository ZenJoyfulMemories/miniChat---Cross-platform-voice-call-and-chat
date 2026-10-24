package com.voicecall.app;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** 承载网页端界面的容器，原生层负责信令与权限。 */
public class MainActivity extends Activity {
    private static final int REQ_PERMISSIONS = 3001;

    private WebView web;
    private FrameLayout container;
    private View splash;
    private boolean keepScreenOn;

    private final Bridge.Page page = new Bridge.Page() {
        @Override
        public void onSignaling(String json) {
            postJs("window.VC&&window.VC.onSignaling(" + JSONObject.quote(json) + ")");
        }

        @Override
        public void onTransport(boolean online) {
            postJs("window.VC&&window.VC.onTransportState(" + online + ")");
        }

        @Override
        public void onPendingAccept(String json) {
            postJs("window.VC&&window.VC.onPendingAccept(" + JSONObject.quote(json) + ")");
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String server = Prefs.serverUrl(this);
        if (server.isEmpty()) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        getWindow().setBackgroundDrawable(new ColorDrawable(Ui.BG));
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);

        if (Prefs.hasSession(this)) CallService.start(this);

        container = new FrameLayout(this);
        container.setBackgroundColor(Ui.BG);
        web = new WebView(this);
        web.setBackgroundColor(Ui.BG);

        container.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        splash = buildSplash();
        container.addView(splash, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(container);

        configureWeb();
        requestNeededPermissions();
        checkAlertPermissions();
        web.loadUrl(server + "/");
    }

    /** 页面就绪前的深色占位，避免 WebView 初始化阶段闪白屏。 */
    private View buildSplash() {
        FrameLayout layer = new FrameLayout(this);
        layer.setBackgroundColor(Ui.BG);

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView mark = Ui.text(this, "语音通话", 23, Ui.TEXT);
        mark.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD));
        center.addView(mark);

        TextView hint = Ui.text(this, "正在连接…", 12, Ui.FAINT);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        hintParams.topMargin = Ui.dp(this, 10);
        center.addView(hint, hintParams);

        layer.addView(center, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER
        ));
        return layer;
    }

    private void hideSplash() {
        final View target = splash;
        if (target == null) return;
        splash = null;
        target.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
            @Override
            public void run() {
                if (container != null) container.removeView(target);
            }
        }).start();
    }

    /** 华为/小米等机型缺少这些权限时，来电只响铃、不显示界面。 */
    private void checkAlertPermissions() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        boolean notifications = manager != null && manager.areNotificationsEnabled();
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            fullScreen = manager != null && manager.canUseFullScreenIntent();
        }
        boolean overlay = Settings.canDrawOverlays(this);
        boolean channel = true;
        if (Build.VERSION.SDK_INT >= 26 && manager != null) {
            NotificationChannel callChannel = manager.getNotificationChannel(CallService.CH_CALL);
            channel = callChannel == null || callChannel.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
        }
        String message = null;
        if (!notifications) {
            message = "通知权限未开启：来电只会响铃，请允许通知";
        } else if (!fullScreen) {
            message = "全屏来电未允许：请在设置中允许本应用全屏通知";
        } else if (!channel) {
            message = "来电通知通道被静默：请到通知设置中调高“语音来电”重要性";
        } else if (!overlay) {
            message = "未允许悬浮窗/后台弹出：华为、小米可能无法弹出来电界面";
        }
        if (message != null) {
            Toast.makeText(this, message + "（可点右上角设置 → 服务器与权限检查）", Toast.LENGTH_LONG).show();
        }
    }

    private void configureWeb() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setSupportZoom(false);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(false);

        web.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                boolean audio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
                }
                if (audio) request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else request.deny();
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String host = Prefs.hostOfServer(MainActivity.this);
                String errorHost = null;
                try {
                    errorHost = Uri.parse(error.getUrl()).getHost();
                } catch (Exception ignored) {
                    // 忽略
                }
                if (host != null && errorHost != null && host.equalsIgnoreCase(errorHost)) {
                    handler.proceed();
                } else {
                    handler.cancel();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (keepScreenOn) view.setKeepScreenOn(true);
                hideSplash();
            }
        });
    }

    private void requestNeededPermissions() {
        List<String> missing = new ArrayList<String>();
        if (Build.VERSION.SDK_INT >= 23
            && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            missing.add(android.Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(android.Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQ_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        // 权限授予后页面会在需要时自行发起麦克风请求，无需刷新
    }

    private void postJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    try {
                        web.evaluateJavascript(js, null);
                    } catch (Exception ignored) {
                        // 页面可能已销毁
                    }
                }
            }
        });
    }

    private void updateKeepScreenOn(boolean active) {
        keepScreenOn = active;
        if (active) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (web != null) web.setKeepScreenOn(true);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (web != null) web.setKeepScreenOn(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Bridge.setAppVisible(true);
        Bridge.flushPendingAccept();
        if (Prefs.hasSession(this)) CallService.start(this);
        // 如果打开应用时仍在响铃，直接进入来电界面，而不是停留在主页
        CallService.surfaceIncoming(this);
    }

    @Override
    protected void onPause() {
        Bridge.setAppVisible(false);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        Bridge.detach(page);
        if (web != null) {
            try {
                web.loadUrl("about:blank");
                web.destroy();
            } catch (Exception ignored) {
                // 忽略
            }
            web = null;
        }
        container = null;
        splash = null;
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // 先让页面关闭聊天/弹层，页面没有可关闭内容时才退到后台
        web.evaluateJavascript(
            "(function(){try{return window.VC&&window.VC.handleBack?window.VC.handleBack():false}catch(e){return false}})()",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (!"true".equals(value)) moveTaskToBack(true);
                }
            }
        );
    }

    /** JS 通过 window.AndroidBridge 调用的原生能力。 */
    private final class NativeBridge {
        @JavascriptInterface
        public void send(String json) {
            CallService service = CallService.get();
            if (service == null) {
                Bridge.setOnline(false);
                return;
            }
            CallService.sendStatic(json);
        }

        @JavascriptInterface
        public void onLogin(final String token, String userId, String userName) {
            Prefs.setSession(MainActivity.this, token, userId, userName);
            if (CallService.get() == null) CallService.start(MainActivity.this);
            else CallService.get().reconnect();
        }

        @JavascriptInterface
        public void onLogout() {
            Prefs.clearSession(MainActivity.this);
            Bridge.clearPending();
            CallService.stop(MainActivity.this);
        }

        @JavascriptInterface
        public String getSession() {
            return Prefs.sessionJson(MainActivity.this);
        }

        @JavascriptInterface
        public String getPendingCall() {
            return Bridge.peekPendingAccept();
        }

        @JavascriptInterface
        public void onBridgeReady() {
            Bridge.attach(page);
        }

        @JavascriptInterface
        public void setCallState(final boolean active) {
            CallService.setCallStateStatic(active);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    updateKeepScreenOn(active);
                }
            });
        }

        @JavascriptInterface
        public void setSpeaker(boolean on) {
            CallService.setSpeakerStatic(on);
        }

        @JavascriptInterface
        public void openServerSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(new Intent(MainActivity.this, SetupActivity.class).putExtra("editing", true));
                }
            });
        }
    }
}
