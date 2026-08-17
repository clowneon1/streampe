/**
 * sync-version.js
 * Reads version from package.json and syncs it to Cargo.toml, tauri.conf.json, and android build.gradle.
 * Called automatically by the "version" npm hook after `npm version <bump>`.
 */
const fs = require('fs');
const path = require('path');

const pkgPath    = path.resolve(__dirname, '..', 'package.json');
const cargoPath  = path.resolve(__dirname, '..', 'src-tauri', 'Cargo.toml');
const tauriPath  = path.resolve(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const gradlePath = path.resolve(__dirname, '..', '..', 'android-app', 'app', 'build.gradle');

const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;

// 1. Sync Cargo.toml
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo, 'utf8');

// 2. Sync tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauriConf.version = version;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2), 'utf8');

// 3. Sync Android build.gradle
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionName\s+"[^"]+"/m, `versionName "${version}"`);
  gradle = gradle.replace(/versionCode\s+(\d+)/m, (match, code) => `versionCode ${parseInt(code, 10) + 1}`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log(`✅ Synced version ${version} → Cargo.toml, tauri.conf.json & android build.gradle`);
} else {
  console.log(`✅ Synced version ${version} → Cargo.toml & tauri.conf.json`);
}

