package com.clowneon1.paymentalertsobs

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

data class AppItem(val packageName: String, val appName: String)

class AppListAdapter(
    private var items: MutableList<AppItem>,
    savedSelected: Set<String>
) : RecyclerView.Adapter<AppListAdapter.ViewHolder>() {

    private val selected = savedSelected.toMutableSet()

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView    = view.findViewById(R.id.tvAppName)
        val tvPkg: TextView     = view.findViewById(R.id.tvPackageName)
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
