package com.clowneon1.paymentalertsobs

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

class NotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "PaymentAlertsOBS"

        // To filter ONLY payment apps later, populate this list.
        // Leave empty to forward ALL notifications.
        val PAYMENT_PACKAGES: List<String> = listOf(
            // "com.google.android.apps.nbu.paisa.user",  // GPay
            // "net.one97.paytm",                          // Paytm
            // "com.phonepe.app",                          // PhonePe
            // "in.org.npci.upiapp",                       // BHIM
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg: String = sbn.packageName

        // Skip our own app's notifications
        if (pkg == packageName) return

        // If filter list is non-empty, only allow listed packages
        if (PAYMENT_PACKAGES.isNotEmpty() && pkg !in PAYMENT_PACKAGES) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text  = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()  ?: ""

        if (title.isBlank() && text.isBlank()) return

        val appName: String = try {
            packageManager.getApplicationLabel(
                packageManager.getApplicationInfo(pkg, PackageManager.GET_META_DATA)
            ).toString()
        } catch (e: Exception) { pkg }

        val payload = JSONObject().apply {
            put("packageName", pkg)
            put("appName", appName)
            put("title", title)
            put("text", text)
            put("timestamp", System.currentTimeMillis())
        }

        Log.d(TAG, "Forwarding: $payload")
        WebSocketManager.send(payload.toString())
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // Optional: send removal event if needed
    }
}
