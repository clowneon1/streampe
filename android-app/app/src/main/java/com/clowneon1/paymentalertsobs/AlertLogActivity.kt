package com.clowneon1.paymentalertsobs

import android.os.Bundle
import android.view.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.*

class AlertLogActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_alert_log)

        val recycler = findViewById<RecyclerView>(R.id.recyclerAlertLog)
        val tvEmpty  = findViewById<TextView>(R.id.tvAlertLogEmpty)
        val btnBack  = findViewById<Button>(R.id.btnAlertLogBack)

        val entries = AlertLog.entries

        if (entries.isEmpty()) {
            tvEmpty.visibility  = View.VISIBLE
            recycler.visibility = View.GONE
        } else {
            tvEmpty.visibility  = View.GONE
            recycler.visibility = View.VISIBLE
            recycler.layoutManager = LinearLayoutManager(this)
            recycler.adapter = AlertLogAdapter(entries)
        }

        btnBack.setOnClickListener { finish() }
    }
}

class AlertLogAdapter(private val items: List<AlertEntry>) :
    RecyclerView.Adapter<AlertLogAdapter.VH>() {

    private val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvTime    : TextView = view.findViewById(R.id.tvLogTime)
        val tvApp     : TextView = view.findViewById(R.id.tvLogApp)
        val tvTitle   : TextView = view.findViewById(R.id.tvLogTitle)
        val tvText    : TextView = view.findViewById(R.id.tvLogText)
        val btnRetrig : Button   = view.findViewById(R.id.btnRetrigger)
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

        holder.btnRetrig.setOnClickListener {
            WebSocketManager.send(entry.fullJson)
            Toast.makeText(it.context, "\uD83D\uDD04 Retriggered to OBS!", Toast.LENGTH_SHORT).show()
        }
    }
}
