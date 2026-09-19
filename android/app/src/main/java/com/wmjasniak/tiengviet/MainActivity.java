package com.wmjasniak.tiengviet;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Native shell around the bundled web app (assets/www), served via
 * WebViewAssetLoader under a virtual HTTPS origin so fetch()/localStorage/offline
 * all work. Adds two things a bare WebView lacks:
 *   1) a file chooser, so the Reader's file upload works;
 *   2) a native Text-to-Speech bridge (window.AndroidTTS), so Vietnamese audio
 *      works offline via the device TTS engine instead of the desktop-only paths.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int BACKUP_SAVE_REQUEST = 1002;
    private static final int MIC_PERMISSION_REQUEST = 1003;

    // Update check/download: a small static version marker plus the same APK
    // URL the manual GitHub download uses, so "check for updates" is one tiny
    // fetch and "update" is the same file a browser would have downloaded.
    private static final String UPDATE_VERSION_URL =
            "https://github.com/WMJasniak/vietnamese/releases/download/android-latest/version.txt";
    private static final String UPDATE_APK_URL =
            "https://github.com/WMJasniak/vietnamese/releases/download/android-latest/tiengviet.apk";
    private static final String UPDATE_APK_FILENAME = "tiengviet-update.apk";

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingBackupJson;
    // The WebView's own mic permission prompt (Speak tab's getUserMedia/
    // SpeechRecognition) — held here while we go ask the OS-level runtime
    // permission, then resolved from onRequestPermissionsResult.
    private PermissionRequest pendingWebPermissionRequest;

    private TextToSpeech tts;
    private volatile boolean ttsLangOk = false;

    private long pendingUpdateDownloadId = -1;
    private BroadcastReceiver updateDownloadReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                  // localStorage / progress
        settings.setMediaPlaybackRequiresUserGesture(false);  // let TTS/audio play
        settings.setAllowFileAccess(false);                   // we serve via assetLoader, not file://

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        // Needed for <input type="file"> (Reader uploads) to do anything.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            // A bare WebView ignores window.alert/confirm/prompt (confirm returns
            // false → "Cancel"), which silently breaks Stop session, Reset, Delete,
            // etc. Wire them to real native dialogs.
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                final EditText input = new EditText(MainActivity.this);
                if (defaultValue != null) input.setText(defaultValue);
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton(android.R.string.ok,
                                (d, w) -> result.confirm(input.getText().toString()))
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            // The Speak tab's getUserMedia()/SpeechRecognition calls surface here as
            // a WebView-level permission request, separate from (and in addition to)
            // the OS runtime permission below — both have to say yes.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
                    }
                    if (!wantsAudio) { request.deny(); return; }   // e.g. camera — unused, don't grant

                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingWebPermissionRequest = request;
                        ActivityCompat.requestPermissions(MainActivity.this,
                                new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION_REQUEST);
                    }
                });
            }
        });

        // Native Vietnamese TTS, exposed to JS as window.AndroidTTS.
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS && tts != null) {
                int r = tts.setLanguage(new Locale("vi", "VN"));
                ttsLangOk = (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED);
            }
        });
        web.addJavascriptInterface(new TtsBridge(), "AndroidTTS");
        web.addJavascriptInterface(new BackupBridge(), "AndroidBackup");
        web.addJavascriptInterface(new UpdateBridge(), "AndroidUpdater");

        updateDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == pendingUpdateDownloadId) handleUpdateDownloadComplete(id);
            }
        };
        IntentFilter downloadFilter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateDownloadReceiver, downloadFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, downloadFilter);
        }

        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MIC_PERMISSION_REQUEST || pendingWebPermissionRequest == null) return;
        PermissionRequest req = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            req.deny();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            filePathCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
            return;
        }
        if (requestCode == BACKUP_SAVE_REQUEST) {
            String json = pendingBackupJson;
            pendingBackupJson = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && json != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Backup saved", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Backup failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        if (updateDownloadReceiver != null) {
            try { unregisterReceiver(updateDownloadReceiver); } catch (Exception ignored) {}
            updateDownloadReceiver = null;
        }
        super.onDestroy();
    }

    // ── Update check/download ────────────────────────────
    // Calls a window.__onUpdate*() callback in JS (app.js) to report results —
    // mirrors the pattern below rather than returning values synchronously,
    // since both the version check and the download are necessarily async.
    private void notifyJs(String fnName, String rawJsArgs) {
        runOnUiThread(() -> {
            if (web != null) {
                web.evaluateJavascript(
                        "if (window." + fnName + ") window." + fnName + "(" + rawJsArgs + ");", null);
            }
        });
    }

    private static String jsonStr(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", " ").replace("\r", "") + "\"";
    }

    private void handleUpdateDownloadComplete(long id) {
        pendingUpdateDownloadId = -1;
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm == null) { notifyJs("__onUpdateError", jsonStr("Download service unavailable")); return; }
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) {
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    try {
                        Uri apkUri = dm.getUriForDownloadedFile(id);
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(intent);
                    } catch (Exception e) {
                        notifyJs("__onUpdateError", jsonStr("Couldn't open installer: " + e.getMessage()));
                    }
                } else {
                    int reasonIdx = c.getColumnIndex(DownloadManager.COLUMN_REASON);
                    int reason = reasonIdx >= 0 ? c.getInt(reasonIdx) : -1;
                    notifyJs("__onUpdateError", jsonStr("Download failed (code " + reason + ")"));
                }
            } else {
                notifyJs("__onUpdateError", jsonStr("Download record not found"));
            }
        }
    }

    /** Bridge object callable from JS as window.AndroidTTS.*  */
    private class TtsBridge {
        @JavascriptInterface
        public boolean canSpeak() {
            return ttsLangOk && tts != null;
        }

        @JavascriptInterface
        public void speak(final String text) {
            if (text == null || tts == null || !ttsLangOk) return;
            runOnUiThread(() -> {
                if (tts != null) {
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vn-tts");
                }
            });
        }

        /** Opens the system screen to install missing TTS voice data. */
        @JavascriptInterface
        public void installData() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            });
        }
    }

    /** Bridge for exporting a backup file via the system "Save As" dialog (SAF).
     *  Files saved this way (e.g. to Downloads) survive app uninstall/update. */
    private class BackupBridge {
        @JavascriptInterface
        public void export(final String filename, final String content) {
            pendingBackupJson = content;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE,
                            filename != null ? filename : "vietnamese-backup.json");
                    startActivityForResult(intent, BACKUP_SAVE_REQUEST);
                } catch (Exception e) {
                    pendingBackupJson = null;
                    Toast.makeText(MainActivity.this, "Couldn't open the save dialog", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    /** Bridge for in-app update check/download, exposed to JS as
     *  window.AndroidUpdater.* — see js/app.js for the JS-side half
     *  (the window.__onUpdate* callbacks this calls into). */
    private class UpdateBridge {
        @JavascriptInterface
        public void checkForUpdate() {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(UPDATE_VERSION_URL).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setInstanceFollowRedirects(true);
                    int code = conn.getResponseCode();
                    if (code != 200) throw new Exception("HTTP " + code);
                    String latestLine;
                    try (BufferedReader r = new BufferedReader(
                            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                        latestLine = r.readLine();
                    }
                    int latest = Integer.parseInt(latestLine.trim());
                    int current = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                    notifyJs("__onUpdateCheck", latest + "," + current);
                } catch (Exception e) {
                    notifyJs("__onUpdateError",
                            jsonStr("Couldn't check for updates: " + e.getMessage()));
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }).start();
        }

        @JavascriptInterface
        public void downloadAndInstall() {
            runOnUiThread(() -> {
                try {
                    File dest = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), UPDATE_APK_FILENAME);
                    if (dest.exists()) dest.delete();   // DownloadManager refuses to overwrite

                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(UPDATE_APK_URL));
                    req.setTitle("Tiếng Việt update");
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalFilesDir(
                            MainActivity.this, Environment.DIRECTORY_DOWNLOADS, UPDATE_APK_FILENAME);
                    pendingUpdateDownloadId = dm.enqueue(req);
                    notifyJs("__onUpdateDownloadStarted", "");
                } catch (Exception e) {
                    notifyJs("__onUpdateError", jsonStr("Couldn't start the download: " + e.getMessage()));
                }
            });
        }
    }
}
