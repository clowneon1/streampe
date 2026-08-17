@echo off
setlocal enabledelayedexpansion

echo =========================================================
echo  StreamPe - Node.js Environment Checker
echo =========================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo [OK] Node.js is installed (%NODE_VER%).
    goto :END
)

echo [INFO] Node.js is NOT installed on this PC.
echo [INFO] Attempting automatic installation...
echo.

:: Try winget first
where winget >nul 2>nul
if %errorlevel% equ 0 (
    echo Installing Node.js LTS via winget...
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if !errorlevel! equ 0 (
        echo [SUCCESS] Node.js installed successfully via winget!
        goto :END
    )
)

:: Fallback to PowerShell direct download & silent MSI install
echo Downloading Node.js LTS MSI installer...
set "MSI_PATH=%TEMP%\node-v18-lts-installer.msi"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.20.2/node-v18.20.2-x64.msi' -OutFile '%MSI_PATH%'"

if exist "%MSI_PATH%" (
    echo Installing Node.js silently...
    msiexec /i "%MSI_PATH%" /qb /norestart
    echo [SUCCESS] Node.js installation finished!
) else (
    echo [ERROR] Could not download Node.js installer automatically.
    echo Please download and install Node.js 18+ from https://nodejs.org
)

:END
echo.
echo =========================================================
