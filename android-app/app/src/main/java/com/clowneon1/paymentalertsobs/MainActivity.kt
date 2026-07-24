package com.clowneon1.paymentalertsobs

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
    private lateinit var tvStatus: TextView

    // Runtime permission launcher for POST_NOTIFICATIONS
    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        updateUI()
        if (!granted) {
            showToast("Notification permission denied — alerts won't appear on stream")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        // Route to app selector if already connected
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
        btnConnect    = findViewById(R.id.btnConnect)
        btnPermission = findViewById(R.id.btnPermission)
        tvPermStatus  = findViewById(R.id.tvPermStatus)
        tvNotifAccess = findViewById(R.id.tvNotifAccess)
        tvStatus      = findViewById(R.id.tvStatus)
        val etUrl     = findViewById<EditText>(R.id.etServerUrl)
        etUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:3000" })
    }

    private fun requestPermissionsOnFirstLaunch() {
        // POST_NOTIFICATIONS requires runtime request on API 33+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        // Prompt for notification listener access if not granted
        if (!isNotificationAccessGranted()) {
            showNotificationAccessDialog()
        }
    }

    private fun setupClickListeners() {
        btnPermission.setOnClickListener {
            showNotificationAccessDialog()
        }

        btnConnect.setOnClickListener {
            if (!isNotificationAccessGranted()) {
                showNotificationAccessDialog()
                return@setOnClickListener
            }
            val etUrl = findViewById<EditText>(R.id.etServerUrl)
            val url   = etUrl.text.toString().trim()
            if (url.isBlank()) {
                showToast("Enter server URL")
                return@setOnClickListener
            }
            tvStatus.text = "⏳ Checking server..."
            btnConnect.isEnabled = false

            HealthCheck.check(url) { success, message ->
                runOnUiThread {
                    if (success) {
                        prefs.serverUrl  = url
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

    override fun onResume() {
        super.onResume()
        if (::tvPermStatus.isInitialized) updateUI()
    }

    private fun updateUI() {
        val notifAccess    = isNotificationAccessGranted()
        val postNotifOk    = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

        tvNotifAccess.text = if (notifAccess)
            "✅ Notification Access granted"
        else
            "❌ Notification Access required"

        tvPermStatus.text = if (postNotifOk)
            "✅ POST_NOTIFICATIONS granted"
        else
            "❌ POST_NOTIFICATIONS required (for stream overlay)"

        // Only enable connect when notification access is granted (minimum requirement)
        btnConnect.isEnabled = notifAccess
        btnConnect.alpha     = if (notifAccess) 1.0f else 0.5f
    }

    private fun goToAppSelector() {
        startActivity(Intent(this, AppSelectorActivity::class.java))
        finish()
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return !TextUtils.isEmpty(flat) && flat.contains(packageName)
    }

    private fun showToast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
