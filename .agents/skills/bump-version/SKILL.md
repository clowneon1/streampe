---
name: bump-version
description: >-
  Use this skill when the user requests to bump or increment version numbers for StreamPe,
  such as `/bump pc-server:patch android:minor`, `bump pc:patch`, `bump android:minor`, or `bump all:minor`.
---

# StreamPe Component Version Bumper Skill

This skill allows the agent to increment versions independently or simultaneously across the **PC Desktop Server** (`pc-server`) and the **Android Companion App** (`android-app`).

## Command Syntax & Parameters

The user may invoke version bumping using expressions like:
* `/bump pc-server:patch android:minor`
* `bump pc:patch`
* `bump android:minor`
* `bump all:patch` or `bump both:minor`

### Supported Bump Types
* **`patch`**: Increments patch number (`2.0.0` ➔ `2.0.1`). Resets no digits.
* **`minor`**: Increments minor number (`2.0.0` ➔ `2.1.0`). Resets patch to 0.
* **`major`**: Increments major number (`2.0.0` ➔ `3.0.0`). Resets minor and patch to 0.

---

## Component Target Files

### 1. `pc-server` (PC Desktop App & Backend Server)
When `pc-server`, `pc`, `server`, or `desktop` is targetted, update the following 5 files:

1. **[`pc-server/package.json`](file:///d:/xwork/projects/payment-alerts-for-obs/pc-server/package.json)**
   * `"version": "X.Y.Z"`
2. **[`pc-server/src-tauri/Cargo.toml`](file:///d:/xwork/projects/payment-alerts-for-obs/pc-server/src-tauri/Cargo.toml)**
   * `version = "X.Y.Z"`
3. **[`pc-server/src-tauri/tauri.conf.json`](file:///d:/xwork/projects/payment-alerts-for-obs/pc-server/src-tauri/tauri.conf.json)**
   * `"version": "X.Y.Z"`
4. **[`pc-server/server.js`](file:///d:/xwork/projects/payment-alerts-for-obs/pc-server/server.js)**
   * mDNS discovery TXT record: `version: 'X.Y.Z'`
5. **[`pc-server/scripts/build-bun-sidecar.js`](file:///d:/xwork/projects/payment-alerts-for-obs/pc-server/scripts/build-bun-sidecar.js)**
   * Windows metadata flag: `--windows-version "X.Y.Z.0"`

---

### 2. `android` (Android Companion App)
When `android`, `mobile`, or `apk` is targetted, update:

1. **[`android-app/app/build.gradle`](file:///d:/xwork/projects/payment-alerts-for-obs/android-app/app/build.gradle)**
   * `versionName "X.Y.Z"`
   * `versionCode N` (increment integer `N` by 1)

---

## Step-by-Step Execution Workflow

1. **Parse Request**: Read current version from `package.json` (for PC) and `build.gradle` (for Android).
2. **Calculate Target SemVer**: Compute the new version string according to the requested bump type (`patch`, `minor`, `major`).
3. **Edit Files**: Use code edit tools (`replace_file_content`) to update version strings in the corresponding files.
4. **Summary Output**: Present a clear markdown table summarizing the previous version, bump type, and new version for each component.
