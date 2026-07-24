# Building the Windows Installer

## Prerequisites
- Node.js 18+
- [NSIS](https://nsis.sourceforge.io/Download) installed on your PC

## Steps

### 1. Install dependencies
```bash
cd pc-server
npm install
```

### 2. Bundle server into a single .exe
```bash
npm run build
# Output: dist/payment-alerts-server.exe
```
This packages Node.js + all dependencies + server.js into one standalone exe.
No Node.js installation required on the end user's PC.

### 3. Build the NSIS installer
```bash
cd installer
makensis installer.nsi
# Output: installer/PaymentAlertsOBS-Setup.exe
```

## What the Installer Does
1. Copies `payment-alerts-server.exe` + `public/` to `C:\Program Files\PaymentAlertsOBS\`
2. Creates a Windows Firewall rule for port 3000
3. Registers and starts a **Windows Service** (`PaymentAlertsOBS`)
4. Service is set to `auto` start — runs on every boot, even without login
5. Adds entry to Add/Remove Programs for clean uninstall

## Managing the Service (after install)
```powershell
# Check status
sc query PaymentAlertsOBS

# Stop
sc stop PaymentAlertsOBS

# Start
sc start PaymentAlertsOBS

# Or via Services GUI
services.msc  # Find "Payment Alerts for OBS"
```

## Uninstall
Control Panel → Add/Remove Programs → Payment Alerts for OBS → Uninstall
(Stops service, removes firewall rule, deletes all files)
