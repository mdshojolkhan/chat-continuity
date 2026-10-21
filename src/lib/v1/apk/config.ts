/**
 * Per-project Android app configuration for the ZIP-to-APK Builder.
 * Shared by the browser (form + validation) and the server (validation +
 * generation of the real Android project files committed before each build).
 * Stored as a Workspace File at ANDROID_CONFIG_PATH in the project's namespace.
 */
export const ANDROID_CONFIG_PATH = ".v1/android-config.json";

export type PermissionInfo = {
  id: string;
  label: string;
  description: string;
  dangerous: boolean;
};

/** Supported permissions. Dangerous ones are never enabled by default and are only granted at runtime by the user. */
export const ANDROID_PERMISSIONS: PermissionInfo[] = [
  { id: "INTERNET", label: "Internet", description: "Load online pages, APIs and images.", dangerous: false },
  { id: "ACCESS_NETWORK_STATE", label: "Network state", description: "Check whether the device is online.", dangerous: false },
  { id: "VIBRATE", label: "Vibrate", description: "Let the app vibrate the phone.", dangerous: false },
  { id: "CAMERA", label: "Camera", description: "Take photos or video from the web app. The user is asked at runtime.", dangerous: true },
  { id: "RECORD_AUDIO", label: "Microphone", description: "Record audio from the web app. The user is asked at runtime.", dangerous: true },
  { id: "ACCESS_FINE_LOCATION", label: "Precise location", description: "Use GPS location. The user is asked at runtime.", dangerous: true },
  { id: "ACCESS_COARSE_LOCATION", label: "Approximate location", description: "Use network-based location. The user is asked at runtime.", dangerous: true },
  { id: "POST_NOTIFICATIONS", label: "Notifications", description: "Show notifications (Android 13+). The user is asked at runtime.", dangerous: true },
];

export const ICON_DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 } as const;
export type IconDensity = keyof typeof ICON_DENSITIES;
export const ADAPTIVE_FOREGROUND_SIZE = 432;
export const SPLASH_LOGO_SIZE = 288;

export type AndroidConfig = {
  appName: string;
  packageName: string;
  developerName: string;
  versionName: string;
  versionCode: number;
  /** Base64 PNG (no data: prefix) per density, generated in the browser from the uploaded logo. */
  icons: Partial<Record<IconDensity, string>> | null;
  /** Base64 PNG for the adaptive icon foreground (432×432, logo in safe zone). */
  adaptiveForeground: string | null;
  iconBackground: string;
  splash: {
    enabled: boolean;
    logo: string | null;
    backgroundColor: string;
    showAppName: boolean;
  };
  permissions: string[];
};

export const DEFAULT_ANDROID_CONFIG: AndroidConfig = {
  appName: "V1 Built App",
  packageName: "com.universal.zipapk",
  developerName: "",
  versionName: "1.0",
  versionCode: 1,
  icons: null,
  adaptiveForeground: null,
  iconBackground: "#12121C",
  splash: { enabled: false, logo: null, backgroundColor: "#12121C", showAppName: true },
  permissions: ["INTERNET"],
};

const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const JAVA_KEYWORDS = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null".split(" "),
);
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_B64 = 400_000;

export function validatePackageName(name: string): string | null {
  if (!PACKAGE_RE.test(name)) {
    return "Package name must look like com.company.app: lowercase letters, digits or _, at least two parts, each starting with a letter.";
  }
  if (name.split(".").some((p) => JAVA_KEYWORDS.has(p))) return "Package name parts cannot be Java keywords.";
  if (name.length > 150) return "Package name is too long.";
  return null;
}

export function validateVersionCode(code: unknown): string | null {
  if (typeof code !== "number" || !Number.isInteger(code) || code < 1 || code > 2_100_000_000) {
    return "Version code must be a whole number between 1 and 2100000000.";
  }
  return null;
}

function validImage(b64: unknown): boolean {
  return typeof b64 === "string" && b64.length > 0 && b64.length <= MAX_IMAGE_B64 && BASE64_RE.test(b64);
}

