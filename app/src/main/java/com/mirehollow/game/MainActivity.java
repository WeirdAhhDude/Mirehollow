package com.mirehollow.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * Mirehollow is written as an HTML5 canvas game that lives in assets/web.
 * This activity is a thin full-screen shell around it, plus a small native
 * bridge so the game can call the OpenRouter API without browser CORS limits.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 4242;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("Mirehollow", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }

            // <input type="file"> → the system photo / file picker (used to upload portraits)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Choose a portrait"), PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setupInsets();
        hideSystemBars();
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    /** Keep the game above the soft keyboard (bottom inset) while staying full-screen. */
    private void setupInsets() {
        if (Build.VERSION.SDK_INT >= 30) {
            Window w = getWindow();
            w.setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
                v.setPadding(0, 0, 0, ime);
                return WindowInsets.CONSUMED;
            });
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.evaluateJavascript("window.MH && MH.onPause && MH.onPause()", null);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("(window.MH && MH.ui && MH.ui.back) ? MH.ui.back() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    private void callJs(String js) {
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /** Exposed to JavaScript as window.AndroidBridge */
    private class Bridge {
        @JavascriptInterface
        public void http(final String id, final String method, final String url,
                         final String headersJson, final String body) {
            new Thread(() -> {
                int status = 0;
                String text;
                HttpURLConnection con = null;
                try {
                    con = (HttpURLConnection) new URL(url).openConnection();
                    con.setRequestMethod(method);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(120000);
                    JSONObject h = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
                    Iterator<String> keys = h.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        con.setRequestProperty(k, h.getString(k));
                    }
                    if (body != null && !body.isEmpty() && !"GET".equals(method)) {
                        con.setDoOutput(true);
                        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                        con.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream os = con.getOutputStream()) { os.write(bytes); }
                    }
                    status = con.getResponseCode();
                    InputStream is = status >= 400 ? con.getErrorStream() : con.getInputStream();
                    text = is == null ? "" : readAll(is);
                } catch (Exception e) {
                    text = "{\"error\":{\"message\":" + JSONObject.quote("Network error: " + e.getMessage()) + "}}";
                } finally {
                    if (con != null) con.disconnect();
                }
                callJs("window.MHNative && MHNative.resolve(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(text) + ")");
            }).start();
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Export Mirehollow save"));
            });
        }

        @JavascriptInterface
        public boolean isNative() { return true; }
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
        is.close();
        return bos.toString("UTF-8");
    }
}
