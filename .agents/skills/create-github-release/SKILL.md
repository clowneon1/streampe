---
name: create-github-release
description: >-
  Use this skill when the user requests to create or draft a GitHub release or beta pre-release,
  such as `create-github-release:release`, `create-github-release:beta`, `draft release`, `create beta release`, or `release draft`.
---

# GitHub Release & Beta Draft Creator Skill

This skill automates fetching the latest release tags, invoking the `build-release` skill to collect compiled binaries into `artifacts/`, and creating a GitHub release draft with uploaded release assets using the GitHub CLI (`gh`).

## Supported Commands & Modes

* **`create-github-release:release`** (or `draft release`): Creates an official production release draft.
* **`create-github-release:beta`** (or `draft beta`): Creates a pre-release beta draft (`--prerelease`).

---

## Step-by-Step Workflow

### 1. Fetch Latest Tag & Version Context
1. Query existing tags and GitHub releases:
   ```bash
   git tag -l
   gh release list --limit 5
   ```
2. Read `version` from `pc-server/package.json` (e.g., `2.1.0`) and `versionName` from `android-app/app/build.gradle`.
3. Compute the target tag:
   * **Production Release**: `vX.Y.Z` (e.g. `v2.1.0`)
   * **Beta Release**: `vX.Y.Z-beta.N` (e.g. `v2.1.0-beta.1`)

---

### 2. Organize Artifact Binaries (`build-release` Skill)
Execute the `build-release` skill procedure to ensure root-level `artifacts/` contains:
```text
artifacts/
├── StreamPe-vX.Y.Z-Portable.zip
└── StreamPe-vX.Y.Z-Companion.apk
```

---

### 3. Create Draft Release on GitHub (`gh release create`)
Execute `gh release create` uploading both artifacts from `artifacts/`:

* **For Production Release**:
  ```bash
  gh release create v2.1.0 artifacts/StreamPe-v2.1.0-Portable.zip artifacts/StreamPe-v2.0.0-Companion.apk --draft --title "StreamPe v2.1.0" --generate-notes
  ```

* **For Beta Pre-Release**:
  ```bash
  gh release create v2.1.0-beta.1 artifacts/StreamPe-v2.1.0-Portable.zip artifacts/StreamPe-v2.0.0-Companion.apk --draft --prerelease --title "StreamPe v2.1.0-beta.1" --generate-notes
  ```

---

## Output & Verification

1. Verify `gh release create` output URL.
2. Present a clean markdown summary displaying:
   * Tag Name & Target Mode (Production vs Beta)
   * Uploaded Release Binaries & File Sizes
   * Clickable GitHub Draft URL (e.g., `https://github.com/clowneon1/streampe/releases/tag/...`)
