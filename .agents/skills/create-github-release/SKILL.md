---
name: create-github-release
description: >-
  Use this skill when the user requests to create or draft a GitHub release or beta pre-release,
  such as `create-github-release:release`, `create-github-release:beta`, `draft release`, `create beta release`, or `release draft`.
---

# GitHub Release & Beta Draft Creator Skill

This skill automates fetching previous tags, compiling git commit changelogs & release notes, invoking the `build-release` skill to organize binaries into `artifacts/`, and creating a GitHub release draft with uploaded release assets using the GitHub CLI (`gh`).

## Supported Commands & Modes

* **`create-github-release:release`** (or `draft release`): Creates an official production release draft.
* **`create-github-release:beta`** (or `draft beta`): Creates a pre-release beta draft (`--prerelease`).

---

## Step-by-Step Execution Workflow

### 1. Fetch Previous Tag & Version Context
1. Identify the previous release/beta tag using git & GitHub CLI:
   ```bash
   git describe --tags --abbrev=0
   gh release list --limit 5
   ```
2. Read current `version` from `pc-server/package.json` (e.g. `2.1.0`) and `versionName` from `android-app/app/build.gradle` (e.g. `2.0.0`).
3. Determine:
   * **Previous Version Tag**: e.g., `v2.0.0` or `v2.1.0-beta.1`
   * **New Release Tag**: e.g., `v2.1.0` (for production) or `v2.1.0-beta.1` (for beta)

---

### 2. Generate Release Changelog & Notes
1. Extract git commit log since the previous tag:
   ```bash
   git log <PREVIOUS_TAG>..HEAD --oneline
   ```
2. Read completed features & fixes from `TODO.md` under the target version section.
3. Construct the formatted Markdown release notes body:
   ```markdown
   # StreamPe <NEW_TAG> Release Notes

   **Upgraded from Previous Tag:** `<PREVIOUS_TAG>` ➔ `<NEW_TAG>`

   ## 🚀 What's Changed & Fixed
   * [Feature / Fix 1]
   * [Feature / Fix 2]

   ## 📦 Included Release Binaries
   * `StreamPe-vX.Y.Z-Portable.zip` (Windows PC Desktop Server)
   * `StreamPe-vX.Y.Z-Companion.apk` (Android Companion App)
   ```

---

### 3. Organize Artifact Binaries (`build-release` Skill)
Execute the `build-release` skill procedure to clean and populate `artifacts/`:
```text
artifacts/
├── StreamPe-vX.Y.Z-Portable.zip
└── StreamPe-vX.Y.Z-Companion.apk
```

---

### 4. Create Draft Release on GitHub (`gh release create`)
Execute `gh release create` uploading both binaries with custom release notes:

* **For Production Release**:
  ```bash
  gh release create v2.1.0 artifacts/StreamPe-v2.1.0-Portable.zip artifacts/StreamPe-v2.0.0-Companion.apk --draft --title "StreamPe v2.1.0" --notes "<FORMATTED_NOTES>"
  ```

* **For Beta Pre-Release**:
  ```bash
  gh release create v2.1.0-beta.1 artifacts/StreamPe-v2.1.0-Portable.zip artifacts/StreamPe-v2.0.0-Companion.apk --draft --prerelease --title "StreamPe v2.1.0-beta.1" --notes "<FORMATTED_NOTES>"
  ```

---

## Verification & Summary

1. Verify `gh release create` output draft URL.
2. Present a clean markdown summary table showing:
   * **Target Version & Mode**: Production (`release`) vs Pre-release (`beta`)
   * **Previous Tag Reference**: `<PREVIOUS_TAG>`
   * **Uploaded Binaries**: File sizes (MB) & names
   * **GitHub Draft Link**: Direct link to edit/publish the draft on GitHub
