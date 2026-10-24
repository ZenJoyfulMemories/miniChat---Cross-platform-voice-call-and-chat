package com.voicecall.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/** 轻量 UI 工具：统一液态玻璃风格的圆角、渐变与文字。 */
final class Ui {
    static final int BG = Color.rgb(14, 15, 17);
    static final int TEXT = Color.rgb(244, 247, 255);
    static final int MUTED = 0xA6E7EEFF;
    static final int FAINT = 0x66E7EEFF;
    static final int GREEN = Color.rgb(48, 209, 88);
    static final int RED = Color.rgb(255, 69, 58);

    private static final String[][] PALETTES = {
        {"#5B8CFF", "#7C5CFF", "#2FD8E8"},
        {"#FF9F6B", "#FF5E8A", "#C86BFF"},
        {"#3EE0A1", "#2BB9C9", "#4F86FF"},
        {"#FFD66B", "#FF8A5C", "#FF5E7E"},
        {"#8F9DFF", "#5F7BFF", "#22C1E0"}
    };

    private Ui() {}

    static int dp(Context ctx, float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, ctx.getResources().getDisplayMetrics()));
    }

    static int sp(Context ctx, float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, ctx.getResources().getDisplayMetrics()));
    }

    static GradientDrawable gradient(int[] colors, float radiusDp, Context ctx) {
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        if (radiusDp > 0) drawable.setCornerRadius(dp(ctx, radiusDp));
        return drawable;
    }

    static GradientDrawable glass(Context ctx, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] {0x2BFFFFFF, 0x0DFFFFFF, 0x1AFFFFFF}
        );
        drawable.setCornerRadius(dp(ctx, radiusDp));
        drawable.setStroke(dp(ctx, 1), 0x38FFFFFF);
        return drawable;
    }

    static GradientDrawable solid(int color, float radiusDp, Context ctx, int strokeColor, float strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(ctx, radiusDp));
        if (strokeDp > 0) drawable.setStroke(dp(ctx, strokeDp), strokeColor);
        return drawable;
    }

    static GradientDrawable circle(Context ctx, int[] colors) {
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setStroke(dp(ctx, 1), 0x55FFFFFF);
        return drawable;
    }

    static GradientDrawable circleSolid(Context ctx, int color, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(color);
        drawable.setStroke(dp(ctx, 1), strokeColor);
        return drawable;
    }

    static GradientDrawable pill(Context ctx, int color, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(ctx, 100));
        drawable.setStroke(dp(ctx, 1), strokeColor);
        return drawable;
    }

    /** 与网页端一致的渐变头像配色。 */
    static int[] palette(String seed) {
        int h = 0;
        String value = seed == null ? "" : seed;
        for (int i = 0; i < value.length(); i++) h = h * 31 + value.charAt(i);
        String[] colors = PALETTES[Math.abs(h) % PALETTES.length];
        return new int[] {Color.parseColor(colors[0]), Color.parseColor(colors[1]), Color.parseColor(colors[2])};
    }

    static String initial(String name) {
        if (name == null || name.trim().isEmpty()) return "?";
        String clean = name.trim();
        int end = clean.offsetByCodePoints(0, 1);
        String first = clean.substring(0, end);
        return first.toUpperCase();
    }

    static TextView text(Context ctx, String value, float sizeSp, int color) {
        TextView view = new TextView(ctx);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        view.setIncludeFontPadding(false);
        return view;
    }

    static TextView title(Context ctx, String value, float sizeSp) {
        TextView view = text(ctx, value, sizeSp, TEXT);
        view.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        view.setGravity(Gravity.CENTER);
        return view;
    }

    static TextView button(Context ctx, String value, int textColor, int background, float radiusDp) {
        TextView view = new TextView(ctx);
        view.setText(value);
        view.setTextSize(15);
        view.setTextColor(textColor);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        view.setBackground(solid(background, radiusDp, ctx, 0x33FFFFFF, 1));
        view.setPadding(dp(ctx, 16), dp(ctx, 13), dp(ctx, 16), dp(ctx, 13));
        view.setClickable(true);
        view.setFocusable(true);
        return view;
    }

    static LinearLayout column(Context ctx) {
        LinearLayout layout = new LinearLayout(ctx);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    static LinearLayout row(Context ctx) {
        LinearLayout layout = new LinearLayout(ctx);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER);
        return layout;
    }

    static void center(TextView view) {
        view.setGravity(Gravity.CENTER);
    }

    static void margin(View view, int left, int top, int right, int bottom) {
        if (view.getLayoutParams() instanceof LinearLayout.LayoutParams) {
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) view.getLayoutParams();
            lp.setMargins(left, top, right, bottom);
            view.setLayoutParams(lp);
        }
    }
}
