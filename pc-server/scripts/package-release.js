/**
 * package-release.js
 * Builds the standalone Portable ZIP bundle.
 * Centrally collects the build output into both pc-server/dist/ and root dist/
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pcServerDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(pcServerDir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(pcServerDir, 'package.json'), 'utf8'));
const version = pkg.version || '2.0.0';

console.log(`\n🚀 [Release Builder] Building Payment Alerts for OBS v${version}`);
console.log('─────────────────────────────────────────────────────────────────');

// 1. Build bun sidecar
console.log('\n[1/3] Compiling Bun sidecar...');
execSync('node scripts/build-bun-sidecar.js', { cwd: pcServerDir, stdio: 'inherit' });

// 2. Run Tauri build (compiles optimized native desktop application)
console.log('\n[2/3] Building Tauri release application...');
execSync('npx tauri build', { cwd: pcServerDir, stdio: 'inherit' });

// 3. Package Portable ZIP
console.log('\n[3/3] Organizing build artifacts into dist/ ...');
const distDirs = [
  path.join(pcServerDir, 'dist'),
  path.join(rootDir, 'dist')
];

distDirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  fs.mkdirSync(d, { recursive: true });
});

const pcServerDist = distDirs[0];

// Assemble portable folder
const portableFolderName = `Payment-Alerts-for-OBS-v${version}-Portable`;
const portableDir = path.join(pcServerDist, portableFolderName);
fs.mkdirSync(portableDir, { recursive: true });

// Copy main exe
const mainExeSrc = path.join(pcServerDir, 'src-tauri', 'target', 'release', 'payment-alerts-obs.exe');
if (fs.existsSync(mainExeSrc)) {
  fs.copyFileSync(mainExeSrc, path.join(portableDir, 'Payment Alerts for OBS.exe'));
}

// Copy sidecar binary
const serverSidecar = path.join(pcServerDir, 'src-tauri', 'sidecars', 'server-x86_64-pc-windows-msvc.exe');
if (fs.existsSync(serverSidecar)) {
  fs.copyFileSync(serverSidecar, path.join(portableDir, 'server.exe'));
}

// Copy public web resources & widget config
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
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
const widgetConfig = path.join(pcServerDir, 'widget-config.json');
if (fs.existsSync(widgetConfig)) {
  fs.copyFileSync(widgetConfig, path.join(portableDir, 'widget-config.json'));
}

// Create ZIP from portable folder using PowerShell Compress-Archive
const zipDstName = `Payment-Alerts-for-OBS-v${version}-Portable.zip`;
const zipDst = path.join(pcServerDist, zipDstName);
console.log(`Creating ${zipDstName}...`);

try {
  execSync(`powershell -Command "Compress-Archive -Path '${portableDir}\\*' -DestinationPath '${zipDst}' -Force"`, {
    stdio: 'inherit'
  });
  // Clean up temporary unzipped directory so dist/ stays clean
  fs.rmSync(portableDir, { recursive: true, force: true });
} catch (e) {
  console.warn('Zip creation warning:', e.message);
}

// Mirror file to root dist/ as well
const rootDist = distDirs[1];
if (fs.existsSync(zipDst)) {
  fs.copyFileSync(zipDst, path.join(rootDist, zipDstName));
}

// Print Summary
console.log('\n═════════════════════════════════════════════════════════════════');
console.log('  ✨ BUILD ARTIFACT CENTRALLY COLLECTED IN dist/ ✨');
console.log('═════════════════════════════════════════════════════════════════');

if (fs.existsSync(zipDst)) {
  const sizeMb = (fs.statSync(zipDst).size / (1024 * 1024)).toFixed(2);
  console.log(` 📂 Portable (.zip) : dist/${zipDstName} (${sizeMb} MB)`);
}
console.log(`\n 📍 Locations:`);
console.log(`    • ${pcServerDist}`);
console.log(`    • ${rootDist}`);
console.log('═════════════════════════════════════════════════════════════════\n');
