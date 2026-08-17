package com.clowneon1.streampe

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import com.google.android.material.dialog.MaterialAlertDialogBuilder

class PermissionsActivity : AppCompatActivity() {

    private lateinit var viewPager: ViewPager2
    private lateinit var tvStepCounter: TextView
    private lateinit var tabStep1: TextView
    private lateinit var tabStep2: TextView
    private lateinit var tabStep3: TextView
    private lateinit var btnPrevSlide: Button
    private lateinit var btnNextSlide: Button
    private lateinit var btnFinishPermissions: Button
    private lateinit var dot1: TextView
    private lateinit var dot2: TextView
    private lateinit var dot3: TextView

    private lateinit var adapter: PermissionsSlideAdapter

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        updateAllSlideStates()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_PaymentAlertsOBS)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_permissions)

        bindViews()
        setupViewPager()
        setupNavigationListeners()
        requestPostNotificationPermissionSilently()
        updateAllSlideStates()
    }

    override fun onResume() {
        super.onResume()
        updateAllSlideStates()
    }

    private fun bindViews() {
        viewPager            = findViewById(R.id.viewPagerPermissions)
        tvStepCounter        = findViewById(R.id.tvStepCounter)
        tabStep1             = findViewById(R.id.tabStep1)
        tabStep2             = findViewById(R.id.tabStep2)
        tabStep3             = findViewById(R.id.tabStep3)
        btnPrevSlide         = findViewById(R.id.btnPrevSlide)
        btnNextSlide         = findViewById(R.id.btnNextSlide)
        btnFinishPermissions = findViewById(R.id.btnFinishPermissions)
        dot1                 = findViewById(R.id.dot1)
        dot2                 = findViewById(R.id.dot2)
        dot3                 = findViewById(R.id.dot3)
    }

    private fun setupViewPager() {
        adapter = PermissionsSlideAdapter(
            onGrantNotification = { showNotificationAccessDialog() },
            onOpenAppInfo = { openAppInfo() },
            onDisableBattery = { showBatteryOptimizationDialog() },
            onConfigureAccessibility = { showAccessibilityDialog() }
        )
        viewPager.adapter = adapter

        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                updateCarouselUI(position)
            }
        })

        tabStep1.setOnClickListener { viewPager.currentItem = 0 }
        tabStep2.setOnClickListener { viewPager.currentItem = 1 }
        tabStep3.setOnClickListener { viewPager.currentItem = 2 }
    }

    private fun setupNavigationListeners() {
        btnPrevSlide.setOnClickListener {
            val prev = viewPager.currentItem - 1
            if (prev >= 0) viewPager.currentItem = prev
        }

        btnNextSlide.setOnClickListener {
            val next = viewPager.currentItem + 1
            if (next < 3) {
                viewPager.currentItem = next
            } else {
                finishOnboarding()
            }
        }

        btnFinishPermissions.setOnClickListener {
            finishOnboarding()
        }
    }

    private fun updateCarouselUI(position: Int) {
        tvStepCounter.text = "Step ${position + 1} of 3"

        // Tabs
        val activeBg = Color.parseColor("#1a2538")
        val inactiveBg = Color.parseColor("#12151f")
        val activeColor = Color.parseColor("#00E5FF")
        val inactiveColor = Color.parseColor("#555D7A")

        tabStep1.setBackgroundColor(if (position == 0) activeBg else inactiveBg)
        tabStep1.setTextColor(if (position == 0) activeColor else inactiveColor)

        tabStep2.setBackgroundColor(if (position == 1) activeBg else inactiveBg)
        tabStep2.setTextColor(if (position == 1) activeColor else inactiveColor)

        tabStep3.setBackgroundColor(if (position == 2) activeBg else inactiveBg)
        tabStep3.setTextColor(if (position == 2) activeColor else inactiveColor)

        // Dots
        dot1.setTextColor(if (position == 0) activeColor else inactiveColor)
        dot2.setTextColor(if (position == 1) activeColor else inactiveColor)
        dot3.setTextColor(if (position == 2) activeColor else inactiveColor)

        // Navigation Buttons
        btnPrevSlide.visibility = if (position > 0) View.VISIBLE else View.INVISIBLE

        if (position == 2) {
            btnNextSlide.visibility = View.GONE
            btnFinishPermissions.visibility = View.VISIBLE
        } else {
            btnNextSlide.visibility = View.VISIBLE
            btnFinishPermissions.visibility = View.GONE
        }
    }

    private fun finishOnboarding() {
        if (!isNotificationAccessGranted()) {
            Toast.makeText(this, "Please grant Notification Access first to stream alerts", Toast.LENGTH_LONG).show()
            viewPager.currentItem = 0
            showNotificationAccessDialog()
            return
        }
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun updateAllSlideStates() {
        adapter.notifyDataSetChanged()
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

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val pkg = packageName
        return flat.split(":").any { comp ->
            val slash = comp.indexOf('/')
            val compPkg = if (slash != -1) comp.substring(0, slash) else comp
            compPkg == pkg
        }
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val expected = "$packageName/${PaymentAccessibilityService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledServices)
        while (splitter.hasNext()) {
            if (splitter.next().equals(expected, ignoreCase = true)) return true
        }
        return false
    }

    private fun showNotificationAccessDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Notification Access Required")
            .setMessage(
                "StreamPe needs Notification Access to forward alerts to your stream overlay.\n\n" +
                "📱 If Android says 'Restricted Setting':\n" +
                "1. Tap 'App Info' below (or go to Settings ➔ Apps ➔ StreamPe)\n" +
                "2. Tap the 3 dots (⋮) in the top-right corner\n" +
                "3. Tap 'Allow restricted settings'\n\n" +
                "Then come back here and turn ON Notification Access."
            )
            .setPositiveButton("Open Settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            .setNeutralButton("App Info") { _, _ -> openAppInfo() }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun openAppInfo() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Open Settings ➔ Apps ➔ StreamPe", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showAccessibilityDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Accessibility Access — Amazon Pay & Android 15")
            .setMessage(
                "⚠️ Warning: Accessibility services can interfere with banking security screens (like PhonePe PIN security).\n\n" +
                "💡 Recommendation: PhonePe is preferred and does NOT require accessibility.\n\n" +
                "Only enable this if you are using Amazon Pay or payment amounts are missing on Android 15."
            )
            .setPositiveButton("Open Settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun showBatteryOptimizationDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Disable Battery Optimization")
            .setMessage(
                "Android puts background apps to sleep when the screen turns off.\n\n" +
                "Disabling battery optimization ensures notifications are forwarded reliably during long streams without WebSocket disconnects."
            )
            .setPositiveButton("Disable Now") { _, _ -> openBatterySettings() }
            .setNegativeButton("Skip", null)
            .show()
    }

    @SuppressLint("BatteryLife")
    private fun openBatterySettings() {
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
            )
            return
        } catch (_: ActivityNotFoundException) {}
        try {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        } catch (_: Exception) {
            Toast.makeText(this, "Open Settings ➔ Battery ➔ Battery Optimization", Toast.LENGTH_LONG).show()
        }
    }

    // ── ViewPager Slide Adapter ──────────────────────────────────────
    inner class PermissionsSlideAdapter(
        private val onGrantNotification: () -> Unit,
        private val onOpenAppInfo: () -> Unit,
        private val onDisableBattery: () -> Unit,
        private val onConfigureAccessibility: () -> Unit
    ) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

        override fun getItemCount(): Int = 3

        override fun getItemViewType(position: Int): Int = position

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val inflater = LayoutInflater.from(parent.context)
            return when (viewType) {
                0 -> Slide1ViewHolder(inflater.inflate(R.layout.item_permission_slide_notifications, parent, false))
                1 -> Slide2ViewHolder(inflater.inflate(R.layout.item_permission_slide_battery, parent, false))
                else -> Slide3ViewHolder(inflater.inflate(R.layout.item_permission_slide_accessibility, parent, false))
            }
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            when (holder) {
                is Slide1ViewHolder -> holder.bind()
                is Slide2ViewHolder -> holder.bind()
                is Slide3ViewHolder -> holder.bind()
            }
        }

        inner class Slide1ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val tvBadge: TextView = view.findViewById(R.id.tvSlide1Badge)
            private val tvStatus: TextView = view.findViewById(R.id.tvSlide1Status)
            private val btnGrant: Button = view.findViewById(R.id.btnGrantSlide1)
            private val btnAppInfo: Button = view.findViewById(R.id.btnAppInfoSlide1)

            fun bind() {
                val granted = isNotificationAccessGranted()
                if (granted) {
                    tvBadge.text = "GRANTED ✓"
                    tvBadge.setTextColor(Color.parseColor("#4ADE80"))
                    tvBadge.setBackgroundColor(Color.parseColor("#14291e"))
                    tvStatus.text = "🟢 Notification Listener Access is enabled and active!"
                    tvStatus.setTextColor(Color.parseColor("#4ADE80"))
                    btnGrant.text = "Permission Granted ✓"
                    btnGrant.isEnabled = false
                    btnGrant.alpha = 0.6f
                } else {
                    tvBadge.text = "REQUIRED"
                    tvBadge.setTextColor(Color.parseColor("#F87171"))
                    tvBadge.setBackgroundColor(Color.parseColor("#2d1515"))
                    tvStatus.text = "🔴 Notification Listener Access is NOT granted."
                    tvStatus.setTextColor(Color.parseColor("#F87171"))
                    btnGrant.text = "Grant Notification Access"
                    btnGrant.isEnabled = true
                    btnGrant.alpha = 1.0f
                }
                btnGrant.setOnClickListener { onGrantNotification() }
                btnAppInfo.setOnClickListener { onOpenAppInfo() }
            }
        }

        inner class Slide2ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val tvBadge: TextView = view.findViewById(R.id.tvSlide2Badge)
            private val tvStatus: TextView = view.findViewById(R.id.tvSlide2Status)
            private val btnGrant: Button = view.findViewById(R.id.btnGrantSlide2)

            fun bind() {
                val ignored = isBatteryOptimizationIgnored()
                if (ignored) {
                    tvBadge.text = "UNRESTRICTED ✓"
                    tvBadge.setTextColor(Color.parseColor("#4ADE80"))
                    tvBadge.setBackgroundColor(Color.parseColor("#14291e"))
                    tvStatus.text = "🟢 Background execution is unrestricted (Keepalive active)."
                    tvStatus.setTextColor(Color.parseColor("#4ADE80"))
                    btnGrant.text = "Battery Unrestricted ✓"
                    btnGrant.isEnabled = false
                    btnGrant.alpha = 0.6f
                } else {
                    tvBadge.text = "RECOMMENDED"
                    tvBadge.setTextColor(Color.parseColor("#FBBF24"))
                    tvBadge.setBackgroundColor(Color.parseColor("#262208"))
                    tvStatus.text = "⚠️ Battery Optimization is active."
                    tvStatus.setTextColor(Color.parseColor("#FBBF24"))
                    btnGrant.text = "Disable Battery Restrictions"
                    btnGrant.isEnabled = true
                    btnGrant.alpha = 1.0f
                }
                btnGrant.setOnClickListener { onDisableBattery() }
            }
        }

        inner class Slide3ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val tvBadge: TextView = view.findViewById(R.id.tvSlide3Badge)
            private val btnGrant: Button = view.findViewById(R.id.btnGrantSlide3)

            fun bind() {
                val enabled = isAccessibilityServiceEnabled()
                if (enabled) {
                    tvBadge.text = "ENABLED"
                    tvBadge.setTextColor(Color.parseColor("#4ADE80"))
                    tvBadge.setBackgroundColor(Color.parseColor("#14291e"))
                    btnGrant.text = "Accessibility Active (Tap to Change)"
                } else {
                    tvBadge.text = "OPTIONAL"
                    tvBadge.setTextColor(Color.parseColor("#555D7A"))
                    tvBadge.setBackgroundColor(Color.parseColor("#1a1d2b"))
                    btnGrant.text = "Configure Accessibility (Optional)"
                }
                btnGrant.setOnClickListener { onConfigureAccessibility() }
            }
        }
    }
}
