package com.clowneon1.paymentalertsobs

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.View
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs
    private lateinit var discoveryManager: ServerDiscoveryManager
    private lateinit var btnConnect: Button
    private lateinit var tvStatus: TextView
    private lateinit var etServerUrl: EditText

    // Auto-Discovery Views
    private lateinit var pbDiscovery: ProgressBar
    private lateinit var tvDiscoveryStatus: TextView
    private lateinit var btnRefreshDiscovery: Button
    private lateinit var layoutDiscoveredServers: LinearLayout
    private lateinit var layoutSavedServersContainer: LinearLayout
    private lateinit var layoutSavedServersChips: LinearLayout

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        // Handled silently
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_PaymentAlertsOBS)
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)
        discoveryManager = ServerDiscoveryManager(this)

        // If notification listener is not granted, launch PermissionsActivity first
        if (!isNotificationAccessGranted()) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_main)
        bindViews()
        setupDiscoveryListener()
        requestPostNotificationPermissionSilently()
        setupClickListeners()
        renderSavedServersChips()

        if (prefs.serverUrl.isNotBlank() && prefs.isConnected) {
            autoReconnect()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!isNotificationAccessGranted()) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            finish()
            return
        }
        renderSavedServersChips()
        discoveryManager.startDiscovery()
    }

    override fun onPause() {
        super.onPause()
        discoveryManager.stopDiscovery()
    }

    private fun setupDiscoveryListener() {
        discoveryManager.listener = object : ServerDiscoveryManager.DiscoveryListener {
            override fun onServerFound(server: DiscoveredServer) {
                runOnUiThread {
                    updateDiscoveredServersUI()
                    val currentText = etServerUrl.text.toString().trim()
                    if (currentText.isBlank() || currentText == "http://192.168.1.100:2907") {
                        etServerUrl.setText(server.httpUrl)
                    }
                }
            }

            override fun onServerLost(serviceName: String) {
                runOnUiThread { updateDiscoveredServersUI() }
            }

            override fun onDiscoveryStateChanged(isSearching: Boolean) {
                runOnUiThread {
                    pbDiscovery.visibility = if (isSearching) View.VISIBLE else View.GONE
                    val count = discoveryManager.getDiscoveredServers().size
                    tvDiscoveryStatus.text = if (isSearching) {
                        if (count > 0) "Found $count server(s) on Wi-Fi" else "Scanning local Wi-Fi for PC server..."
                    } else {
                        if (count > 0) "Found $count server(s)" else "No servers found — tap Scan to retry"
                    }
                }
            }
        }
    }

    private fun updateDiscoveredServersUI() {
        layoutDiscoveredServers.removeAllViews()
        val servers = discoveryManager.getDiscoveredServers()

        if (servers.isEmpty()) {
            val emptyTv = TextView(this).apply {
                text = "No PC servers detected yet. Make sure PC and phone are on the same Wi-Fi network."
                textSize = 11f
                setTextColor(android.graphics.Color.parseColor("#555D7A"))
                setPadding(0, 4, 0, 4)
            }
            layoutDiscoveredServers.addView(emptyTv)
            return
        }

        servers.forEach { srv ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setBackgroundColor(android.graphics.Color.parseColor("#1a1d2b"))
                setPadding(12, 10, 12, 10)
                gravity = android.view.Gravity.CENTER_VERTICAL
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 0, 0, 8) }
                layoutParams = params
            }

            val iconTv = TextView(this).apply {
                text = "🖥️"
                textSize = 18f
                setPadding(0, 0, 10, 0)
            }

            val textLayout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val titleTv = TextView(this).apply {
                text = srv.serviceName
                textSize = 13f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(android.graphics.Color.parseColor("#F0F2FF"))
            }

            val urlTv = TextView(this).apply {
                text = "${srv.httpUrl} (Port ${srv.port})"
                textSize = 11f
                setTextColor(android.graphics.Color.parseColor("#00E5FF"))
            }

            textLayout.addView(titleTv)
            textLayout.addView(urlTv)

            val connectBtn = Button(this).apply {
                text = "Connect"
                textSize = 11f
                setTextColor(android.graphics.Color.WHITE)
                backgroundTintList = ContextCompat.getColorStateList(this@MainActivity, R.color.colorPrimary)
                setPadding(12, 0, 12, 0)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    (36 * resources.displayMetrics.density).toInt()
                )
                stateListAnimator = null
                setOnClickListener {
                    etServerUrl.setText(srv.httpUrl)
                    connectToServer(srv.httpUrl)
                }
            }

            card.addView(iconTv)
            card.addView(textLayout)
            card.addView(connectBtn)
            layoutDiscoveredServers.addView(card)
        }
    }

    private fun renderSavedServersChips() {
        layoutSavedServersChips.removeAllViews()
        val saved = prefs.savedServers

        if (saved.isEmpty()) {
            layoutSavedServersContainer.visibility = View.GONE
            return
        }

        layoutSavedServersContainer.visibility = View.VISIBLE
        saved.forEach { url ->
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setBackgroundColor(android.graphics.Color.parseColor("#1a1d2b"))
                setPadding(10, 6, 8, 6)
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 0, 8, 0) }
                layoutParams = params
            }

            val label = TextView(this).apply {
                text = url.replace("http://", "").replace("https://", "")
                textSize = 11f
                setTextColor(android.graphics.Color.parseColor("#00E5FF"))
                setOnClickListener {
                    etServerUrl.setText(url)
                    connectToServer(url)
                }
            }

            val removeBtn = TextView(this).apply {
                text = " ✕"
                textSize = 11f
                setTextColor(android.graphics.Color.parseColor("#8890AA"))
                setPadding(4, 0, 2, 0)
                setOnClickListener {
                    prefs.removeSavedServer(url)
                    renderSavedServersChips()
                }
            }

            chip.addView(label)
            chip.addView(removeBtn)
            layoutSavedServersChips.addView(chip)
        }
    }

    private fun autoReconnect() {
        etServerUrl.setText(prefs.serverUrl)
        tvStatus.text = "\u23f3 Reconnecting to server..."
        btnConnect.isEnabled = false
        btnConnect.alpha = 0.5f

        HealthCheck.check(prefs.serverUrl) { success, message ->
            runOnUiThread {
                if (isFinishing) return@runOnUiThread

                if (success) {
                    val wsUrl = prefs.serverUrl
                        .replace("http://", "ws://")
                        .replace("https://", "wss://") + "/android"
                    WebSocketManager.connectIfNeeded(wsUrl)
                    val serviceIntent = Intent(this, NotificationForwarderService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent)
                    } else {
                        startService(serviceIntent)
                    }
                    goToAppSelector()
                } else {
                    prefs.isConnected = false
                    tvStatus.text = ""

                    MaterialAlertDialogBuilder(this)
                        .setTitle("Connection Failed")
                        .setMessage("Failed to connect to server: ${prefs.serverUrl}\n\n$message")
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        }
    }

    private fun bindViews() {
        btnConnect                  = findViewById(R.id.btnConnect)
        btnConnect.isEnabled        = true
        btnConnect.alpha            = 1.0f
        tvStatus                    = findViewById(R.id.tvStatus)
        etServerUrl                 = findViewById(R.id.etServerUrl)

        pbDiscovery                 = findViewById(R.id.pbDiscovery)
        tvDiscoveryStatus           = findViewById(R.id.tvDiscoveryStatus)
        btnRefreshDiscovery         = findViewById(R.id.btnRefreshDiscovery)
        layoutDiscoveredServers     = findViewById(R.id.layoutDiscoveredServers)
        layoutSavedServersContainer = findViewById(R.id.layoutSavedServersContainer)
        layoutSavedServersChips     = findViewById(R.id.layoutSavedServersChips)

        findViewById<Button>(R.id.btnOpenPermissions)?.setOnClickListener {
            startActivity(Intent(this, PermissionsActivity::class.java))
        }

        etServerUrl.setText(prefs.serverUrl.ifBlank { "http://192.168.1.100:2907" })
    }

    private fun requestPostNotificationPermissionSilently() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun setupClickListeners() {
        btnRefreshDiscovery.setOnClickListener {
            discoveryManager.stopDiscovery()
            discoveryManager.startDiscovery()
            showToast("Scanning Wi-Fi for PC servers...")
        }

        btnConnect.setOnClickListener {
            var url = etServerUrl.text.toString().trim()
            if (url.isBlank()) { showToast("Enter server URL"); return@setOnClickListener }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "http://$url"
                etServerUrl.setText(url)
            }
            connectToServer(url)
        }
    }

    private fun connectToServer(url: String) {
        if (!isNotificationAccessGranted()) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            return
        }

        tvStatus.text = "\u23f3 Checking server..."
        btnConnect.isEnabled = false

        HealthCheck.check(url) { success, message ->
            runOnUiThread {
                if (success) {
                    prefs.serverUrl   = url
                    prefs.isConnected = true
                    prefs.addSavedServer(url)

                    val wsUrl = url
                        .replace("http://", "ws://")
                        .replace("https://", "wss://") + "/android"
                    WebSocketManager.connect(wsUrl)

                    val serviceIntent = Intent(this, NotificationForwarderService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent)
                    } else {
                        startService(serviceIntent)
                    }

                    goToAppSelector()
                } else {
                    tvStatus.text = "\u274c $message"
                    btnConnect.isEnabled = true
                }
            }
        }
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return !TextUtils.isEmpty(flat) && flat.contains(packageName)
    }

    private fun goToAppSelector() {
        startActivity(Intent(this, AppSelectorActivity::class.java))
        finish()
    }

    private fun showToast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
