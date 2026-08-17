package com.clowneon1.streampe

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.net.InetAddress

data class DiscoveredServer(
    val serviceName: String,
    val host: String,
    val port: Int,
    val ipAddress: String,
    val httpUrl: String,
    val wsUrl: String,
    val version: String = "2.0.0"
)

class ServerDiscoveryManager(context: Context) {

    companion object {
        private const val TAG = "ServerDiscovery"
        private const val SERVICE_TYPE = "_payment-alerts._tcp."
        const val DEFAULT_SCAN_DURATION_MS = 5000L
    }

    interface DiscoveryListener {
        fun onServerFound(server: DiscoveredServer)
        fun onServerLost(serviceName: String)
        fun onDiscoveryStateChanged(isSearching: Boolean)
    }

    private val nsdManager: NsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var isDiscovering = false
    private var scanTimeoutRunnable: Runnable? = null

    var listener: DiscoveryListener? = null

    private val discoveredServers = mutableMapOf<String, DiscoveredServer>()

    fun getDiscoveredServers(): List<DiscoveredServer> = discoveredServers.values.toList()

    @Synchronized
    fun startDiscovery(durationMs: Long = DEFAULT_SCAN_DURATION_MS) {
        // Clear cached servers from previous scans
        discoveredServers.clear()
        mainHandler.post {
            listener?.onServerLost("") // Trigger UI refresh
        }

        if (isDiscovering) {
            scanTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            scheduleScanTimeout(durationMs)
            return
        }

        scanTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "mDNS Discovery started for $regType")
                isDiscovering = true
                mainHandler.post { listener?.onDiscoveryStateChanged(true) }
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "mDNS Service found: ${serviceInfo.serviceName} (${serviceInfo.serviceType})")
                if (serviceInfo.serviceType.contains("payment-alerts")) {
                    resolveService(serviceInfo)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "mDNS Service lost: ${serviceInfo.serviceName}")
                val name = serviceInfo.serviceName
                discoveredServers.remove(name)
                mainHandler.post { listener?.onServerLost(name) }
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "mDNS Discovery stopped")
                isDiscovering = false
                mainHandler.post { listener?.onDiscoveryStateChanged(false) }
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "mDNS Start Discovery failed: Error code $errorCode")
                isDiscovering = false
                try { nsdManager.stopServiceDiscovery(this) } catch (_: Exception) {}
                mainHandler.post { listener?.onDiscoveryStateChanged(false) }
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "mDNS Stop Discovery failed: Error code $errorCode")
                isDiscovering = false
                mainHandler.post { listener?.onDiscoveryStateChanged(false) }
            }
        }

        try {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
            scheduleScanTimeout(durationMs)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initiate mDNS discovery: ${e.message}")
            isDiscovering = false
            listener?.onDiscoveryStateChanged(false)
        }
    }

    private fun scheduleScanTimeout(durationMs: Long) {
        val runnable = Runnable {
            Log.d(TAG, "mDNS Scan duration expired ($durationMs ms) — stopping discovery")
            stopDiscovery()
        }
        scanTimeoutRunnable = runnable
        mainHandler.postDelayed(runnable, durationMs)
    }

    private fun resolveService(serviceInfo: NsdServiceInfo) {
        nsdManager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "mDNS Resolve failed for ${serviceInfo.serviceName}: code $errorCode")
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val host: InetAddress = serviceInfo.host ?: return
                val ip = host.hostAddress ?: return
                val port = serviceInfo.port

                // Filter out link-local IPv6 addresses if IPv4 is available
                val cleanIp = if (ip.contains("%") || ip.startsWith("fe80")) {
                    ip.split("%")[0]
                } else {
                    ip
                }

                val httpUrl = "http://$cleanIp:$port"
                val wsUrl = "ws://$cleanIp:$port/android"
                val name = serviceInfo.serviceName

                val server = DiscoveredServer(
                    serviceName = name,
                    host = serviceInfo.host?.hostName ?: cleanIp,
                    port = port,
                    ipAddress = cleanIp,
                    httpUrl = httpUrl,
                    wsUrl = wsUrl
                )

                // Validate that the discovered server is actually active and reachable
                HealthCheck.check(httpUrl) { isAlive, _ ->
                    if (isAlive) {
                        discoveredServers[name] = server
                        Log.d(TAG, "✅ Verified Active Server: $name -> $httpUrl")
                        mainHandler.post {
                            listener?.onServerFound(server)
                        }
                    } else {
                        Log.d(TAG, "⚠️ Discovered dead/stale server ignored: $name -> $httpUrl")
                        discoveredServers.remove(name)
                        mainHandler.post {
                            listener?.onServerLost(name)
                        }
                    }
                }
            }
        })
    }

    @Synchronized
    fun stopDiscovery() {
        scanTimeoutRunnable?.let {
            mainHandler.removeCallbacks(it)
            scanTimeoutRunnable = null
        }

        if (!isDiscovering || discoveryListener == null) return

        try {
            nsdManager.stopServiceDiscovery(discoveryListener)
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping discovery: ${e.message}")
        } finally {
            discoveryListener = null
            isDiscovering = false
            listener?.onDiscoveryStateChanged(false)
        }
    }
}
