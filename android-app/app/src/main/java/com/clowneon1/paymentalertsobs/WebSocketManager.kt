package com.clowneon1.paymentalertsobs

import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object WebSocketManager {

    private const val TAG            = "WebSocketManager"
    private const val MAX_QUEUE      = 100
    private const val RECONNECT_MS   = 5_000L

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)  // OkHttp-level WebSocket ping
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)    // No timeout for persistent WS
        .build()

    private var webSocket: WebSocket? = null
    private var serverUrl: String     = ""
    private val isConnected           = AtomicBoolean(false)
    private val isReconnecting        = AtomicBoolean(false)
    private val messageQueue          = ArrayDeque<String>(MAX_QUEUE)
    private val handler               = Handler(Looper.getMainLooper())

    fun connect(url: String) {
        serverUrl = url
        openSocket()
    }

    fun connectIfNeeded(url: String) {
        if (isConnected.get()) return
        serverUrl = url
        openSocket()
    }

    fun send(message: String) {
        if (isConnected.get() && webSocket != null) {
            webSocket!!.send(message)
        } else {
            if (messageQueue.size >= MAX_QUEUE) messageQueue.removeFirst()
            messageQueue.addLast(message)
            if (!isReconnecting.get()) scheduleReconnect()
        }
    }

    fun ping() {
        if (isConnected.get()) {
            webSocket?.send("{\"type\":\"ping\"}")
        } else if (!isReconnecting.get()) {
            scheduleReconnect()
        }
    }

    fun disconnect() {
        handler.removeCallbacksAndMessages(null)
        webSocket?.close(1000, "User disconnected")
        webSocket     = null
        isConnected.set(false)
        isReconnecting.set(false)
        messageQueue.clear()
    }

    private fun openSocket() {
        if (serverUrl.isBlank()) return
        val request = Request.Builder().url(serverUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(TAG, "Connected to $serverUrl")
                isConnected.set(true)
                isReconnecting.set(false)
                // Flush queued messages
                while (messageQueue.isNotEmpty()) {
                    ws.send(messageQueue.removeFirst())
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "Connection failed: ${t.message}")
                isConnected.set(false)
                scheduleReconnect()
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                ws.close(1000, null)
                isConnected.set(false)
                if (code != 1000) scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (isReconnecting.getAndSet(true)) return
        handler.postDelayed({
            isReconnecting.set(false)
            Log.d(TAG, "Reconnecting to $serverUrl...")
            openSocket()
        }, RECONNECT_MS)
    }
}
