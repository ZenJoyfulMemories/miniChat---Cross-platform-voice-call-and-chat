package com.voicecall.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/** 网络辅助：规范化服务器地址、放行自签名证书、健康检查。 */
final class Net {
    private static SSLContext insecure;

    private Net() {}

    static SSLContext insecureContext() {
        if (insecure != null) return insecure;
        try {
            TrustManager[] managers = new TrustManager[] {new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType) {}

                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType) {}

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }};
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, managers, new SecureRandom());
            insecure = context;
        } catch (Exception err) {
            insecure = null;
        }
        return insecure;
    }

    static String normalize(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "https://" + value;
        }
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    /** 带超时的健康检查，返回服务器版本信息。 */
    static String health(String serverUrl) throws Exception {
        String base = normalize(serverUrl);
        if (base.isEmpty()) throw new IllegalArgumentException("请填写服务器地址");
        HttpURLConnection conn = (HttpURLConnection) new URL(base + "/api/health").openConnection();
        if (conn instanceof HttpsURLConnection) {
            SSLContext context = insecureContext();
            if (context != null) {
                ((HttpsURLConnection) conn).setSSLSocketFactory(context.getSocketFactory());
                ((HttpsURLConnection) conn).setHostnameVerifier(new HostnameVerifier() {
                    @Override
                    public boolean verify(String hostname, SSLSession session) {
                        return true;
                    }
                });
            }
        }
        conn.setConnectTimeout(6000);
        conn.setReadTimeout(6000);
        conn.setRequestMethod("GET");
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new IllegalStateException("服务器返回 " + code);
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
            reader.close();
            return text.length() > 0 ? text.toString() : "ok";
        } finally {
            conn.disconnect();
        }
    }
}
