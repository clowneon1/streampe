package com.clowneon1.streampe

import android.graphics.drawable.Drawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

data class AppItem(
    val packageName: String,
    val appName: String,
    val icon: Drawable? = null
)

class AppListAdapter(
    private var items: MutableList<AppItem>,
    savedSelected: Set<String>
) : RecyclerView.Adapter<AppListAdapter.ViewHolder>() {

    private val selected = savedSelected.toMutableSet()

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivIcon: ImageView   = view.findViewById(R.id.ivAppIcon)
        val tvName: TextView    = view.findViewById(R.id.tvAppName)
        val tvPkg: TextView     = view.findViewById(R.id.tvPackageName)
        val tvWarning: TextView = view.findViewById(R.id.tvWarning)
        val checkbox: CheckBox  = view.findViewById(R.id.cbSelected)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.tvName.text = item.appName
        holder.tvPkg.text  = item.packageName

        if (item.packageName == "com.phonepe.app") {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "⚡ Fast Alert (Amount only • PhonePe doesn't support messages)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#A78BFA"))
        } else if (item.packageName.contains("paisa") || item.packageName.contains("gpay")) {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "💬 Supports Amount + Donor Messages (Notification Access only)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#38BDF8"))
        } else if (item.packageName.contains("amazon", ignoreCase = true)) {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "🛒 Amazon Pay (May require Accessibility fallback if masked)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#FBBF24"))
        } else if (item.packageName.contains("whatsapp", ignoreCase = true)) {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "🧪 Used for Testing (Simulated alerts only)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#00E5FF"))
        } else {
            holder.tvWarning.visibility = View.GONE
        }

        if (item.icon != null) {
            holder.ivIcon.setImageDrawable(item.icon)
        } else {
            holder.ivIcon.setImageResource(android.R.drawable.sym_def_app_icon)
        }

        holder.checkbox.setOnCheckedChangeListener(null)
        holder.checkbox.isChecked = item.packageName in selected
        holder.checkbox.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) selected.add(item.packageName)
            else selected.remove(item.packageName)
        }
        holder.itemView.setOnClickListener {
            holder.checkbox.isChecked = !holder.checkbox.isChecked
        }
    }

    override fun getItemCount() = items.size

    fun updateList(newItems: List<AppItem>) {
        items = newItems.toMutableList()
        notifyDataSetChanged()
    }

    fun getSelectedPackages(): Set<String> = selected.toSet()
}
