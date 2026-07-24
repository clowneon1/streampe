package com.clowneon1.paymentalertsobs

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs
    private lateinit var btnConnect: Button
    private lateinit var btnPermission: Button
    private lateinit var tvPermStatus: TextView
    private lateinit var tvNotifAccess: TextView
    private lateinit var tvBatteryStatus: TextView
    private lateinit var tvStatus: TextView

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        updateUI()
        if (!granted) showToast("Notification permission denied — alerts won't appear on stream")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        if (prefs.serverUrl.isNotBlank() && prefs.isConnected) {
            goToAppSelector()
            return
        }

        setContentView(R.layout.activity_main)
        bindViews()
        requestPermissionsOnFirstLaunch()
        setupClickListeners()
    }

    private fun bindViews() {
        btnConnect      = findViewById(R.id.btnConnect)
        btnPermission   = findViewById(R.id.btnPermission)
        tvPermStatus    = findViewById(R.id.tvPermStatus)
        tvNotifAccess   = findViewById(R.id.tvNotifAccess)
        tvBatteryStatus = findViewById(R.id.tvBatteryStatus)
        tvStatus        = findViewById(R.id.tvStatus)
        val etUrl       = findViewById<EditText>(R.id.etServerUrl)
        etUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:3000" })
    }

    private fun requestPermissionsOnFirstLaunch() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (!isNotificationAccessGranted()) showNotificationAccessDialog()
    }

    private fun setupClickListeners() {
        btnPermission.setOnClickListener {
            showNotificationAccessDialog()
        }

        findViewById<Button>(R.id.btnBatteryOptimization).setOnClickListener {
            requestBatteryOptimizationExemption()
        }

        btnConnect.setOnClickListener {
            if (!isNotificationAccessGranted()) {
                showNotificationAccessDialog()
                return@setOnClickListener
            }
            val etUrl = findViewById<EditText>(R.id.etServerUrl)
            val url   = etUrl.text.toString().trim()
            if (url.isBlank()) { showToast("Enter server URL"); return@setOnClickListener }

            tvStatus.text = "⏳ Checking server..."
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
                        startForegroundService(Intent(this, NotificationForwarderService::class.java))
                        goToAppSelector()
                    } else {
                        tvStatus.text = "❌ $message"
                        btnConnect.isEnabled = true
                    }
                }
            }
        }
    }

    private fun showNotificationAccessDialog() {
        AlertDialog.Builder(this)
            .setTitle("Notification Access Required")
            .setMessage(
                "Payment Alerts for OBS needs Notification Access to read your phone's " +
                "notifications and forward them to your stream overlay.\n\n" +
                "On the next screen, find \"Payment Alerts for OBS\" and turn it ON."
            )
            .setPositiveButton("Open Settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (isBatteryOptimizationIgnored()) {
            showToast("Battery optimization already disabled ✅")
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Disable Battery Optimization")
            .setMessage(
                "Android may kill the notification service after a few minutes of screen off.\n\n" +
                "Disabling battery optimization ensures notifications are forwarded reliably " +
                "during long streams."
            )
            .setPositiveButton("Disable Now") { _, _ ->
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                )
            }
            .setNegativeButton("Skip", null)
            .show()
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
        val batteryOk   = isBatteryOptimizationIgnored()

        tvNotifAccess.text = if (notifAccess)
            "✅ Notification Access granted"
        else
            "❌ Notification Access required"

        tvPermStatus.text = if (postNotifOk)
            "✅ POST_NOTIFICATIONS granted"
        else
            "❌ POST_NOTIFICATIONS required"

        tvBatteryStatus.text = if (batteryOk)
            "✅ Battery optimization disabled (recommended)"
        else
            "⚠️ Battery optimization active — may interrupt background service"

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
