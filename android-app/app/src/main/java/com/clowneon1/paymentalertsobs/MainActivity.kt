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
    private lateinit var btnBatteryOptimization: Button
    private lateinit var tvPermStatus: TextView
    private lateinit var tvNotifAccess: TextView
    private lateinit var tvBatteryStatus: TextView
    private lateinit var tvStatus: TextView
    private lateinit var etServerUrl: EditText

    private var batteryDialogShownThisLaunch = false

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        if (::tvPermStatus.isInitialized) updateUI()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        // If we have a saved URL and the flag says connected, verify the server
        // is actually reachable before skipping to AppSelectorActivity.
        // Blindly skipping based on a stale prefs flag shows the app list while
        // completely disconnected — which is the bug being fixed here.
        if (prefs.serverUrl.isNotBlank() && prefs.isConnected) {
            setContentView(R.layout.activity_main)
            bindViews()
            setupClickListeners()
            updateUI()
            requestPostNotificationPermissionSilently()
            // Show reconnecting state immediately so user knows what's happening
            etServerUrl.setText(prefs.serverUrl)
            tvStatus.text = "\u23f3 Reconnecting to server..."
            btnConnect.isEnabled = false
            btnConnect.alpha = 0.5f
            // Silently verify — reconnect if alive, fall back to home if not
            HealthCheck.check(prefs.serverUrl) { success, message ->
                runOnUiThread {
                    if (success) {
                        // Server is up — reconnect WebSocket and proceed
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
                        // Server unreachable — clear connected flag, show home
                        prefs.isConnected = false
                        tvStatus.text = "\u274c Server offline: $message"
                        btnConnect.isEnabled = isNotificationAccessGranted()
                        btnConnect.alpha = if (isNotificationAccessGranted()) 1.0f else 0.5f
                        updateUI()
                    }
                }
            }
            return
        }

        setContentView(R.layout.activity_main)
        bindViews()
        requestPostNotificationPermissionSilently()
        setupClickListeners()
        updateUI()
    }

    private fun bindViews() {
        btnConnect             = findViewById(R.id.btnConnect)
        btnPermission          = findViewById(R.id.btnPermission)
        btnBatteryOptimization = findViewById(R.id.btnBatteryOptimization)
        tvPermStatus           = findViewById(R.id.tvPermStatus)
        tvNotifAccess          = findViewById(R.id.tvNotifAccess)
        tvBatteryStatus        = findViewById(R.id.tvBatteryStatus)
        tvStatus               = findViewById(R.id.tvStatus)
        etServerUrl            = findViewById(R.id.etServerUrl)
        etServerUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:3000" })
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
        btnBatteryOptimization.setOnClickListener { showBatteryOptimizationDialog() }

        btnConnect.setOnClickListener {
            if (!isNotificationAccessGranted()) {
                showNotificationAccessDialog()
                return@setOnClickListener
            }
            val url = etServerUrl.text.toString().trim()
            if (url.isBlank()) { showToast("Enter server URL"); return@setOnClickListener }

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

    private fun showBatteryOptimizationDialog() {
        if (batteryDialogShownThisLaunch) return
        batteryDialogShownThisLaunch = true
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
        val notifAccess = isNotificationAccessGranted()
        val postNotifOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val batteryOk = isBatteryOptimizationIgnored()

        tvNotifAccess.text = if (notifAccess)
            "\u2705 Notification Access granted"
        else
            "\u274c Notification Access required"
        btnPermission.visibility = if (notifAccess) View.GONE else View.VISIBLE

        tvPermStatus.visibility = if (postNotifOk) View.GONE else View.VISIBLE

        tvBatteryStatus.text = "\u26a0\ufe0f Battery optimization active \u2014 may interrupt during long streams"
        tvBatteryStatus.visibility = if (batteryOk) View.GONE else View.VISIBLE
        btnBatteryOptimization.visibility = if (batteryOk) View.GONE else View.VISIBLE

        btnConnect.isEnabled = notifAccess
        btnConnect.alpha     = if (notifAccess) 1.0f else 0.5f
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
