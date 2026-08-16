package com.clowneon1.paymentalertsobs

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class AppSelectorActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs
    private lateinit var adapter: AppListAdapter
    private var allApps: List<AppItem> = emptyList()

    private lateinit var tvServer: TextView

    private val wsStateListener = object : WebSocketManager.ConnectionStateListener {
        override fun onConnectionStateChanged(isConnected: Boolean, message: String) {
            runOnUiThread {
                if (isConnected) {
                    tvServer.text = "🟢 Connected: ${prefs.serverUrl}"
                    tvServer.setTextColor(android.graphics.Color.parseColor("#4ADE80"))
                    tvServer.setBackgroundColor(android.graphics.Color.parseColor("#14291e"))
                } else {
                    tvServer.text = "🔴 Server Closed / Reconnecting..."
                    tvServer.setTextColor(android.graphics.Color.parseColor("#F87171"))
                    tvServer.setBackgroundColor(android.graphics.Color.parseColor("#2d1515"))
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_app_selector)
        prefs = AppPrefs(this)
        AlertLog.init(this)

        tvServer       = findViewById(R.id.tvServerStatus)
        val etSearch   = findViewById<EditText>(R.id.etSearch)
        val recycler   = findViewById<RecyclerView>(R.id.recyclerApps)
        val btnSave    = findViewById<Button>(R.id.btnSave)
        val btnDisconn = findViewById<Button>(R.id.btnDisconnect)
        val btnTest    = findViewById<Button>(R.id.btnTest)
        val btnAlertLog = findViewById<Button>(R.id.btnAlertLog)

        val savedPkgs = prefs.selectedPackages
        adapter = AppListAdapter(mutableListOf(), savedPkgs)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        Thread {
            allApps = getInstalledApps()
            runOnUiThread { adapter.updateList(allApps) }
        }.start()

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val q = s.toString().trim().lowercase()
                adapter.updateList(
                    if (q.isBlank()) allApps
                    else allApps.filter { app ->
                        val name = app.appName.lowercase()
                        val pkg = app.packageName.lowercase()
                        name.contains(q) ||
                        pkg.contains(q) ||
                        (q in listOf("gpay", "google pay", "google", "paisa") && (pkg.contains("paisa") || name.contains("google"))) ||
                        (q in listOf("phonepe", "pe") && (pkg.contains("phonepe") || name.contains("phonepe"))) ||
                        (q in listOf("amazon", "amazon pay") && (pkg.contains("amazon") || name.contains("amazon"))) ||
                        (q in listOf("whatsapp", "wa") && (pkg.contains("whatsapp") || name.contains("whatsapp")))
                    }
                )
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        btnSave.setOnClickListener {
            val selected = adapter.getSelectedPackages()
            prefs.selectedPackages = selected
            NotificationService.allowedPackages = selected
            Toast.makeText(this, "\u2705 Saved ${selected.size} app(s)", Toast.LENGTH_SHORT).show()
        }

        btnDisconn.setOnClickListener {
            WebSocketManager.disconnect()
            prefs.isConnected = false
            stopService(Intent(this, NotificationForwarderService::class.java))
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        btnTest.setOnClickListener {
            startActivity(Intent(this, NotificationTesterActivity::class.java))
        }

        btnAlertLog.setOnClickListener {
            startActivity(Intent(this, AlertLogActivity::class.java))
        }

        NotificationService.allowedPackages = savedPkgs
        promptBatteryOptimization()
    }

    override fun onResume() {
        super.onResume()
        WebSocketManager.addListener(wsStateListener)
    }

    override fun onPause() {
        super.onPause()
        WebSocketManager.removeListener(wsStateListener)
    }

    private val TARGET_PACKAGES = setOf(
        "com.phonepe.app",
        "com.google.android.apps.nbu.paisa.user",
        "in.amazon.mShop.android.shopping",
        "com.amazon.mShop.android.shopping",
        "com.whatsapp",
        "com.whatsapp.w4b"
    )

    private fun getInstalledApps(): List<AppItem> {
        val pm = packageManager
        return TARGET_PACKAGES.mapNotNull { pkg ->
            try {
                val info = pm.getApplicationInfo(pkg, 0)
                AppItem(
                    packageName = info.packageName,
                    appName     = pm.getApplicationLabel(info).toString(),
                    icon        = try { pm.getApplicationIcon(info.packageName) } catch (e: Exception) { null }
                )
            } catch (e: Exception) {
                null
            }
        }.sortedBy { it.appName.lowercase() }
    }

    @SuppressLint("BatteryLife")
    private fun promptBatteryOptimization() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        AlertDialog.Builder(this)
            .setTitle("Disable Battery Optimization")
            .setMessage(
                "To keep notification forwarding running reliably in the background, " +
                "please disable battery optimization for this app.\n\n" +
                "Without this, Android may kill the service after a few minutes."
            )
            .setPositiveButton("Disable Now") { _, _ ->
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                )
            }
            .setNegativeButton("Skip", null)
            .show()
    }
}
