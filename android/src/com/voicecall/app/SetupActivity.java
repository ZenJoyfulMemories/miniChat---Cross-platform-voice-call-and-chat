package com.voicecall.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** 首次启动 / 服务器设置：填写地址、检测连通性、授予必要权限。 */
public class SetupActivity extends Activity {
    private static final int REQ_NOTIFICATIONS = 4001;

    private EditText input;
    private TextView status;
    private TextView diagnostics;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        boolean editing = getIntent().getBooleanExtra("editing", false);
        if (!editing && !Prefs.serverUrl(this).isEmpty()) {
            startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            finish();
            return;
        }
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);
        setContentView(buildUi());
        refreshDiagnostics();
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Ui.BG);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(Ui.dp(this, 24), Ui.dp(this, 56), Ui.dp(this, 24), Ui.dp(this, 40));
        scroll.addView(root, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView badge = Ui.text(this, "VOICE CALL", 11, 0x99B9D8FF);
        badge.setLetterSpacing(0.18f);
        badge.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        root.addView(badge);

        TextView title = Ui.text(this, "连接语音通话服务器", 27, Ui.TEXT);
        title.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = Ui.dp(this, 12);
        root.addView(title, titleParams);

        TextView subtitle = Ui.text(this, "输入校园网内运行服务端的地址，例如 https://192.168.0.211:3443", 13, Ui.MUTED);
        subtitle.setLineSpacing(Ui.dp(this, 4), 1f);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = Ui.dp(this, 10);
        root.addView(subtitle, subtitleParams);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.glass(this, 24));
        card.setPadding(Ui.dp(this, 18), Ui.dp(this, 16), Ui.dp(this, 18), Ui.dp(this, 18));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        cardParams.topMargin = Ui.dp(this, 28);
        root.addView(card, cardParams);

        TextView label = Ui.text(this, "服务器地址", 12, Ui.FAINT);
        card.addView(label);

        input = new EditText(this);
        input.setText(Prefs.serverUrl(this));
        input.setHint("https://192.168.0.211:3443");
        input.setHintTextColor(0x55E7EEFF);
        input.setTextColor(Ui.TEXT);
        input.setTextSize(16);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setBackground(Ui.solid(0x14FFFFFF, 14, this, 0x33FFFFFF, 1));
        input.setPadding(Ui.dp(this, 16), Ui.dp(this, 14), Ui.dp(this, 16), Ui.dp(this, 14));
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        inputParams.topMargin = Ui.dp(this, 10);
        card.addView(input, inputParams);

        status = Ui.text(this, "", 12, Ui.FAINT);
        status.setGravity(Gravity.START);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = Ui.dp(this, 14);
        statusParams.leftMargin = Ui.dp(this, 4);
        card.addView(status, statusParams);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams buttonsParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        buttonsParams.topMargin = Ui.dp(this, 20);

        TextView test = Ui.button(this, "测试连接", Ui.TEXT, 0x1FFFFFFF, 16);
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                testConnection();
            }
        });
        buttons.addView(test, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        View spacer = new View(this);
        buttons.addView(spacer, new LinearLayout.LayoutParams(Ui.dp(this, 12), 1));

        TextView save = Ui.button(this, "保存并进入", 0xFF07101E, 0xFFF5F8FF, 16);
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                saveAndOpen();
            }
        });
        buttons.addView(save, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(buttons, buttonsParams);

        TextView perms = Ui.text(this, "保持随时可接听", 14, Ui.TEXT);
        perms.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        LinearLayout.LayoutParams permsParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        permsParams.topMargin = Ui.dp(this, 34);
        root.addView(perms, permsParams);

        LinearLayout permCard = new LinearLayout(this);
        permCard.setOrientation(LinearLayout.VERTICAL);
        permCard.setBackground(Ui.glass(this, 22));
        permCard.setPadding(Ui.dp(this, 16), Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8));
        LinearLayout.LayoutParams permParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        permParams.topMargin = Ui.dp(this, 12);
        root.addView(permCard, permParams);

        permCard.addView(permRow("通知权限", "来电全屏提醒", new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openNotificationPermission();
            }
        }));
        permCard.addView(divider());
        permCard.addView(permRow("电池优化", "避免后台被系统休眠", new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openBatterySettings();
            }
        }));
        permCard.addView(divider());
        permCard.addView(permRow("全屏来电", "锁屏时直接展示来电界面", new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openFullScreenSettings();
            }
        }));
        permCard.addView(divider());
        permCard.addView(permRow("悬浮窗 / 后台弹出", "华为、小米需允许后台弹出界面", new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openOverlaySettings();
            }
        }));
        permCard.addView(divider());
        permCard.addView(permRow("预览来电界面", "检查界面与权限是否正常", new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                previewIncoming();
            }
        }));

        diagnostics = Ui.text(this, "", 12, 0xFF7BE39A);
        diagnostics.setLineSpacing(Ui.dp(this, 5), 1f);
        LinearLayout.LayoutParams diagParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        diagParams.topMargin = Ui.dp(this, 12);
        diagParams.leftMargin = Ui.dp(this, 4);
        root.addView(diagnostics, diagParams);

        TextView tips = Ui.text(this,
            "使用提示\n"
                + "1. 先在电脑上运行服务端，再让手机与电脑处于同一网络\n"
                + "2. 首次连接自签名证书会提示不安全，继续访问即可\n"
                + "3. 华为/荣耀：设置 → 应用和服务 → 应用启动管理，把本应用改为手动管理，"
                + "允许自启动、关联启动、后台活动；并开启通知、锁屏通知\n"
                + "4. 保持应用后台常驻，锁屏也能收到来电\n"
                + "5. 远程通话可用 chmlfrp 映射端口后填写公网地址",
            12, 0x8CE7EEFF);
        tips.setLineSpacing(Ui.dp(this, 6), 1f);
        LinearLayout.LayoutParams tipsParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        tipsParams.topMargin = Ui.dp(this, 26);
        root.addView(tips, tipsParams);

        TextView version = Ui.text(this, "安卓客户端 1.0.5", 11, Ui.FAINT);
        version.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams versionParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        versionParams.topMargin = Ui.dp(this, 30);
        root.addView(version, versionParams);

        return scroll;
    }

    private View permRow(String title, String desc, View.OnClickListener listener) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 14));
        row.setClickable(true);
        row.setOnClickListener(listener);

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        TextView name = Ui.text(this, title, 14, Ui.TEXT);
        TextView detail = Ui.text(this, desc, 11, Ui.FAINT);
        text.addView(name);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        detailParams.topMargin = Ui.dp(this, 3);
        text.addView(detail, detailParams);
        row.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView arrow = Ui.text(this, "›", 20, Ui.FAINT);
        row.addView(arrow);
        return row;
    }

    private View divider() {
        View line = new View(this);
        line.setBackgroundColor(0x1AFFFFFF);
        line.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, Ui.dp(this, 0.6f))));
        return line;
    }

    private void testConnection() {
        final String url = Net.normalize(input.getText().toString());
        if (url.isEmpty()) {
            setStatus("请先填写服务器地址", Ui.RED);
            return;
        }
        setStatus("正在连接…", Ui.FAINT);
        new Thread(new Runnable() {
            @Override
            public void run() {
                String message;
                boolean ok;
                try {
                    String body = Net.health(url);
                    ok = body.contains("ok") || body.contains("voicecall");
                    message = ok ? "连接成功，可以保存" : "服务器响应异常";
                } catch (final Exception err) {
                    ok = false;
                    message = "连接失败：" + (err.getMessage() == null ? err.getClass().getSimpleName() : err.getMessage());
                }
                final boolean success = ok;
                final String text = message;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        setStatus(text, success ? Ui.GREEN : Ui.RED);
                    }
                });
            }
        }).start();
    }

    private void setStatus(String text, int color) {
        if (status == null) return;
        status.setText(text);
        status.setTextColor(color);
    }

    private void saveAndOpen() {
        String url = Net.normalize(input.getText().toString());
        if (url.isEmpty()) {
            setStatus("请先填写服务器地址", Ui.RED);
            return;
        }
        Uri uri = Uri.parse(url);
        if (uri.getHost() == null) {
            setStatus("地址格式不正确，需包含 http(s):// 与主机", Ui.RED);
            return;
        }
        String previous = Prefs.serverUrl(this);
        if (!previous.isEmpty() && !previous.equals(url)) {
            Prefs.clearSession(this);
            CallService.stop(this);
            Bridge.clearPending();
        }
        Prefs.setServerUrl(this, url);
        Intent main = new Intent(this, MainActivity.class);
        main.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(main);
        finish();
    }

    private void openNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        } catch (Exception err) {
            openAppDetails();
        }
    }

    private void openOverlaySettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception err) {
            openAppDetails();
        }
    }

    private void previewIncoming() {
        Intent intent = new Intent(this, IncomingCallActivity.class);
        intent.putExtra("callId", "preview_" + System.currentTimeMillis());
        intent.putExtra("fromId", "alice");
        intent.putExtra("fromName", "林晓雨");
        startActivity(intent);
    }

    private void refreshDiagnostics() {
        if (diagnostics == null) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        boolean notifications = manager != null && manager.areNotificationsEnabled();
        boolean fullScreen;
        if (Build.VERSION.SDK_INT >= 34) {
            fullScreen = manager != null && manager.canUseFullScreenIntent();
        } else {
            fullScreen = true;
        }
        boolean overlay = Settings.canDrawOverlays(this);
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        boolean battery = power != null && power.isIgnoringBatteryOptimizations(getPackageName());
        boolean channel = true;
        if (Build.VERSION.SDK_INT >= 26 && manager != null) {
            android.app.NotificationChannel callChannel = manager.getNotificationChannel(CallService.CH_CALL);
            channel = callChannel == null || callChannel.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
        }
        String text = "当前状态：通知" + (notifications ? "已开启" : "未开启")
            + " · 全屏来电" + (fullScreen ? "已允许" : "未允许")
            + "\n悬浮窗" + (overlay ? "已允许" : "未允许")
            + " · 电池优化" + (battery ? "已忽略" : "未忽略")
            + " · 来电通道" + (channel ? "高优先级" : "被静音");
        diagnostics.setText(text);
        diagnostics.setTextColor(notifications && fullScreen && overlay && channel ? 0xFF7BE39A : 0xFFFFB36B);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshDiagnostics();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        refreshDiagnostics();
    }

    private void openBatterySettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception err) {
            openAppDetails();
        }
    }

    private void openFullScreenSettings() {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                return;
            } catch (Exception ignored) {
                // 回退到应用详情
            }
        }
        openAppDetails();
    }

    private void openAppDetails() {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) {
            // 忽略
        }
    }
}
