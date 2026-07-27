package com.clowneon1.paymentalertsobs

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.view.View
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs
    private lateinit var btnConnect: Button
    private lateinit var btnPermission: Button
    private lateinit var btnAccessibility: Button
    private lateinit var btnBatteryOptimization: Button
    private lateinit var tvPermStatus: TextView
    private lateinit var tvNotifAccess: TextView
    private lateinit var tvAccessibilityStatus: TextView
    private lateinit var tvBatteryStatus: TextView
    private lateinit var tvStatus: TextView
    private lateinit var etServerUrl: EditText

    private var batteryDialogAutoShownThisLaunch = false

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        updateUI()
        if (granted && !isNotificationAccessGranted()) {
            showNotificationAccessDialog()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Transition from Splash theme immediately to avoid "freeze" feel
        setTheme(R.style.Theme_PaymentAlertsOBS)
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        setContentView(R.layout.activity_main)
        bindViews()
        requestPostNotificationPermissionSilently()
        setupClickListeners()
        updateUI()

        if (prefs.serverUrl.isNotBlank() && prefs.isConnected) {
            autoReconnect()
        }
    }

    private fun autoReconnect() {
        etServerUrl.setText(prefs.serverUrl)
        tvStatus.text = "\u23f3 Reconnecting to server..."
        btnConnect.isEnabled = false
        btnConnect.alpha = 0.5f

        HealthCheck.check(prefs.serverUrl) { success, message ->
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                
                if (success) {
                    val wsUrl = prefs.serverUrl
                        .replace("http://", "ws://")
                        .replace("https://", "wss://") + "/android"
                    WebSocketManager.connectIfNeeded(wsUrl)
                    val serviceIntent = Intent(this, NotificationForwarderService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent)
                    } else {
                        startService(serviceIntent)
                    }
                    goToAppSelector()
                } else {
                    prefs.isConnected = false
                    tvStatus.text = "" // Clear the reconnecting status
                    
                    MaterialAlertDialogBuilder(this)
                        .setTitle("Connection Failed")
                        .setMessage("Failed to connect to server: ${prefs.serverUrl}\n\n$message")
                        .setPositiveButton("OK", null)
                        .show()

                    updateUI()
                }
            }
        }
    }

    private fun bindViews() {
        btnConnect             = findViewById(R.id.btnConnect)
        btnPermission          = findViewById(R.id.btnPermission)
        btnAccessibility       = findViewById(R.id.btnAccessibility)
        btnBatteryOptimization = findViewById(R.id.btnBatteryOptimization)
        tvPermStatus           = findViewById(R.id.tvPermStatus)
        tvNotifAccess          = findViewById(R.id.tvNotifAccess)
        tvAccessibilityStatus  = findViewById(R.id.tvAccessibilityStatus)
        tvBatteryStatus        = findViewById(R.id.tvBatteryStatus)
        tvStatus               = findViewById(R.id.tvStatus)
        etServerUrl            = findViewById(R.id.etServerUrl)
        etServerUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:2907" })
    }

    private fun requestPostNotificationPermissionSilently() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun setupClickListeners() {
        btnPermission.setOnClickListener { showNotificationAccessDialog() }

        btnAccessibility.setOnClickListener { showAccessibilityDialog() }

        btnBatteryOptimization.setOnClickListener {
            batteryDialogAutoShownThisLaunch = false
            showBatteryOptimizationDialog(fromUser = true)
        }

        btnConnect.setOnClickListener {
            if (!isNotificationAccessGranted()) {
                showNotificationAccessDialog()
                return@setOnClickListener
            }
            var url = etServerUrl.text.toString().trim()
            if (url.isBlank()) { showToast("Enter server URL"); return@setOnClickListener }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "http://$url"
                etServerUrl.setText(url)
            }

            tvStatus.text = "\u23f3 Checking server..."
            btnConnect.isEnabled = false

            HealthCheck.check(url) { success, message ->
                runOnUiThread {
                    if (success) {
                        prefs.serverUrl   = url
                        prefs.isConnected = true

                        val wsUrl = url
                            .replace("http://", "ws://")
                            .replace("https://", "wss://") + "/android"
                        WebSocketManager.connect(wsUrl)

                        val serviceIntent = Intent(this, NotificationForwarderService::class.java)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startForegroundService(serviceIntent)
                        } else {
                            startService(serviceIntent)
                        }

                        goToAppSelector()
                    } else {
                        tvStatus.text = "\u274c $message"
                        btnConnect.isEnabled = true
                    }
                }
            }
        }
    }

    private fun showNotificationAccessDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Notification Access Required")
            .setMessage(
                "Payment Alerts for OBS needs Notification Access to read your phone\u2019s " +
                "notifications and forward them to your stream overlay.\n\n" +
                "On the next screen, find \u201cPayment Alerts for OBS\u201d and turn it ON."
            )
            .setPositiveButton("Open Settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun showAccessibilityDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Accessibility Access — Android 15 Fix")
            .setMessage(
                "This is optional and only needed on Android 15+ if payment amounts are missing.\n\n" +
                "\u26a0\ufe0f Warning: Accessibility services can interfere with some payment apps " +
                "(e.g. PhonePe screen-lock security). Only enable if you need this fix.\n\n" +
                "On the next screen:\n" +
                "1. Find \u201cPayment Alerts for OBS\u201d\n" +
                "2. Tap it and turn it ON\n" +
                "3. Tap Allow on the confirmation dialog"
            )
            .setPositiveButton("Open Settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun showBatteryOptimizationDialog(fromUser: Boolean = false) {
        if (!fromUser && batteryDialogAutoShownThisLaunch) return
        if (!fromUser) batteryDialogAutoShownThisLaunch = true
        MaterialAlertDialogBuilder(this)
            .setTitle("Disable Battery Optimization")
            .setMessage(
                "Android may kill the notification service after a few minutes of screen off.\n\n" +
                "Disabling battery optimization ensures notifications are forwarded reliably " +
                "during long streams."
            )
            .setPositiveButton("Disable Now") { _, _ -> openBatterySettings() }
            .setNegativeButton("Skip", null)
            .show()
    }

    @SuppressLint("BatteryLife")
    private fun openBatterySettings() {
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
            )
            return
        } catch (_: ActivityNotFoundException) {}
        try {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            return
        } catch (_: ActivityNotFoundException) {}
        try {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                }
            )
        } catch (_: ActivityNotFoundException) {
            showToast("Please disable battery optimization manually in Settings")
        }
    }

    override fun onResume() {
        super.onResume()
        if (::tvPermStatus.isInitialized) updateUI()
    }

    private fun updateUI() {
        val notifAccess    = isNotificationAccessGranted()
        val a11yAccess     = isAccessibilityGranted()
        val postNotifOk    = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val batteryOk = isBatteryOptimizationIgnored()

        // Notification Access
        tvNotifAccess.text = if (notifAccess)
            "\u2705 Notification Access granted"
        else
            "\u274c Notification Access required — tap below to grant"
        btnPermission.visibility = if (notifAccess) View.GONE else View.VISIBLE

        // Accessibility Access (optional)
        tvAccessibilityStatus.text = if (a11yAccess)
            "\u2705 Accessibility enabled (Android 15 fix active)"
        else
            "\u26a0\ufe0f Not enabled — grant only if payment amounts are missing on Android 15"
        // Accessibility button always shown so user can toggle it on/off
        btnAccessibility.visibility = View.VISIBLE
        btnAccessibility.text = if (a11yAccess) "Disable Accessibility" else "Enable Accessibility (Optional)"

        tvPermStatus.visibility = if (postNotifOk) View.GONE else View.VISIBLE
        if (!postNotifOk) tvPermStatus.text = "\u26a0\ufe0f POST_NOTIFICATIONS permission not granted"

        tvBatteryStatus.text = "\u26a0\ufe0f Battery optimization active — may interrupt during long streams"
        tvBatteryStatus.visibility = if (batteryOk) View.GONE else View.VISIBLE
        btnBatteryOptimization.visibility = if (batteryOk) View.GONE else View.VISIBLE

        btnConnect.isEnabled = notifAccess
        btnConnect.alpha     = if (notifAccess) 1.0f else 0.5f
    }

    private fun isAccessibilityGranted(): Boolean {
        val flat = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return flat.contains(packageName, ignoreCase = true)
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return !TextUtils.isEmpty(flat) && flat.contains(packageName)
    }

    private fun goToAppSelector() {
        startActivity(Intent(this, AppSelectorActivity::class.java))
        finish()
    }

    private fun showToast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
