package com.clowneon1.paymentalertsobs

import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object WebSocketManager {

    private const val TAG          = "WebSocketManager"
    private const val MAX_QUEUE    = 100
    private const val RECONNECT_MS = 3_000L

    interface ConnectionStateListener {
        fun onConnectionStateChanged(isConnected: Boolean, message: String)
    }

    private val listeners = CopyOnWriteArrayList<ConnectionStateListener>()

    private val client = OkHttpClient.Builder()
        .pingInterval(10, TimeUnit.SECONDS)  // Fast OkHttp WebSocket ping
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var serverUrl: String     = ""
    private val isConnected           = AtomicBoolean(false)
    private val isReconnecting        = AtomicBoolean(false)
    private val messageQueue          = ArrayDeque<String>(MAX_QUEUE)
    private val handler               = Handler(Looper.getMainLooper())

    fun isConnected(): Boolean = isConnected.get()

    fun addListener(listener: ConnectionStateListener) {
        listeners.add(listener)
        // Immediately notify current state
        listener.onConnectionStateChanged(
            isConnected.get(),
            if (isConnected.get()) "Connected" else "Disconnected"
        )
    }

    fun removeListener(listener: ConnectionStateListener) {
        listeners.remove(listener)
    }

    private fun notifyState(connected: Boolean, message: String) {
        handler.post {
            for (l in listeners) {
                try { l.onConnectionStateChanged(connected, message) } catch (_: Exception) {}
            }
        }
    }

    fun connect(url: String) {
        if (isConnected.get() && serverUrl == url && webSocket != null) {
            Log.d(TAG, "Already connected to $url — skipping duplicate connection")
            return
        }
        serverUrl = url
        openSocket()
    }

    fun connectIfNeeded(url: String) {
        if (isConnected.get() && serverUrl == url && webSocket != null) return
        serverUrl = url
        openSocket()
    }

    fun send(message: String) {
        if (isConnected.get() && webSocket != null) {
            val sent = webSocket!!.send(message)
            if (!sent) {
                queueMessage(message)
                scheduleReconnect()
            }
        } else {
            queueMessage(message)
            if (!isReconnecting.get()) scheduleReconnect()
        }
    }

    private fun queueMessage(message: String) {
        if (messageQueue.size >= MAX_QUEUE) messageQueue.removeFirst()
        messageQueue.addLast(message)
    }

    fun ping() {
        if (isConnected.get()) {
            val sent = webSocket?.send("{\"type\":\"ping\"}") ?: false
            if (!sent) {
                isConnected.set(false)
                notifyState(false, "Server ping failed — Reconnecting...")
                scheduleReconnect()
            }
        } else if (!isReconnecting.get()) {
            scheduleReconnect()
        }
    }

    fun disconnect() {
        handler.removeCallbacksAndMessages(null)
        val oldWs = webSocket
        webSocket     = null
        isConnected.set(false)
        isReconnecting.set(false)
        try { oldWs?.close(1000, "User disconnected") } catch (_: Exception) {}
        try { oldWs?.cancel() } catch (_: Exception) {}
        messageQueue.clear()
        notifyState(false, "Disconnected by user")
    }

    private fun openSocket() {
        if (serverUrl.isBlank()) return
        val oldWs = webSocket
        webSocket = null
        try { oldWs?.close(1000, "Replaced by new connection") } catch (_: Exception) {}
        try { oldWs?.cancel() } catch (_: Exception) {}

        val request = Request.Builder().url(serverUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(TAG, "Connected to $serverUrl")
                isConnected.set(true)
                isReconnecting.set(false)
                notifyState(true, "Connected to PC Server")

                // Flush queued messages
                while (messageQueue.isNotEmpty()) {
                    ws.send(messageQueue.removeFirst())
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "Connection failure to $serverUrl: ${t.message}")
                isConnected.set(false)
                notifyState(false, "Server Offline / Reconnecting...")
                scheduleReconnect()
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                ws.close(1000, null)
                isConnected.set(false)
                notifyState(false, "Server Closed Connection")
                if (code != 1000) scheduleReconnect()
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                isConnected.set(false)
                notifyState(false, "Disconnected")
                if (code != 1000) scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (isReconnecting.getAndSet(true)) return
        handler.postDelayed({
            isReconnecting.set(false)
            if (!isConnected.get() && serverUrl.isNotBlank()) {
                Log.d(TAG, "Attempting auto-reconnect to $serverUrl...")
                notifyState(false, "Reconnecting to server...")
                openSocket()
            }
        }, RECONNECT_MS)
    }
}
