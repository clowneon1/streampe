package com.clowneon1.paymentalertsobs

import android.app.Notification
import android.content.pm.PackageManager
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class NotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "PaymentAlertsOBS"
        var allowedPackages: Set<String> = emptySet()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg == packageName) return
        if (allowedPackages.isNotEmpty() && pkg !in allowedPackages) return

        val notif   = sbn.notification
        val extras  = notif.extras

        val title      = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()        ?: ""
        val text       = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()         ?: ""
        val bigText    = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()     ?: text
        val subText    = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()     ?: ""
        val infoText   = extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString()    ?: ""
        val summaryText= extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString() ?: ""
        val titleBig   = extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()    ?: title

        if (title.isBlank() && text.isBlank()) return

        // Inbox-style lines
        val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        val linesArray = JSONArray()
        textLines?.forEach { linesArray.put(it?.toString() ?: "") }

        // Action button labels
        val actionsArray = JSONArray()
        notif.actions?.forEach { actionsArray.put(it.title?.toString() ?: "") }

        val appName: String = try {
            packageManager.getApplicationLabel(
                packageManager.getApplicationInfo(pkg, PackageManager.GET_META_DATA)
            ).toString()
        } catch (e: Exception) { pkg }

        val payload = JSONObject().apply {
            // Identity
            put("packageName", pkg)
            put("appName",     appName)
            put("timestamp",   sbn.postTime)
            put("notifId",     sbn.id)
            put("key",         sbn.key)

            // Content
            put("title",       title)
            put("titleBig",    titleBig)
            put("text",        text)
            put("bigText",     bigText)
            put("subText",     subText)
            put("infoText",    infoText)
            put("summaryText", summaryText)
            put("textLines",   linesArray)

            // Metadata
            put("category",    notif.category   ?: "")
            put("priority",    notif.priority)
            put("visibility",  notif.visibility)
            put("isOngoing",   sbn.isOngoing)
            put("isClearable", sbn.isClearable)
            put("groupKey",    sbn.groupKey     ?: "")
            put("tickerText",  notif.tickerText?.toString() ?: "")

            // Actions
            put("actions",     actionsArray)
        }

        Log.d(TAG, "Forwarding: $payload")
        WebSocketManager.send(payload.toString())
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {}
}
