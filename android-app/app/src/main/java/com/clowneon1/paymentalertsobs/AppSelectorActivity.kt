package com.clowneon1.paymentalertsobs

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.*
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

        val tvServer    = findViewById<TextView>(R.id.tvServerStatus)
        val etSearch    = findViewById<EditText>(R.id.etSearch)
        val recycler    = findViewById<RecyclerView>(R.id.recyclerApps)
        val btnSave     = findViewById<Button>(R.id.btnSave)
        val btnDisconn  = findViewById<Button>(R.id.btnDisconnect)

        tvServer.text = "🟢 Connected to ${prefs.serverUrl}"

        // Load installed apps
        allApps = getInstalledApps()
        val savedPkgs = prefs.selectedPackages

        adapter = AppListAdapter(allApps.toMutableList(), savedPkgs)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        // Search
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val query = s.toString().lowercase()
                val filtered = if (query.isBlank()) allApps
                else allApps.filter {
                    it.appName.lowercase().contains(query) ||
                    it.packageName.lowercase().contains(query)
                }
                adapter.updateList(filtered)
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        // Save selected apps
        btnSave.setOnClickListener {
            val selected = adapter.getSelectedPackages()
            prefs.selectedPackages = selected
            NotificationService.allowedPackages = selected
            Toast.makeText(this, "✅ Saved ${selected.size} app(s)", Toast.LENGTH_SHORT).show()
        }

        // Disconnect
        btnDisconn.setOnClickListener {
            WebSocketManager.disconnect()
            prefs.isConnected = false
            stopService(Intent(this, NotificationForwarderService::class.java))
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        // Apply saved selection to service on launch
        NotificationService.allowedPackages = savedPkgs
    }

    private fun getInstalledApps(): List<AppItem> {
        val pm = packageManager
        return pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 || hasLaunchIntent(pm, it.packageName) }
            .map { info ->
                AppItem(
                    packageName = info.packageName,
                    appName = pm.getApplicationLabel(info).toString()
                )
            }
            .sortedBy { it.appName.lowercase() }
    }

    private fun hasLaunchIntent(pm: PackageManager, pkg: String): Boolean {
        return pm.getLaunchIntentForPackage(pkg) != null
    }
}