/** Returns a list of human-readable problems; empty means valid. */
export function validateAndroidConfig(c: AndroidConfig): string[] {
  const errors: string[] = [];
  const name = (c.appName ?? "").trim();
  if (!name) errors.push("App name is required.");
  else if (name.length > 50) errors.push("App name must be 50 characters or fewer.");
  const pkg = validatePackageName(c.packageName ?? "");
  if (pkg) errors.push(pkg);
  if ((c.developerName ?? "").length > 80) errors.push("Developer name must be 80 characters or fewer.");
  if (!/^[0-9A-Za-z][0-9A-Za-z.\-_ ]{0,29}$/.test(c.versionName ?? "")) {
    errors.push("Version name must be 1–30 characters, e.g. 1.0.0.");
  }
  const vc = validateVersionCode(c.versionCode);
  if (vc) errors.push(vc);
  if (!COLOR_RE.test(c.iconBackground ?? "")) errors.push("Icon background must be a color like #12121C.");
  if (c.icons) {
    for (const d of Object.keys(ICON_DENSITIES) as IconDensity[]) {
      if (!validImage(c.icons[d])) {
        errors.push("The launcher icon set is incomplete. Upload the logo again.");
        break;
      }
    }
  }
  if (c.adaptiveForeground !== null && !validImage(c.adaptiveForeground)) errors.push("Adaptive icon is invalid. Upload the logo again.");
  if (!c.splash || !COLOR_RE.test(c.splash.backgroundColor ?? "")) errors.push("Splash background must be a color like #12121C.");
  if (c.splash?.logo !== null && c.splash?.logo !== undefined && !validImage(c.splash.logo)) errors.push("Splash logo is invalid. Upload it again.");
  const known = new Set(ANDROID_PERMISSIONS.map((p) => p.id));
  if (!Array.isArray(c.permissions) || c.permissions.some((p) => !known.has(p))) errors.push("Unknown Android permission selected.");
  return errors;
}

