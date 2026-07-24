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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_app_selector)
        prefs = AppPrefs(this)

        val tvServer   = findViewById<TextView>(R.id.tvServerStatus)
        val etSearch   = findViewById<EditText>(R.id.etSearch)
        val recycler   = findViewById<RecyclerView>(R.id.recyclerApps)
        val btnSave    = findViewById<Button>(R.id.btnSave)
        val btnDisconn = findViewById<Button>(R.id.btnDisconnect)

        tvServer.text = "🟢 Connected to ${prefs.serverUrl}"

        allApps = getInstalledApps()
        val savedPkgs = prefs.selectedPackages

        adapter = AppListAdapter(allApps.toMutableList(), savedPkgs)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val q = s.toString().lowercase()
                adapter.updateList(
                    if (q.isBlank()) allApps
                    else allApps.filter {
                        it.appName.lowercase().contains(q) || it.packageName.lowercase().contains(q)
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
            Toast.makeText(this, "✅ Saved ${selected.size} app(s)", Toast.LENGTH_SHORT).show()
        }

        btnDisconn.setOnClickListener {
            WebSocketManager.disconnect()
            prefs.isConnected = false
            stopService(Intent(this, NotificationForwarderService::class.java))
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        NotificationService.allowedPackages = savedPkgs

        // Prompt battery optimization exemption on first run
        promptBatteryOptimization()
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

    private fun getInstalledApps(): List<AppItem> {
        val pm = packageManager
        return pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 || hasLaunchIntent(pm, it.packageName) }
            .map { AppItem(packageName = it.packageName, appName = pm.getApplicationLabel(it).toString()) }
            .sortedBy { it.appName.lowercase() }
    }

    private fun hasLaunchIntent(pm: PackageManager, pkg: String) =
        pm.getLaunchIntentForPackage(pkg) != null
}
