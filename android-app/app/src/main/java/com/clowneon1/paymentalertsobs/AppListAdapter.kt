package com.clowneon1.paymentalertsobs

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
            holder.tvWarning.text = "⚡ Recommended (Requires only Notification Access)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#10B981"))
        } else if (item.packageName.contains("amazon", ignoreCase = true)) {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "⚠️ Requires Accessibility Permission (Not Recommended)"
            holder.tvWarning.setTextColor(android.graphics.Color.parseColor("#FBBF24"))
        } else if (item.packageName == "com.whatsapp") {
            holder.tvWarning.visibility = View.VISIBLE
            holder.tvWarning.text = "🧪 Used for Testing"
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
