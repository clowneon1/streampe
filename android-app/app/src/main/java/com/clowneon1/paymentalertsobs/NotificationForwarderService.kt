package com.clowneon1.paymentalertsobs

import android.app.*
import android.content.Intent
import android.os.*
import androidx.core.app.NotificationCompat

class NotificationForwarderService : Service() {

    companion object {
        const val CHANNEL_ID = "payment_alerts_channel"
        const val NOTIF_ID   = 1
        const val ACTION_STOP = "com.clowneon1.paymentalertsobs.STOP_SERVICE"
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private val keepAliveHandler  = Handler(Looper.getMainLooper())
    private val keepAliveInterval = 25_000L // 25 seconds

    private val keepAliveRunnable = object : Runnable {
        override fun run() {
            // Ping WebSocket to keep connection alive & detect drops early
            WebSocketManager.ping()
            keepAliveHandler.postDelayed(this, keepAliveInterval)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
        acquireWakeLock()
        keepAliveHandler.postDelayed(keepAliveRunnable, keepAliveInterval)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        // Reconnect WebSocket if it dropped
        val prefs = AppPrefs(this)
        if (prefs.serverUrl.isNotBlank()) {
            val wsUrl = prefs.serverUrl
                .replace("http://", "ws://")
                .replace("https://", "wss://") + "/android"
            WebSocketManager.connectIfNeeded(wsUrl)
        }

        // Restore saved selected packages into NotificationService
        NotificationService.allowedPackages = prefs.selectedPackages

        return START_STICKY  // Android restarts this service if killed
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App was swiped away from recents — reschedule restart
        val restartIntent = Intent(applicationContext, NotificationForwarderService::class.java)
        val pending = PendingIntent.getService(
            applicationContext, 1, restartIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarm = getSystemService(ALARM_SERVICE) as AlarmManager
        alarm.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 2000, pending)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        keepAliveHandler.removeCallbacks(keepAliveRunnable)
        wakeLock?.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "PaymentAlertsOBS::NotificationWakeLock"
        ).also { it.acquire(10 * 60 * 1000L) } // max 10 min, re-acquired via keepalive
    }

    private fun buildNotification(): Notification {
        // Tapping the notification opens AppSelectorActivity
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, AppSelectorActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        // Stop action in notification
        val stopIntent = PendingIntent.getService(
            this, 0,
            Intent(this, NotificationForwarderService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Payment Alerts for OBS")
            .setContentText("Running — forwarding notifications to stream")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_delete, "Stop", stopIntent)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Payment Alerts OBS",
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Keeps notification forwarding alive in background" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
