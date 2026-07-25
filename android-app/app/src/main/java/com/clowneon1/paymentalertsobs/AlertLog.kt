package com.clowneon1.paymentalertsobs

import org.json.JSONObject
import java.util.Collections

data class AlertEntry(
    val alertId: String,
    val timestamp: Long,
    val appName: String,
    val title: String,
    val text: String,
    val fullJson: String
)

object AlertLog {
    private const val MAX_ENTRIES = 100

    private val _entries: MutableList<AlertEntry> =
        Collections.synchronizedList(mutableListOf())

    val entries: List<AlertEntry> get() = _entries.toList()

    fun add(entry: AlertEntry) {
        _entries.add(0, entry)
        if (_entries.size > MAX_ENTRIES) {
            _entries.subList(MAX_ENTRIES, _entries.size).clear()
        }
    }

    fun fromJson(json: JSONObject): AlertEntry = AlertEntry(
        alertId   = json.optString("alertId", ""),
        timestamp = json.optLong("timestamp", System.currentTimeMillis()),
        appName   = json.optString("appName", json.optString("packageName", "Unknown")),
        title     = json.optString("title", ""),
        text      = json.optString("text", ""),
        fullJson  = json.toString()
    )
}
