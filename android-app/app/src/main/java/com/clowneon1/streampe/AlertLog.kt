package com.clowneon1.streampe

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

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
    private const val TAG = "AlertLog"
    private const val MAX = 200
    private const val FILE_NAME = "alert_log.json"

    private val _entries = CopyOnWriteArrayList<AlertEntry>()
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private var appContext: Context? = null
    private var isLoaded = false

    val entries: List<AlertEntry>
        get() {
            ensureLoaded()
            return _entries.toList()
        }

    fun init(context: Context) {
        if (appContext == null) {
            appContext = context.applicationContext
        }
        ensureLoaded()
    }

    private fun ensureLoaded() {
        if (isLoaded) return
        val ctx = appContext ?: return
        synchronized(this) {
            if (isLoaded) return
            try {
                val file = File(ctx.filesDir, FILE_NAME)
                if (file.exists()) {
                    val content = file.readText()
                    val array = JSONArray(content)
                    val loaded = mutableListOf<AlertEntry>()
                    for (i in 0 until array.length()) {
                        val obj = array.getJSONObject(i)
                        loaded.add(
                            AlertEntry(
                                timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
                                appName   = obj.optString("appName", "Unknown"),
                                title     = obj.optString("title", ""),
                                text      = obj.optString("text", ""),
                                sender    = obj.optString("sender", ""),
                                amount    = obj.optString("amount", ""),
                                source    = obj.optString("source", "notification"),
                                fullJson  = obj.optString("fullJson", "")
                            )
                        )
                    }
                    _entries.clear()
                    _entries.addAll(loaded)
                    Log.d(TAG, "Loaded ${_entries.size} persisted alert entries from disk")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load alert log from disk: ${e.message}")
            } finally {
                isLoaded = true
            }
        }
    }

    fun add(entry: AlertEntry, context: Context? = null) {
        if (context != null && appContext == null) {
            appContext = context.applicationContext
        }
        ensureLoaded()

        _entries.add(0, entry)
        if (_entries.size > MAX) {
            while (_entries.size > MAX) {
                _entries.removeAt(_entries.size - 1)
            }
        }
        saveToDiskAsync()
    }

    fun clear() {
        _entries.clear()
        saveToDiskAsync()
    }

    fun remove(entry: AlertEntry) {
        _entries.remove(entry)
        saveToDiskAsync()
    }

    private fun saveToDiskAsync() {
        val ctx = appContext ?: return
        val currentList = _entries.toList()
        ioExecutor.execute {
            try {
                val array = JSONArray()
                for (item in currentList) {
                    val obj = JSONObject().apply {
                        put("timestamp", item.timestamp)
                        put("appName",   item.appName)
                        put("title",     item.title)
                        put("text",      item.text)
                        put("sender",    item.sender)
                        put("amount",    item.amount)
                        put("source",    item.source)
                        put("fullJson",  item.fullJson)
                    }
                    array.put(obj)
                }
                val file = File(ctx.filesDir, FILE_NAME)
                val tempFile = File(ctx.filesDir, "$FILE_NAME.tmp")
                tempFile.writeText(array.toString())
                if (tempFile.renameTo(file) || (file.delete() && tempFile.renameTo(file))) {
                    // Saved atomically
                } else {
                    file.writeText(array.toString())
                    tempFile.delete()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save alert log to disk: ${e.message}")
            }
        }
    }

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
