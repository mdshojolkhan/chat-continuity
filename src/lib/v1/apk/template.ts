/**
 * Android WebView wrapper template for the ZIP-to-APK Builder.
 * These files are pushed to the user's GitHub build repository on first use;
 * the GitHub Actions workflow then compiles a real APK with Gradle.
 * Embedded as strings because the server runtime has no filesystem access.
 */
export const APK_TEMPLATE_FILES: Record<string, string> = {
  "settings.gradle": `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "UniversalZipToAPK"
include(":app")
`,

  "build.gradle": `plugins {
    id 'com.android.application' version '8.7.3' apply false
}
`,

  "app/build.gradle": `plugins {
    id 'com.android.application'
}

android {
    namespace 'com.universal.zipapk'
    compileSdk 35

    defaultConfig {
        applicationId 'com.universal.zipapk'
        minSdk 23
        targetSdk 35
        versionCode 1
        versionName '1.0'
    }
}
`,

  "app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="V1 Built App"
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
`,

  "app/src/main/java/com/universal/zipapk/MainActivity.java": `package com.universal.zipapk;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.view.ViewGroup;
import android.graphics.Color;

public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(18, 18, 28));
        getWindow().setNavigationBarColor(Color.rgb(18, 18, 28));

        webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.rgb(18, 18, 28));

        webView.setLayoutParams(
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
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
`,

  ".github/workflows/android-build.yml": `name: Build Android APK

on:
  workflow_dispatch:
    inputs:
      source_zip_path:
        description: "Repository path to uploaded project ZIP (for example build-input/project.zip)"
        required: false
        default: "build-input/project.zip"
        type: string

permissions:
  contents: read
  actions: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Prepare uploaded website or Android project
        shell: bash
        env:
          SOURCE_ZIP_PATH: \${{ inputs.source_zip_path }}
        run: |
          set -euo pipefail
          if [ -f "$SOURCE_ZIP_PATH" ]; then
            mkdir -p /tmp/user-project
            unzip -q "$SOURCE_ZIP_PATH" -d /tmp/user-project
            ROOT="$(find /tmp/user-project -type f \\( -name AndroidManifest.xml -o -name index.html \\) -printf '%h\\n' | head -n 1 || true)"
            if [ -z "$ROOT" ]; then
              echo "ZIP does not contain AndroidManifest.xml or index.html" >&2
              exit 1
            fi
            if find /tmp/user-project -type f -name AndroidManifest.xml | grep -q .; then
              echo "Android project ZIP detected; this workflow currently builds the repository Android wrapper."
            elif [ -f "$ROOT/index.html" ]; then
              mkdir -p app/src/main/assets
              cp -a "$ROOT"/. app/src/main/assets/
              echo "Web project copied into Android WebView assets."
            else
              echo "Could not locate website index.html" >&2
              exit 1
            fi
          else
            echo "No uploaded ZIP at '$SOURCE_ZIP_PATH'; building the bundled app assets."
          fi

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Build debug APK
        run: gradle --no-daemon assembleDebug

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: Universal-ZIP-to-APK
          path: app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
`,
};

/** Files pushed on every build (the workflow must stay in sync). */
export const APK_TEMPLATE_PATHS = Object.keys(APK_TEMPLATE_FILES);
