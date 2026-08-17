package com.clowneon1.streampe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Automatically restarts the forwarding service after device reboot,
 * so the user doesn't need to open the app after every restart.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON") return

        val prefs = AppPrefs(context)
        // Only auto-start if user had previously connected
        if (prefs.serverUrl.isBlank() || !prefs.isConnected) return

        val serviceIntent = Intent(context, NotificationForwarderService::class.java)
        context.startForegroundService(serviceIntent)
    }
}
