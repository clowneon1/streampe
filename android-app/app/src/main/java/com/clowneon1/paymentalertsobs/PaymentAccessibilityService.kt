package com.clowneon1.paymentalertsobs

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject

/**
 * AccessibilityService — Android 15 ASI bypass.
 *
 * Android System Intelligence (ASI) redacts sensitive content *before* it
 * reaches NotificationListenerService. However, ASI redaction sits inside
 * NotificationManagerService and does NOT affect what is rendered on-screen.
 * AccessibilityService hooks the UI rendering layer
 * (TYPE_NOTIFICATION_STATE_CHANGED) and therefore always receives the full,
 * unredacted notification text — including payment amounts that ASI would
 * otherwise strip.
 *
 * This service runs in parallel with NotificationService. On devices without
 * ASI (pre-Android-15, non-Play-Services ROMs) the notification path handles
 * everything. On Android 15+ with ASI installed, this service catches whatever
 * gets redacted. No duplicate suppression is needed — the OBS overlay is
 * idempotent and a double-fire is harmless.
 */
class PaymentAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "PaymentA11y"
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        }
        Log.d(TAG, "AccessibilityService connected — ASI bypass active")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) return

        val pkg = event.packageName?.toString() ?: return

        // Ignore our own package
        if (pkg == packageName) return

        // Respect the same allowed-packages filter as NotificationService
        val allowed = NotificationService.allowedPackages
        if (allowed.isNotEmpty() && pkg !in allowed) return

        // Extract title and body from the parcelable notification data.
        // event.text contains all CharSequences Android rendered for this
        // notification — index 0 is typically the title, index 1+ is the body.
        val textList = event.text
        if (textList.isNullOrEmpty()) return

        val title = textList.getOrNull(0)?.toString()?.trim() ?: ""
        val body  = textList.drop(1).joinToString(" ") { it.toString().trim() }

        if (title.isBlank() && body.isBlank()) return

        // Resolve a human-readable app name
        val appName: String = try {
            packageManager
                .getApplicationLabel(packageManager.getApplicationInfo(pkg, 0))
                .toString()
        } catch (e: Exception) { pkg }

        val payload = JSONObject().apply {
            put("source",      "accessibility")
            put("packageName", pkg)
            put("appName",     appName)
            put("timestamp",   event.eventTime)
            put("title",       title)
            put("titleBig",    title)
            put("text",        body)
            put("bigText",     body)
            put("subText",     "")
            put("infoText",    "")
            put("summaryText", "")
            put("category",    "")
            put("isRedacted",  false)
        }

        Log.d(TAG, "A11y forward: pkg=$pkg title=$title body=$body")
        WebSocketManager.send(payload.toString())
    }

    override fun onInterrupt() {
        Log.d(TAG, "AccessibilityService interrupted")
    }
}
