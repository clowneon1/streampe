package com.clowneon1.paymentalertsobs

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        // Route to correct screen
        if (prefs.serverUrl.isNotBlank() && prefs.isConnected) {
            goToAppSelector()
        } else {
            setContentView(R.layout.activity_main)
            setupServerScreen()
        }
    }

    private fun setupServerScreen() {
        val etUrl     = findViewById<EditText>(R.id.etServerUrl)
        val btnGrant  = findViewById<Button>(R.id.btnPermission)
        val btnConn   = findViewById<Button>(R.id.btnConnect)
        val tvStatus  = findViewById<TextView>(R.id.tvStatus)
        val tvPerm    = findViewById<TextView>(R.id.tvPermStatus)

        // Auto-fill saved URL
        etUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:3000" })

        updatePermissionStatus(tvPerm)

        btnGrant.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        btnConn.setOnClickListener {
            val url = etUrl.text.toString().trim()
            if (url.isBlank()) {
                Toast.makeText(this, "Enter server URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (!isNotificationAccessGranted()) {
                Toast.makeText(this, "Please grant Notification Access first!", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            tvStatus.text = "Checking server..."
            btnConn.isEnabled = false

            // Health check then connect
            HealthCheck.check(url) { success, message ->
                runOnUiThread {
                    if (success) {
                        prefs.serverUrl = url
                        prefs.isConnected = true
                        val wsUrl = url.replace("http://", "ws://").replace("https://", "wss://") + "/android"
                        WebSocketManager.connect(wsUrl)
                        // Start foreground service
                        val svcIntent = Intent(this, NotificationForwarderService::class.java)
                        startForegroundService(svcIntent)
                        goToAppSelector()
                    } else {
                        tvStatus.text = "❌ $message"
                        btnConn.isEnabled = true
                    }
                }
            }
        }
    }

    private fun goToAppSelector() {
        startActivity(Intent(this, AppSelectorActivity::class.java))
        finish()
    }

    override fun onResume() {
        super.onResume()
        if (::prefs.isInitialized) {
            val tvPerm = findViewById<TextView?>(R.id.tvPermStatus)
            tvPerm?.let { updatePermissionStatus(it) }
        }
    }

    private fun updatePermissionStatus(tv: TextView) {
        tv.text = if (isNotificationAccessGranted())
            "✅ Notification Access granted"
        else
            "❌ Notification Access NOT granted"
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return !TextUtils.isEmpty(flat) && flat.contains(packageName)
    }
}
