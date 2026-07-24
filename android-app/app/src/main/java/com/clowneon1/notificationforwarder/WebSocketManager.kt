package com.clowneon1.notificationforwarder

import android.util.Log
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.LinkedBlockingQueue

object WebSocketManager {
    private const val TAG = "WebSocketManager"
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null
    private var serverUrl: String = ""
    private val messageQueue = LinkedBlockingQueue<String>(100)
    private var isConnected = false

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "Connected to server")
            isConnected = true
            // Flush queued messages
            while (messageQueue.isNotEmpty()) {
                webSocket.send(messageQueue.poll() ?: break)
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "Connection failed: ${t.message}")
            isConnected = false
            reconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "Connection closed: $reason")
            isConnected = false
            reconnect()
        }
    }

    fun connect(url: String) {
        serverUrl = url
        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, listener)
    }

    fun send(message: String) {
        if (isConnected && ws != null) {
            ws!!.send(message)
        } else {
            // Queue message, will be sent on reconnect
            if (messageQueue.size < 100) messageQueue.offer(message)
        }
    }

    fun disconnect() {
        ws?.close(1000, "User disconnected")
        isConnected = false
    }

    private fun reconnect() {
        if (serverUrl.isBlank()) return
        Log.d(TAG, "Reconnecting in 5s...")
        Thread.sleep(5000)
        connect(serverUrl)
    }
}
