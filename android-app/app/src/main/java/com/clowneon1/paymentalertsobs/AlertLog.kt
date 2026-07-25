package com.clowneon1.paymentalertsobs

import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArrayList

data class AlertEntry(
    val timestamp : Long,
    val appName   : String,
    val title     : String,
    val text      : String,
    val sender    : String,
    val amount    : String,
    val source    : String,   // "notification" | "test"
    val fullJson  : String
)

object AlertLog {
    private const val MAX = 100
    private val _entries = CopyOnWriteArrayList<AlertEntry>()

    val entries: List<AlertEntry> get() = _entries.toList()

    fun add(entry: AlertEntry) {
        _entries.add(0, entry)
        if (_entries.size > MAX) _entries.removeAt(_entries.size - 1)
    }

    fun clear() = _entries.clear()

    fun fromJson(json: JSONObject) = AlertEntry(
        timestamp = json.optLong("timestamp", System.currentTimeMillis()),
        appName   = json.optString("appName",  json.optString("sourceApp", "Unknown")),
        title     = json.optString("title",    ""),
        text      = json.optString("text",     ""),
        sender    = json.optString("sender",   ""),
        amount    = json.optString("amount",   ""),
        source    = json.optString("source",   "notification"),
        fullJson  = json.toString()
    )
}
