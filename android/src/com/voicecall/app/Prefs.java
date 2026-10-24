package com.voicecall.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.UUID;

/** 本地会话与服务器配置。 */
final class Prefs {
    private static final String FILE = "voicecall";
    private static final String KEY_SERVER = "serverUrl";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_USER_ID = "userId";
    private static final String KEY_USER_NAME = "userName";
    private static final String KEY_DEVICE = "deviceId";

    private Prefs() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String serverUrl(Context ctx) {
        return prefs(ctx).getString(KEY_SERVER, "");
    }

    static void setServerUrl(Context ctx, String url) {
        prefs(ctx).edit().putString(KEY_SERVER, url).apply();
    }

    static String token(Context ctx) {
        return prefs(ctx).getString(KEY_TOKEN, "");
    }

    static String userId(Context ctx) {
        return prefs(ctx).getString(KEY_USER_ID, "");
    }

    static String userName(Context ctx) {
        return prefs(ctx).getString(KEY_USER_NAME, "");
    }

    static void setSession(Context ctx, String token, String userId, String userName) {
        prefs(ctx).edit()
            .putString(KEY_TOKEN, token == null ? "" : token)
            .putString(KEY_USER_ID, userId == null ? "" : userId)
            .putString(KEY_USER_NAME, userName == null ? "" : userName)
            .apply();
    }

    static void clearSession(Context ctx) {
        prefs(ctx).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_NAME)
            .apply();
    }

    static boolean hasSession(Context ctx) {
        return !token(ctx).isEmpty();
    }

    static String deviceId(Context ctx) {
        String id = prefs(ctx).getString(KEY_DEVICE, "");
        if (id.isEmpty()) {
            id = "android_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            prefs(ctx).edit().putString(KEY_DEVICE, id).apply();
        }
        return id;
    }

    static String sessionJson(Context ctx) {
        try {
            if (!hasSession(ctx)) return "";
            JSONObject user = new JSONObject();
            user.put("id", userId(ctx));
            user.put("name", userName(ctx));
            JSONObject root = new JSONObject();
            root.put("token", token(ctx));
            root.put("user", user);
            return root.toString();
        } catch (Exception err) {
            return "";
        }
    }

    /** 把 https://host:3443 转换为 wss://host:3443/ws?... */
    static String wsUrl(Context ctx) {
        String base = serverUrl(ctx).trim();
        if (base.isEmpty()) return "";
        if (base.startsWith("https://")) base = "wss://" + base.substring(8);
        else if (base.startsWith("http://")) base = "ws://" + base.substring(7);
        else base = "wss://" + base;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/ws?token=" + android.net.Uri.encode(token(ctx))
            + "&deviceId=" + android.net.Uri.encode(deviceId(ctx))
            + "&platform=android";
    }

    static String hostOfServer(Context ctx) {
        try {
            return android.net.Uri.parse(serverUrl(ctx)).getHost();
        } catch (Exception err) {
            return null;
        }
    }
}
