$ProgressPreference = 'SilentlyContinue'
$out = "src-tauri\sidecars\bun-windows-x64.zip"
$url = "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip"
Write-Host "Downloading bun..."
Invoke-WebRequest -Uri $url -OutFile $out
$size = (Get-Item $out).Length
Write-Host "Downloaded $size bytes to $out"

Write-Host "Extracting..."
Expand-Archive -Force $out "src-tauri\sidecars\bun-tmp"
$bunSrc = "src-tauri\sidecars\bun-tmp\bun-windows-x64\bun.exe"
$bunDst = "src-tauri\sidecars\bun.exe"
Move-Item -Force $bunSrc $bunDst
Remove-Item -Recurse -Force "src-tauri\sidecars\bun-tmp"
Remove-Item -Force $out
$sz = (Get-Item $bunDst).Length
Write-Host "bun.exe ready: $sz bytes"
