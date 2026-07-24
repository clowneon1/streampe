; Payment Alerts for OBS - Windows Installer Script
; Build with NSIS: makensis installer.nsi

!define APP_NAME "Payment Alerts for OBS"
!define APP_VERSION "1.0.0"
!define EXE_NAME "payment-alerts-server.exe"
!define INSTALL_DIR "$PROGRAMFILES64\PaymentAlertsOBS"
!define SERVICE_NAME "PaymentAlertsOBS"

Name "${APP_NAME}"
OutFile "PaymentAlertsOBS-Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel admin

; Modern UI
!include "MUI2.nsh"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
    SetOutPath "$INSTDIR"

    ; Copy the bundled exe and overlay files
    File "..\dist\${EXE_NAME}"
    File /r "..\public"

    ; Create Windows Firewall rule for port 3000
    ExecWait 'netsh advfirewall firewall add rule name="PaymentAlertsOBS" protocol=TCP dir=in localport=3000 action=allow'

    ; Install and start as Windows Service using sc.exe
    ExecWait 'sc create ${SERVICE_NAME} binPath= "$INSTDIR\${EXE_NAME}" start= auto DisplayName= "${APP_NAME}"'
    ExecWait 'sc description ${SERVICE_NAME} "Forwards phone notifications to OBS stream overlay"'
    ExecWait 'sc start ${SERVICE_NAME}'

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Add to Add/Remove Programs
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" \
        "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" \
        "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" \
        "DisplayVersion" "${APP_VERSION}"

    MessageBox MB_OK "${APP_NAME} installed!$\n$\nThe server is now running on port 3000 and will auto-start with Windows.$\n$\nUse your PC's local IP in the Android app to connect."
SectionEnd

Section "Uninstall"
    ; Stop and remove service
    ExecWait 'sc stop ${SERVICE_NAME}'
    ExecWait 'sc delete ${SERVICE_NAME}'

    ; Remove firewall rule
    ExecWait 'netsh advfirewall firewall delete rule name="PaymentAlertsOBS"'

    ; Delete files
    RMDir /r "$INSTDIR"

    ; Remove registry entries
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}"
SectionEnd
