package com.voicecall.app;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** 原生全屏来电界面：应用未打开或处于后台时使用。 */
public class IncomingCallActivity extends Activity {
    private String callId = "";
    private BroadcastReceiver receiver;
    private ObjectAnimator pulse;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        callId = getIntent().getStringExtra("callId");
        if (callId == null) callId = "";
        String fromName = getIntent().getStringExtra("fromName");
        String fromId = getIntent().getStringExtra("fromId");
        if (fromName == null || fromName.trim().isEmpty()) fromName = "来电";
        if (fromId == null) fromId = "";

        String auto = getIntent().getStringExtra("auto");
        if ("decline".equals(auto)) {
            CallService.declineStatic(callId);
            finish();
            return;
        }
        if ("answer".equals(auto)) {
            CallService.answerStatic(callId);
            openCallScreen();
            return;
        }

        showOverLockScreen();
        setContentView(buildUi(fromName, fromId));
        startPulse();
    }

    private void showOverLockScreen() {
        getWindow().setBackgroundDrawable(new ColorDrawable(Ui.BG));
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        // EMUI 等系统仅靠 manifest 属性可能不生效，锁屏时主动请求临时解除
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (keyguard != null && keyguard.isKeyguardLocked()) {
                    keyguard.requestDismissKeyguard(this, null);
                }
            } catch (Exception ignored) {
                // 忽略
            }
        }
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);
    }

    private View buildUi(String fromName, String fromId) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);

        addAurora(root, new int[] {0x66B9A4FF, 0x33A78BFA}, 460, Gravity.TOP | Gravity.LEFT, -140, -180);
        addAurora(root, new int[] {0x33C4B5FD, 0x008B5CF6}, 420, Gravity.BOTTOM | Gravity.RIGHT, 0, 120);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(Ui.dp(this, 28), Ui.dp(this, 72), Ui.dp(this, 28), Ui.dp(this, 44));
        root.addView(content, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));

        content.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1f));

        TextView avatar = Ui.text(this, Ui.initial(fromName), 42, Color.WHITE);
        avatar.setGravity(Gravity.CENTER);
        avatar.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        avatar.setBackground(Ui.circle(this, Ui.palette(fromId.isEmpty() ? fromName : fromId)));
        avatar.setElevation(Ui.dp(this, 10));
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(Ui.dp(this, 110), Ui.dp(this, 110));
        content.addView(avatar, avatarParams);

        TextView name = Ui.title(this, fromName, 30);
        name.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        nameParams.topMargin = Ui.dp(this, 26);
        content.addView(name, nameParams);

        TextView status = Ui.text(this, "语音来电", 15, Ui.MUTED);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = Ui.dp(this, 10);
        content.addView(status, statusParams);

        TextView hint = Ui.text(this, "邀请你进行语音通话", 13, Ui.FAINT);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        hintParams.topMargin = Ui.dp(this, 8);
        content.addView(hint, hintParams);

        content.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1f));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        actions.addView(actionButton("拒绝", R.drawable.ic_call_end, new int[] {0xFFFF7B72, 0xFFE0363B}, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                decline();
            }
        }));
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(Ui.dp(this, 64), Ui.dp(this, 1));
        actions.addView(new View(this), gap);
        actions.addView(actionButton("接听", R.drawable.ic_call, new int[] {0xFFC4B5FD, 0xFF8B5CF6}, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                answer();
            }
        }));
        content.addView(actions, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView footer = Ui.text(this, "按返回键可拒接来电", 12, Ui.FAINT);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams footerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        footerParams.topMargin = Ui.dp(this, 34);
        content.addView(footer, footerParams);

        return root;
    }

    private void addAurora(FrameLayout root, int[] colors, int sizeDp, int gravity, int offsetX, int offsetY) {
        View glow = new View(this);
        glow.setBackground(Ui.circle(this, colors));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            Ui.dp(this, sizeDp), Ui.dp(this, sizeDp), gravity
        );
        glow.setTranslationX(Ui.dp(this, offsetX));
        glow.setTranslationY(Ui.dp(this, offsetY));
        root.addView(glow, params);
    }

    private View actionButton(String label, int iconRes, int[] colors, View.OnClickListener listener) {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);

        FrameLayout button = new FrameLayout(this);
        button.setBackground(Ui.circle(this, colors));
        button.setElevation(Ui.dp(this, 12));
        button.setClickable(true);
        button.setFocusable(true);
        button.setOnClickListener(listener);

        ImageView icon = new ImageView(this);
        icon.setImageResource(iconRes);
        icon.setColorFilter(Color.WHITE);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(Ui.dp(this, 30), Ui.dp(this, 30), Gravity.CENTER);
        button.addView(icon, iconParams);
        column.addView(button, new LinearLayout.LayoutParams(Ui.dp(this, 76), Ui.dp(this, 76)));

        TextView text = Ui.text(this, label, 13, Ui.MUTED);
        text.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        textParams.topMargin = Ui.dp(this, 12);
        column.addView(text, textParams);
        return column;
    }

    /** 头像呼吸动画，提示来电正在响铃。 */
    private void startPulse() {
        View avatar = null;
        ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
        if (root != null && root.getChildCount() > 0 && root.getChildAt(0) instanceof ViewGroup) {
            ViewGroup frame = (ViewGroup) root.getChildAt(0);
            for (int i = 0; i < frame.getChildCount(); i++) {
                View child = frame.getChildAt(i);
                if (child instanceof LinearLayout) {
                    avatar = ((LinearLayout) child).getChildAt(1);
                    break;
                }
            }
        }
        if (avatar == null) return;
        pulse = ObjectAnimator.ofPropertyValuesHolder(
            avatar,
            PropertyValuesHolder.ofFloat("scaleX", 1f, 1.06f),
            PropertyValuesHolder.ofFloat("scaleY", 1f, 1.06f)
        );
        pulse.setDuration(1100);
        pulse.setRepeatCount(ObjectAnimator.INFINITE);
        pulse.setRepeatMode(ObjectAnimator.REVERSE);
        pulse.start();
    }

    private void answer() {
        CallService.answerStatic(callId);
        openCallScreen();
    }

    private void openCallScreen() {
        Intent main = new Intent(this, MainActivity.class);
        main.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(main);
        } catch (Exception ignored) {
            // 忽略
        }
        finish();
    }

    private void decline() {
        CallService.declineStatic(callId);
        finish();
    }

    @Override
    protected void onStart() {
        super.onStart();
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String event = intent.getStringExtra("event");
                String id = intent.getStringExtra("callId");
                if ("dismiss".equals(event) && (id == null || id.isEmpty() || id.equals(callId))) {
                    finish();
                }
            }
        };
        IntentFilter filter = new IntentFilter(CallService.ACTION_CALL_EVENT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, filter);
        }
    }

    @Override
    protected void onStop() {
        if (receiver != null) {
            try {
                unregisterReceiver(receiver);
            } catch (Exception ignored) {
                // 忽略
            }
            receiver = null;
        }
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (pulse != null) {
            pulse.cancel();
            pulse = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        decline();
    }
}
