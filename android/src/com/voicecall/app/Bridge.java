package com.voicecall.app;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * 后台服务与 WebView 页面之间的桥接层。
 * 页面未就绪时缓存消息，页面就绪后按顺序回放。
 */
final class Bridge {
    interface Page {
        void onSignaling(String json);

        void onTransport(boolean online);

        void onPendingAccept(String json);
    }

    private static final Object LOCK = new Object();
    private static final ArrayDeque<String> QUEUE = new ArrayDeque<String>();
    private static final int MAX_QUEUE = 400;

    private static Page page;
    private static boolean uiReady;
    private static boolean appVisible;
    private static boolean online;
    private static String pendingAccept;

    private Bridge() {}

    static void attach(Page next) {
        String pending = null;
        List<String> backlog = null;
        synchronized (LOCK) {
            page = next;
            uiReady = true;
            // 页面可见时才立即交付原生接听结果，否则等 onResume 再交付，避免后台采集麦克风
            if (pendingAccept != null && appVisible) {
                pending = pendingAccept;
                pendingAccept = null;
            }
            if (pendingAccept == null) {
                backlog = new ArrayList<String>(QUEUE);
                QUEUE.clear();
            }
        }
        if (pending != null) {
            next.onPendingAccept(pending);
        }
        next.onTransport(online);
        if (backlog != null) {
            for (String json : backlog) next.onSignaling(json);
        }
    }

    static void detach(Page target) {
        synchronized (LOCK) {
            if (page != target) return;
            page = null;
            uiReady = false;
        }
    }

    static void setAppVisible(boolean visible) {
        appVisible = visible;
    }

    /** 页面可见且已完成登录初始化时，来电交给网页 UI 处理。 */
    static boolean canShowUi() {
        return page != null && uiReady && appVisible;
    }

    static void deliver(String json) {
        Page target;
        synchronized (LOCK) {
            target = page;
            // 原生接听结果尚未交给页面时，后续信令必须排队，保证页面先建立通话状态
            if (target == null || !uiReady || pendingAccept != null) {
                if (QUEUE.size() >= MAX_QUEUE) QUEUE.removeFirst();
                QUEUE.addLast(json);
                return;
            }
        }
        target.onSignaling(json);
    }

    static void setOnline(boolean value) {
        Page target;
        synchronized (LOCK) {
            online = value;
            target = page;
        }
        if (target != null) target.onTransport(value);
    }

    static void setPendingAccept(String json) {
        synchronized (LOCK) {
            pendingAccept = json;
        }
    }

    static String peekPendingAccept() {
        synchronized (LOCK) {
            return pendingAccept == null ? "" : pendingAccept;
        }
    }

    /** 页面可见时把原生接听结果交给页面，并回放期间排队的信令。 */
    static void flushPendingAccept() {
        Page target;
        String json;
        List<String> backlog = null;
        synchronized (LOCK) {
            target = page;
            json = pendingAccept;
            if (target == null || json == null || !uiReady || !appVisible) return;
            pendingAccept = null;
            backlog = new ArrayList<String>(QUEUE);
            QUEUE.clear();
        }
        target.onPendingAccept(json);
        if (backlog != null) {
            for (String item : backlog) target.onSignaling(item);
        }
    }

    static void clearPending() {
        synchronized (LOCK) {
            pendingAccept = null;
            QUEUE.clear();
        }
    }
}
