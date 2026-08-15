/**
 * Build script: compiles server.js into a self-contained Windows exe using bun.
 * Output: src-tauri/sidecars/server-x86_64-pc-windows-msvc.exe
 *
 * The compiled binary has server.js baked in — no separate node.exe needed.
 * Run from the pc-server/ directory: node scripts/build-bun-sidecar.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pcServerDir = path.resolve(__dirname, '..');

// Kill any previously running instances so target files are not locked
try {
  execSync('taskkill /F /IM server.exe /IM payment-alerts-obs.exe 2>nul', { stdio: 'ignore' });
} catch (_) {}

const bunExe      = path.join(pcServerDir, 'src-tauri', 'sidecars', 'bun.exe');
const outExe      = path.join(pcServerDir, 'src-tauri', 'sidecars', 'server-x86_64-pc-windows-msvc.exe');
const serverJs    = path.join(pcServerDir, 'server.js');

if (!fs.existsSync(bunExe)) {
  console.error('bun.exe not found in src-tauri/sidecars/.');
  process.exit(1);
}

if (!fs.existsSync(serverJs)) {
  console.error('server.js not found at ' + serverJs);
  process.exit(1);
}

console.log('Compiling server.js with bun...');
const cmd = `"${bunExe}" build "${serverJs}" --compile --target bun-windows-x64 --outfile "${outExe}"`;
console.log('>', cmd);

try {
  execSync(cmd, { stdio: 'inherit' });
  const size = fs.statSync(outExe).size;
  console.log(`\nDone! ${outExe}`);
  console.log(`Size: ${(size / 1024 / 1024).toFixed(1)} MB`);

  // Remove old node.exe sidecar if present
  const oldNode = path.join('src-tauri', 'sidecars', 'node-x86_64-pc-windows-msvc.exe');
  if (fs.existsSync(oldNode)) {
    fs.unlinkSync(oldNode);
    console.log('Removed old node-x86_64-pc-windows-msvc.exe sidecar.');
  }
} catch (e) {
  console.error('Bun compile failed:', e.message);
  process.exit(1);
}
