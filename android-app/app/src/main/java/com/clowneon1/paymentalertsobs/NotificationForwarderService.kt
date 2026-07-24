package com.clowneon1.paymentalertsobs

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class NotificationForwarderService : Service() {

    companion object {
        private const val CHANNEL_ID  = "payment_alerts_channel"
        private const val NOTIF_ID    = 1
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Payment Alerts for OBS")
            .setContentText("Forwarding notifications to your stream...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        startForeground(NOTIF_ID, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        WebSocketManager.disconnect()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Payment Alerts OBS",
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Keeps notification forwarding alive" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
