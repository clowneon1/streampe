package com.clowneon1.paymentalertsobs

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject

class PaymentAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "PaymentA11y"
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.apply {
            eventTypes   = AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        }
        // Load persisted selection from disk on every service connect.
        // This mirrors what NotificationService does in onListenerConnected
        // so the filter is always in sync with what the user saved.
        NotificationService.allowedPackages =
            AppPrefs(applicationContext).selectedPackages
        Log.d(TAG, "A11y connected — allowedPackages loaded: ${NotificationService.allowedPackages?.size} entries")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) return

        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        // allowedPackages == null  → not loaded yet, drop
        // allowedPackages.isEmpty → user selected nothing, drop
        // pkg not in set          → not selected, drop
        val allowed = NotificationService.allowedPackages
        if (allowed.isNullOrEmpty() || pkg !in allowed) return

        val textList = event.text
        if (textList.isNullOrEmpty()) return

        val title = textList.getOrNull(0)?.toString()?.trim() ?: ""
        val body  = textList.drop(1).joinToString(" ") { it.toString().trim() }

        if (title.isBlank() && body.isBlank()) return

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