/** Merges stored JSON over defaults so older/partial files still load. */
export function parseAndroidConfig(raw: string | null | undefined): AndroidConfig {
  if (!raw) return structuredClone(DEFAULT_ANDROID_CONFIG);
  try {
    const v = JSON.parse(raw) as Partial<AndroidConfig>;
    return {
      ...structuredClone(DEFAULT_ANDROID_CONFIG),
      ...v,
      splash: { ...DEFAULT_ANDROID_CONFIG.splash, ...(v.splash ?? {}) },
      permissions: Array.isArray(v.permissions) ? v.permissions : [...DEFAULT_ANDROID_CONFIG.permissions],
    };
  } catch {
    return structuredClone(DEFAULT_ANDROID_CONFIG);
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "\\'");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function generateManifest(c: AndroidConfig): string {
  const perms = ANDROID_PERMISSIONS.filter((p) => c.permissions.includes(p.id))
    .map((p) => `    <uses-permission android:name="android.permission.${p.id}" />`)
    .join("\n");
  const icon = c.icons ? `\n        android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher"` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

${perms}

    <application
        android:label="@string/app_name"${icon}
        android:theme="@android:style/Theme.Material.Light.NoActionBar"
        android:usesCleartextTraffic="false"
        android:allowBackup="false"
        android:supportsRtl="true">

        <activity
            android:name="com.universal.zipapk.MainActivity"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

    </application>

</manifest>
`;
}

export function generateAppGradle(c: AndroidConfig): string {
  return `plugins {
    id 'com.android.application'
}

android {
    namespace 'com.universal.zipapk'
    compileSdk 35

    defaultConfig {
        applicationId '${c.packageName}'
        minSdk 23
        targetSdk 35
        versionCode ${c.versionCode}
        versionName '${c.versionName.replace(/'/g, "")}'
    }
}
`;
}

export function generateMainActivity(c: AndroidConfig): string {
  const s = c.splash;
  const splashBg = rgb(s.backgroundColor);
  const splashCode = s.enabled
    ? `
        final FrameLayout splash = new FrameLayout(this);
        splash.setBackgroundColor(Color.rgb(${splashBg}));
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        ${s.logo ? `ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        int px = (int) (144 * getResources().getDisplayMetrics().density);
        box.addView(logo, new LinearLayout.LayoutParams(px, px));` : ""}
        ${s.showAppName ? `TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(isDark(Color.rgb(${splashBg})) ? Color.WHITE : Color.BLACK);
        title.setPadding(0, 24, 0, 0);
        box.addView(title);` : ""}
        splash.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { root.removeView(splash); }
        }, 1500);`
    : "";
  return `package com.universal.zipapk;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final int REQ_WEB = 41;
    private static final int REQ_GEO = 42;
    private WebView webView;
    private PermissionRequest pendingWeb;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeo;

    private static boolean isDark(int color) {
        return (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000 < 140;
    }

    private boolean declared(String perm) {
        try {
            String[] list = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (list == null) return false;
            for (String p : list) if (p.equals(perm)) return true;
        } catch (Exception ignored) { }
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(${splashBg}));
        getWindow().setNavigationBarColor(Color.rgb(${splashBg}));

        final FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(declared("android.permission.ACCESS_FINE_LOCATION") || declared("android.permission.ACCESS_COARSE_LOCATION"));

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            // Web permission requests are only granted after the user approves the Android runtime prompt.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                List<String> needed = new ArrayList<>();
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && declared("android.permission.CAMERA")) needed.add("android.permission.CAMERA");
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && declared("android.permission.RECORD_AUDIO")) needed.add("android.permission.RECORD_AUDIO");
                }
                if (needed.isEmpty()) { request.deny(); return; }
                pendingWeb = request;
                requestPermissions(needed.toArray(new String[0]), REQ_WEB);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                List<String> needed = new ArrayList<>();
                if (declared("android.permission.ACCESS_FINE_LOCATION")) needed.add("android.permission.ACCESS_FINE_LOCATION");
                if (declared("android.permission.ACCESS_COARSE_LOCATION")) needed.add("android.permission.ACCESS_COARSE_LOCATION");
                if (needed.isEmpty()) { callback.invoke(origin, false, false); return; }
                pendingGeoOrigin = origin;
                pendingGeo = callback;
                requestPermissions(needed.toArray(new String[0]), REQ_GEO);
            }
        });
        webView.setBackgroundColor(Color.rgb(${splashBg}));
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
${splashCode}
        setContentView(root);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean granted = results.length > 0;
        for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) granted = false;
        if (requestCode == REQ_WEB && pendingWeb != null) {
            if (granted) pendingWeb.grant(pendingWeb.getResources()); else pendingWeb.deny();
            pendingWeb = null;
        } else if (requestCode == REQ_GEO && pendingGeo != null) {
            pendingGeo.invoke(pendingGeoOrigin, granted, false);
            pendingGeo = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}

/** All Android project files generated from the config, committed before each build. */
export function generateAndroidFiles(c: AndroidConfig): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {
    "app/build.gradle": generateAppGradle(c),
    "app/src/main/AndroidManifest.xml": generateManifest(c),
    "app/src/main/java/com/universal/zipapk/MainActivity.java": generateMainActivity(c),
    "app/src/main/res/values/strings.xml": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${xmlEscape(c.appName.trim())}</string>
    <string name="developer_name">${xmlEscape(c.developerName.trim())}</string>
</resources>
`,
    "app/src/main/res/values/colors.xml": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${c.iconBackground}</color>
</resources>
`,
  };
  if (c.icons) {
    for (const d of Object.keys(ICON_DENSITIES) as IconDensity[]) {
      files[`app/src/main/res/mipmap-${d}/ic_launcher.png`] = base64ToBytes(c.icons[d]!);
    }
    if (c.adaptiveForeground) {
      files["app/src/main/res/drawable-nodpi/ic_launcher_foreground.png"] = base64ToBytes(c.adaptiveForeground);
      files["app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
    }
  }
  if (c.splash.enabled && c.splash.logo) {
    files["app/src/main/res/drawable-nodpi/splash_logo.png"] = base64ToBytes(c.splash.logo);
  }
  return files;
}
