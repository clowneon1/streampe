package com.clowneon1.streampe

import android.content.Context
import android.content.SharedPreferences

class AppPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("streampe_prefs", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server_url", "") ?: ""
        set(value) = prefs.edit().putString("server_url", value).apply()

    var isConnected: Boolean
        get() = prefs.getBoolean("is_connected", false)
        set(value) = prefs.edit().putBoolean("is_connected", value).apply()

    var selectedPackages: Set<String>
        get() = prefs.getStringSet("selected_packages", emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet("selected_packages", value).apply()

    var savedServers: Set<String>
        get() = prefs.getStringSet("saved_servers", emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet("saved_servers", value).apply()

    fun addSavedServer(url: String) {
        val trimmed = url.trim()
        if (trimmed.isNotBlank()) {
            val current = savedServers.toMutableSet()
            current.add(trimmed)
            savedServers = current
        }
    }

    fun removeSavedServer(url: String) {
        val current = savedServers.toMutableSet()
        if (current.remove(url.trim())) {
            savedServers = current
        }
    }
}
