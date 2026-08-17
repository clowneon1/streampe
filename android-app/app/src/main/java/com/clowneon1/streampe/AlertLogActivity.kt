package com.clowneon1.streampe

import android.os.Bundle
import android.view.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.*

class AlertLogActivity : AppCompatActivity() {

    private lateinit var recycler : RecyclerView
    private lateinit var layoutEmpty : LinearLayout
    private lateinit var tvCount : TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_alert_log)
        AlertLog.init(this)

        recycler    = findViewById(R.id.recyclerAlertLog)
        layoutEmpty = findViewById(R.id.layoutEmpty)
        tvCount     = findViewById(R.id.tvLogCount)

        findViewById<ImageButton>(R.id.btnAlertLogBack).setOnClickListener { finish() }

        findViewById<Button>(R.id.btnClearLog).setOnClickListener {
            AlertLog.clear()
            refresh()
            Toast.makeText(this, "Log cleared", Toast.LENGTH_SHORT).show()
        }

        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val entries = AlertLog.entries // Latest first (added at index 0)
        if (entries.isEmpty()) {
            layoutEmpty.visibility = View.VISIBLE
            recycler.visibility    = View.GONE
            tvCount.visibility     = View.GONE
        } else {
            layoutEmpty.visibility = View.GONE
            recycler.visibility    = View.VISIBLE
            tvCount.visibility     = View.VISIBLE
            tvCount.text           = entries.size.toString()
            recycler.layoutManager = LinearLayoutManager(this)
            recycler.adapter       = AlertLogAdapter(entries) { entry ->
                AlertLog.remove(entry)
                refresh()
            }
        }
    }
}

class AlertLogAdapter(
    private val items: List<AlertEntry>,
    private val onDelete: (AlertEntry) -> Unit
) : RecyclerView.Adapter<AlertLogAdapter.VH>() {

    private val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvTime      : TextView  = view.findViewById(R.id.tvLogTime)
        val tvApp       : TextView  = view.findViewById(R.id.tvLogApp)
        val tvTestBadge : TextView  = view.findViewById(R.id.tvTestBadge)
        val layoutChips : LinearLayout = view.findViewById(R.id.layoutChips)
        val tvSender    : TextView  = view.findViewById(R.id.tvLogSender)
        val tvAmount    : TextView  = view.findViewById(R.id.tvLogAmount)
        val tvTitle     : TextView  = view.findViewById(R.id.tvLogTitle)
        val tvText      : TextView  = view.findViewById(R.id.tvLogText)
        val btnRetrig   : Button    = view.findViewById(R.id.btnRetrigger)
        val btnDelete   : Button    = view.findViewById(R.id.btnDeleteEntry)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_alert_log, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val entry = items[position]

        holder.tvTime.text  = sdf.format(Date(entry.timestamp))
        holder.tvApp.text   = entry.appName
        holder.tvTitle.text = entry.title
        holder.tvText.text  = entry.text

        // TEST badge
        val isTest = entry.appName.contains("test", ignoreCase = true) ||
                     entry.source == "test"
        holder.tvTestBadge.visibility = if (isTest) View.VISIBLE else View.GONE

        // Sender + amount chips
        val hasParsed = entry.sender.isNotBlank() || entry.amount.isNotBlank()
        holder.layoutChips.visibility = if (hasParsed) View.VISIBLE else View.GONE
        if (hasParsed) {
            holder.tvSender.text = if (entry.sender.isNotBlank()) "\uD83D\uDC64 ${entry.sender}" else "Unknown"
            holder.tvAmount.text = if (entry.amount.isNotBlank()) entry.amount else "--"
        }

        holder.btnRetrig.setOnClickListener {
            WebSocketManager.send(entry.fullJson)
            Toast.makeText(it.context, "\uD83D\uDD04 Retriggered!", Toast.LENGTH_SHORT).show()
        }

        holder.btnDelete.setOnClickListener {
            onDelete(entry)
            Toast.makeText(it.context, "\u2715 Entry deleted", Toast.LENGTH_SHORT).show()
        }
    }
}
