package com.clowneon1.streampe

import okhttp3.*
import java.io.IOException
import java.util.concurrent.TimeUnit

object HealthCheck {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    fun check(baseUrl: String, callback: (Boolean, String) -> Unit) {
        val url = baseUrl.trimEnd('/') + "/health"
        val request = Request.Builder().url(url).build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(false, "Cannot reach server: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    callback(true, "OK")
                } else {
                    callback(false, "Server returned ${response.code}")
                }
            }
        })
    }
}
