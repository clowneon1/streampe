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
        // Updated live from AppSelectorActivity when user saves
        var allowedPackages: Set<String> = emptySet()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg: String = sbn.packageName

        // Skip our own notifications
        if (pkg == packageName) return

        // If user has selected specific apps, filter to those only
        if (allowedPackages.isNotEmpty() && pkg !in allowedPackages) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text  = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

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

    override fun onNotificationRemoved(sbn: StatusBarNotification) {}
}
