package com.clowneon1.notificationforwarder

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    // ⚠️ Change this to your PC's local IP address
    private val DEFAULT_WS_URL = "ws://192.168.1.100:3000/android"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val urlInput   = findViewById<EditText>(R.id.etServerUrl)
        val btnConnect = findViewById<Button>(R.id.btnConnect)
        val btnPermission = findViewById<Button>(R.id.btnPermission)
        val tvStatus   = findViewById<TextView>(R.id.tvStatus)

        urlInput.setText(DEFAULT_WS_URL)

        // Check if notification access is granted
        updatePermissionStatus(tvStatus)

        btnPermission.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        btnConnect.setOnClickListener {
            val url = urlInput.text.toString().trim()
            if (url.isBlank()) {
                Toast.makeText(this, "Enter server URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (!isNotificationAccessGranted()) {
                Toast.makeText(this, "Please grant Notification Access first!", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            WebSocketManager.connect(url)
            tvStatus.text = "Status: Connecting to $url..."
            Toast.makeText(this, "Connecting...", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        val tvStatus = findViewById<TextView>(R.id.tvStatus)
        updatePermissionStatus(tvStatus)
    }

    private fun updatePermissionStatus(tvStatus: TextView) {
        if (isNotificationAccessGranted()) {
            tvStatus.text = "Status: Notification Access ✅ Granted"
        } else {
            tvStatus.text = "Status: ❌ Notification Access NOT granted"
        }
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners"
        )
        return !TextUtils.isEmpty(flat) && flat.contains(packageName)
    }
}
