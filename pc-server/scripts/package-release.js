/**
 * package-release.js
 * Builds the standalone Portable ZIP bundle for StreamPe.
 * Centrally outputs ONLY StreamPe-v<version>-Portable.zip to dist/ and artifacts/
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pcServerDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(pcServerDir, '..');
const artifactsDir = path.join(rootDir, 'artifacts');

// ── Auto Version Bumping & Multi-File Sync ──────────────────────
function syncAndBumpVersion(bumpArg = 'patch') {
  const pkgPath = path.join(pcServerDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVer = pkg.version || '2.0.0';
  let targetVer = currentVer;

  const arg = (bumpArg || 'patch').toLowerCase().trim();

  if (arg === 'none' || arg === 'current' || arg === 'no-bump' || arg === '--no-bump') {
    console.log(`ℹ️ [Version] Retaining current version: v${currentVer}`);
    targetVer = currentVer;
  } else if (/^\d+\.\d+\.\d+/.test(arg)) {
    targetVer = arg;
    console.log(`⬆️ [Version] Setting explicit version: v${currentVer} ➔ v${targetVer}`);
  } else {
    const parts = currentVer.split('.').map(n => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);

    if (arg === 'major') {
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
    } else if (arg === 'minor') {
      parts[1] += 1;
      parts[2] = 0;
    } else {
      // Default: 'patch'
      parts[2] += 1;
    }
    targetVer = parts.join('.');
    console.log(`⬆️ [Version Bump] Automatically bumped (${arg}): v${currentVer} ➔ v${targetVer}`);
  }

  // 1. Sync package.json
  pkg.version = targetVer;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 2. Sync constants.js
  const constantsPath = path.join(pcServerDir, 'constants.js');
  if (fs.existsSync(constantsPath)) {
    let constants = fs.readFileSync(constantsPath, 'utf8');
    constants = constants.replace(/APP_VERSION\s*=\s*['"][^'"]+['"]/m, `APP_VERSION = '${targetVer}'`);
    fs.writeFileSync(constantsPath, constants, 'utf8');
  }

  // 3. Sync Cargo.toml
  const cargoPath = path.join(pcServerDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    let cargo = fs.readFileSync(cargoPath, 'utf8');
    cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${targetVer}"`);
    fs.writeFileSync(cargoPath, cargo, 'utf8');
  }

  // 4. Sync tauri.conf.json
  const tauriPath = path.join(pcServerDir, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(tauriPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
    tauriConf.version = targetVer;
    fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  }

  return targetVer;
}

const requestedBump = process.argv[2] || 'patch';
const version = syncAndBumpVersion(requestedBump);

console.log(`\n🚀 [Release Builder] Building StreamPe v${version} (Portable Only)`);
console.log('─────────────────────────────────────────────────────────────────');

// 1. Build bun sidecar
console.log('\n[1/3] Compiling Bun sidecar...');
execSync('node scripts/build-bun-sidecar.js', { cwd: pcServerDir, stdio: 'inherit' });

// 2. Run Tauri build without bundle overhead (fast, compiles streampe.exe directly)
console.log('\n[2/3] Building Tauri release application...');
execSync('npx tauri build --no-bundle', { cwd: pcServerDir, stdio: 'inherit' });

// 3. Package Portable ZIP
console.log('\n[3/3] Organizing portable bundle into dist/ ...');

function safeCleanDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  try {
    for (const item of fs.readdirSync(dir)) {
      const p = path.join(dir, item);
      try {
        if (fs.lstatSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        } else {
          fs.unlinkSync(p);
        }
      } catch (_) { }
    }
  } catch (_) { }
}

const pcServerDist = path.join(pcServerDir, 'dist');
const rootDist = path.join(rootDir, 'dist');

if (!fs.existsSync(pcServerDist)) fs.mkdirSync(pcServerDist, { recursive: true });
safeCleanDir(rootDist);
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

// Assemble portable folder under a staging directory so the ZIP contains a clean 'StreamPe' root folder
const stageDir = path.join(pcServerDist, 'stage');
const portableDir = path.join(stageDir, 'StreamPe');
safeCleanDir(stageDir);
fs.mkdirSync(portableDir, { recursive: true });

// Copy main exe (try both streampe.exe and payment-alerts-obs.exe for transition safety)
const mainExeCandidates = [
  path.join(pcServerDir, 'src-tauri', 'target', 'release', 'streampe.exe'),
  path.join(pcServerDir, 'src-tauri', 'target', 'release', 'StreamPe.exe'),
  path.join(pcServerDir, 'src-tauri', 'target', 'release', 'payment-alerts-obs.exe')
];
for (const cand of mainExeCandidates) {
  if (fs.existsSync(cand)) {
    fs.copyFileSync(cand, path.join(portableDir, 'StreamPe.exe'));
    break;
  }
}

// Copy Tauri sidecar binary (production release expects 'server.exe')
const serverSidecar = path.join(pcServerDir, 'src-tauri', 'sidecars', 'server-x86_64-pc-windows-msvc.exe');
if (fs.existsSync(serverSidecar)) {
  fs.copyFileSync(serverSidecar, path.join(portableDir, 'server.exe'));
}

// Copy public web resources & widget config
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(path.join(pcServerDir, 'public'), path.join(portableDir, 'public'));
copyDirRecursive(path.join(pcServerDir, 'templates'), path.join(portableDir, 'templates'));
const widgetConfig = path.join(pcServerDir, 'widget-config.json');
if (fs.existsSync(widgetConfig)) {
  fs.copyFileSync(widgetConfig, path.join(portableDir, 'widget-config.json'));
}
const paymentRules = path.join(pcServerDir, 'payment-rules.json');
if (fs.existsSync(paymentRules)) {
  fs.copyFileSync(paymentRules, path.join(portableDir, 'payment-rules.json'));
}

// Create ZIP from portable folder using PowerShell Compress-Archive (preserving StreamPe/ folder structure)
const zipDstName = `StreamPe-v${version}-Portable.zip`;
const zipDst = path.join(pcServerDist, zipDstName);
console.log(`Creating ${zipDstName}...`);

try {
  execSync(`powershell -Command "Compress-Archive -Path '${portableDir}' -DestinationPath '${zipDst}' -Force"`, {
    stdio: 'inherit'
  });
  try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (_) { }
} catch (e) {
  console.warn('Zip creation warning:', e.message);
}

// Mirror portable zip to root dist/ and artifacts/
if (fs.existsSync(zipDst)) {
  try { fs.copyFileSync(zipDst, path.join(rootDist, zipDstName)); } catch (_) { }
  try { fs.copyFileSync(zipDst, path.join(artifactsDir, zipDstName)); } catch (_) { }
}

// Print Summary
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  ✨ PORTABLE RELEASE ZIP CENTRALLY GENERATED ✨');
console.log('═════════════════════════════════════════════════════════════════');

if (fs.existsSync(zipDst)) {
  const sizeMb = (fs.statSync(zipDst).size / (1024 * 1024)).toFixed(2);
  console.log(` 📂 Portable (.zip) : dist/${zipDstName} (${sizeMb} MB)`);
}
console.log(`\n 📍 Output Locations:`);
console.log(`    • ${pcServerDist}\\${zipDstName}`);
console.log(`    • ${rootDist}\\${zipDstName}`);
console.log(`    • ${artifactsDir}\\${zipDstName}`);
console.log('═════════════════════════════════════════════════════════════════\n');
