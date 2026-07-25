package com.clowneon1.paymentalertsobs

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

class PaymentAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "PaymentA11y"

        /** Strings Android injects when ASI redacts a notification. */
        private val REDACTED_STRINGS = setOf(
            "sensitive notification content hidden",
            "contents hidden",
            "notification content hidden"
        )

        /**
         * System-UI packages that host the notification shade.
         * Reading their view hierarchy gives us the rendered text
         * AFTER the GPU composites it — ASI cannot redact at this layer.
         */
        private val SHADE_PACKAGES = setOf(
            "com.android.systemui",
            "android"
        )
    }

    /** pkg+hash → last forward time (ms). Prevents duplicate fires. */
    private val recentlySent = mutableMapOf<String, Long>()
    private val DEBOUNCE_MS = 2_000L

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.apply {
            eventTypes =
                AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType        = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags =
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        NotificationService.allowedPackages =
            AppPrefs(applicationContext).selectedPackages
        Log.d(TAG, "A11y connected — allowedPackages: ${NotificationService.allowedPackages?.size}")
    }

    // -------------------------------------------------------------------------
    // Event dispatch
    // -------------------------------------------------------------------------

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> handleNotifEvent(event)
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED     -> handleShadeEvent(event)
        }
    }

    // -------------------------------------------------------------------------
    // Path A — direct notification event (works for non-redacted apps)
    // -------------------------------------------------------------------------

    private fun handleNotifEvent(event: AccessibilityEvent) {
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return
        if (!isAllowed(pkg)) return

        val textList = event.text
        if (textList.isNullOrEmpty()) return

        val title = textList.getOrNull(0)?.toString()?.trim() ?: ""
        val body  = textList.drop(1).joinToString(" ") { it.toString().trim() }

        // If Android redacted this, fall through — the shade traversal
        // (Path B) will pick it up when the notification appears on screen.
        if (isRedacted(title) || isRedacted(body)) {
            Log.d(TAG, "[A] Redacted event from $pkg — waiting for shade render")
            return
        }

        if (title.isBlank() && body.isBlank()) return
        sendIfNew(pkg, title, body, event.eventTime, source = "notif_event")
    }

    // -------------------------------------------------------------------------
    // Path B — notification shade view hierarchy (bypasses ASI redaction)
    // -------------------------------------------------------------------------

    private fun handleShadeEvent(event: AccessibilityEvent) {
        val sourcePkg = event.packageName?.toString() ?: return
        if (sourcePkg !in SHADE_PACKAGES) return

        val allowed = NotificationService.allowedPackages
        if (allowed.isNullOrEmpty()) return

        // Walk all windows; find notification rows belonging to allowed apps
        val windows = windows ?: return
        for (window in windows) {
            val root = window.root ?: continue
            try {
                harvestNotificationRows(root, allowed)
            } finally {
                root.recycle()
            }
        }
    }

    /**
     * Depth-first walk of [node]. When we encounter a node whose
     * contentDescription or text matches an allowed package's app name,
     * we collect all descendant text leaves as title + body.
     *
     * More reliably, we look for ViewGroup nodes that contain both a
     * "title" leaf and a "body" leaf (heuristic: first non-empty text =
     * title, rest = body) and whose sibling/ancestor context identifies
     * the source package via the notification's app label.
     */
    private fun harvestNotificationRows(
        root: AccessibilityNodeInfo,
        allowed: Set<String>
    ) {
        // Collect all leaf text nodes grouped by their nearest scrollable/
        // focusable container — each container ≈ one notification row.
        val containers = mutableListOf<AccessibilityNodeInfo>()
        findNotificationContainers(root, containers)

        for (container in containers) {
            try {
                processContainer(container, allowed)
            } finally {
                container.recycle()
            }
        }
    }

    private fun findNotificationContainers(
        node: AccessibilityNodeInfo,
        out: MutableList<AccessibilityNodeInfo>
    ) {
        // A notification row is typically a focusable, non-scrollable
        // container that lives inside the shade scroll view.
        if (node.isFocusable && !node.isScrollable && node.childCount > 0) {
            out.add(AccessibilityNodeInfo.obtain(node))
            return  // don't recurse into children — row is atomic
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findNotificationContainers(child, out)
            child.recycle()
        }
    }

    private fun processContainer(container: AccessibilityNodeInfo, allowed: Set<String>) {
        // Gather all visible text leaves in this row
        val leaves = mutableListOf<String>()
        collectTextLeaves(container, leaves)

        if (leaves.isEmpty()) return

        // Try to match any leaf to an allowed app's label
        val matchedPkg = allowed.firstOrNull { pkg ->
            val label = appLabel(pkg)
            leaves.any { leaf -> leaf.contains(label, ignoreCase = true) }
        } ?: return

        // Filter out the app label itself and redacted placeholders
        val appLabel = appLabel(matchedPkg)
        val content = leaves.filter { leaf ->
            !leaf.equals(appLabel, ignoreCase = true) && !isRedacted(leaf)
        }
        if (content.isEmpty()) return

        val title = content.first()
        val body  = content.drop(1).joinToString(" ")

        sendIfNew(matchedPkg, title, body, System.currentTimeMillis(), source = "shade_walk")
    }

    private fun collectTextLeaves(node: AccessibilityNodeInfo, out: MutableList<String>) {
        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()
        val leaf = when {
            !text.isNullOrBlank() -> text
            !desc.isNullOrBlank() -> desc
            else                  -> null
        }
        if (leaf != null && node.childCount == 0) {
            out.add(leaf)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectTextLeaves(child, out)
            child.recycle()
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun isAllowed(pkg: String): Boolean {
        val allowed = NotificationService.allowedPackages
        return !allowed.isNullOrEmpty() && pkg in allowed
    }

    private fun isRedacted(text: String): Boolean =
        REDACTED_STRINGS.any { text.trim().lowercase().contains(it) }

    private val labelCache = mutableMapOf<String, String>()
    private fun appLabel(pkg: String): String =
        labelCache.getOrPut(pkg) {
            try {
                packageManager
                    .getApplicationLabel(packageManager.getApplicationInfo(pkg, 0))
                    .toString()
            } catch (e: Exception) { pkg }
        }

    private fun sendIfNew(pkg: String, title: String, body: String, time: Long, source: String) {
        val hash = "$pkg|$title|$body".hashCode().toString()
        val lastSent = recentlySent[hash] ?: 0L
        if (time - lastSent < DEBOUNCE_MS) {
            Log.d(TAG, "[$source] Debounced duplicate for $pkg")
            return
        }
        recentlySent[hash] = time
        // Prune old entries so the map doesn't grow unbounded
        val cutoff = time - 30_000L
        recentlySent.entries.removeAll { it.value < cutoff }

        val payload = JSONObject().apply {
            put("source",      source)
            put("packageName", pkg)
            put("appName",     appLabel(pkg))
            put("timestamp",   time)
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

        Log.d(TAG, "[$source] Forwarding $pkg | $title | $body")
        WebSocketManager.send(payload.toString())
    }

    override fun onInterrupt() {
        Log.d(TAG, "AccessibilityService interrupted")
    }
}
