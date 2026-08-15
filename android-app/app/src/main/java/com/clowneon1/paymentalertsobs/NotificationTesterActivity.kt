package com.clowneon1.paymentalertsobs

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.util.UUID

class NotificationTesterActivity : AppCompatActivity() {

    companion object {
        private const val CHANNEL_ID = "tester_channel"
        private var notifId = 100
    }

    data class Preset(
        val label   : String,
        val title   : String,
        val text    : String,
        val pkg     : String,
        val appName : String
    )

    private val presets = listOf(
        Preset(
            label   = "Amazon Pay",
            title   = "1.00 received",
            text    = "Money received from RJ on amazon pay",
            pkg     = "in.amazon.mShop.android.shopping",
            appName = "Amazon Pay"
        ),
        Preset(
            label   = "PhonePe (old)",
            title   = "PhonePe",
            text    = "D SINGH has sent Rs. 500.00 to your bank account",
            pkg     = "com.phonepe.app",
            appName = "PhonePe"
        ),
        Preset(
            label   = "PhonePe (mid)",
            title   = "PhonePe",
            text    = "D SINGH sent \u20b9500 to your account",
            pkg     = "com.phonepe.app",
            appName = "PhonePe"
        ),
        Preset(
            label   = "PhonePe (new)",
            title   = "PhonePe",
            text    = "Received \u20b9500 from D SINGH",
            pkg     = "com.phonepe.app",
            appName = "PhonePe"
        ),
        Preset(
            label   = "PhonePe (title-split)",
            title   = "\u20b9500 received",
            text    = "From D SINGH",
            pkg     = "com.phonepe.app",
            appName = "PhonePe"
        ),
        Preset(
            label   = "PhonePe (compact)",
            title   = "\u20b9500 from D SINGH",
            text    = "PhonePe UPI",
            pkg     = "com.phonepe.app",
            appName = "PhonePe"
        ),
        Preset(
            label   = "Custom",
            title   = "",
            text    = "",
            pkg     = "",
            appName = "Custom"
        )
    )

    private var lastSelectedPos = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notification_tester)
        createNotificationChannel()

        val spinner = findViewById<Spinner>(R.id.spinnerPresets)
        val etTitle = findViewById<EditText>(R.id.etNotifTitle)
        val etText  = findViewById<EditText>(R.id.etNotifText)
        val etPkg   = findViewById<EditText>(R.id.etNotifPkg)
        val btnFire = findViewById<Button>(R.id.btnFireNotification)
        val btnBack = findViewById<Button>(R.id.btnBack)
        val tvLog   = findViewById<TextView>(R.id.tvLog)

        val labels = presets.map { it.label }
        val adapter = object : ArrayAdapter<String>(this, R.layout.spinner_item, labels) {
            override fun getView(position: Int, convertView: android.view.View?, parent: android.view.ViewGroup): android.view.View {
                val v = super.getView(position, convertView, parent)
                if (v is TextView) {
                    v.setTextColor(android.graphics.Color.parseColor("#F0F2FF"))
                }
                return v
            }

            override fun getDropDownView(position: Int, convertView: android.view.View?, parent: android.view.ViewGroup): android.view.View {
                val v = super.getDropDownView(position, convertView, parent)
                if (v is TextView) {
                    v.setTextColor(android.graphics.Color.parseColor("#F0F2FF"))
                    v.setBackgroundColor(android.graphics.Color.parseColor("#12151f"))
                }
                return v
            }
        }
        adapter.setDropDownViewResource(R.layout.spinner_dropdown_item)
        spinner.adapter = adapter

        fun applyPreset(pos: Int) {
            val preset = presets[pos]
            etTitle.setText(preset.title)
            etText.setText(preset.text)
            etPkg.setText(preset.pkg)
            etTitle.isEnabled = true
            etText.isEnabled  = true
            etPkg.isEnabled   = true
        }

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(
                parent: AdapterView<*>, view: android.view.View?, pos: Int, id: Long
            ) {
                applyPreset(pos)
                lastSelectedPos = pos
                if (pos == presets.indexOfFirst { it.label == "Custom" }) etTitle.requestFocus()
            }
            override fun onNothingSelected(parent: AdapterView<*>) {}
        }

        spinner.setOnTouchListener { v, _ ->
            lastSelectedPos = spinner.selectedItemPosition
            v.performClick()
            false
        }

        btnFire.setOnClickListener {
            val pos     = spinner.selectedItemPosition
            val preset  = presets[pos]
            val title   = etTitle.text.toString().trim()
            val text    = etText.text.toString().trim()
            val pkgVal  = etPkg.text.toString().trim().ifBlank {
                if (preset.pkg.isNotBlank()) preset.pkg else packageName
            }
            val appName = if (pos == presets.indexOfFirst { it.label == "Custom" }) "Custom" else preset.appName

            if (title.isBlank() || text.isBlank()) {
                Toast.makeText(this, "Title and text cannot be empty", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            fireNotification(title, text)

            val alertId = UUID.randomUUID().toString()

            // Send raw fields only — server handles parsing sender/amount
            val json = JSONObject().apply {
                put("alertId",     alertId)
                put("source",      "tester")
                put("simulated",   true)
                put("packageName", pkgVal)
                put("appName",     appName)
                put("title",       title)
                put("text",        text)
                put("bigText",     text)   // tester has no bigText so mirror text
                put("timestamp",   System.currentTimeMillis())
            }

            AlertLog.add(AlertLog.fromJson(json))
            WebSocketManager.send(json.toString())

            val logLine = "[${preset.label}] $title: $text\n"
            tvLog.text = logLine + tvLog.text
            Toast.makeText(this, "\uD83D\uDD14 Sent to OBS!", Toast.LENGTH_SHORT).show()
        }

        btnBack.setOnClickListener { finish() }
    }

    private fun fireNotification(title: String, text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Permission POST_NOTIFICATIONS not granted", Toast.LENGTH_SHORT).show()
                return
            }
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(this).notify(notifId++, notification)
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Notification Tester", NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "Used to fire test notifications" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
