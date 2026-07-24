package com.clowneon1.paymentalertsobs

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class NotificationTesterActivity : AppCompatActivity() {

    companion object {
        private const val CHANNEL_ID = "tester_channel"
        private var notifId = 100
    }

    data class Preset(val label: String, val title: String, val text: String)

    private val presets = listOf(
        Preset("GPay Payment",    "Google Pay",  "You received ₹500 from Rahul Kumar"),
        Preset("PhonePe Credit",  "PhonePe",     "Money received! ₹1,200 credited to your account"),
        Preset("Paytm Payment",   "Paytm",       "₹299 paid to Swiggy successfully"),
        Preset("Bank Alert",      "HDFC Bank",   "A/c XX1234 credited ₹10,000 on 25-Jul-26"),
        Preset("UPI Debit",       "BHIM UPI",    "Debited ₹750.00 to merchant VPA: store@upi"),
        Preset("Custom",          "",            "")
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notification_tester)
        createNotificationChannel()

        val spinner     = findViewById<Spinner>(R.id.spinnerPresets)
        val etTitle     = findViewById<EditText>(R.id.etNotifTitle)
        val etText      = findViewById<EditText>(R.id.etNotifText)
        val btnFire     = findViewById<Button>(R.id.btnFireNotification)
        val btnBack     = findViewById<Button>(R.id.btnBack)
        val tvLog       = findViewById<TextView>(R.id.tvLog)

        // Populate spinner
        val labels = presets.map { it.label }
        spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: android.view.View?, pos: Int, id: Long) {
                val preset = presets[pos]
                if (preset.label != "Custom") {
                    etTitle.setText(preset.title)
                    etText.setText(preset.text)
                    etTitle.isEnabled = false
                    etText.isEnabled  = false
                } else {
                    etTitle.text.clear()
                    etText.text.clear()
                    etTitle.isEnabled = true
                    etText.isEnabled  = true
                    etTitle.requestFocus()
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>) {}
        }

        btnFire.setOnClickListener {
            val title = etTitle.text.toString().trim()
            val text  = etText.text.toString().trim()

            if (title.isBlank() || text.isBlank()) {
                Toast.makeText(this, "Title and text cannot be empty", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            fireNotification(title, text)

            val logLine = "[•] $title: $text\n"
            tvLog.text = logLine + tvLog.text
            Toast.makeText(this, "🔔 Notification fired!", Toast.LENGTH_SHORT).show()
        }

        btnBack.setOnClickListener { finish() }
    }

    private fun fireNotification(title: String, text: String) {
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
            CHANNEL_ID,
            "Notification Tester",
            NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "Used to fire test notifications" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
