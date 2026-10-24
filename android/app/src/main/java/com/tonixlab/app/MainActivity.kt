package com.tonixlab.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var inSpin: Spinner
    private lateinit var outSpin: Spinner
    private lateinit var startBtn: Button
    private lateinit var recBtn: Button
    private lateinit var routeText: TextView
    private lateinit var statusText: TextView
    private var inputs: List<AudioDeviceInfo> = emptyList()
    private var outputs: List<AudioDeviceInfo> = emptyList()
    private var engine: Engine? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        inSpin = Spinner(this)
        outSpin = Spinner(this)
        startBtn = Button(this).apply {
            text = "Start monitor"
            setOnClickListener { toggleMonitor() }
        }
        recBtn = Button(this).apply {
            text = "Record"
            isEnabled = false
            setOnClickListener { toggleRecord() }
        }
        routeText = TextView(this).apply { textSize = 14f }
        statusText = TextView(this).apply { textSize = 13f }
        val refresh = Button(this).apply {
            text = "Refresh devices"
            setOnClickListener { refreshDevices() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
        }
        val views: List<View> = listOf(
            heading("Tonix Lab"),
            heading("Input (your USB or Type-C mic)"), inSpin,
            heading("Output (your earbuds)"), outSpin,
            refresh, startBtn, recBtn, routeText, statusText
        )
        views.forEach {
            root.addView(it, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(root)

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        refreshDevices()
    }

    override fun onDestroy() {
        engine?.stop()
        engine = null
        super.onDestroy()
    }

    private fun heading(s: String): TextView = TextView(this).apply {
        text = s
        textSize = 15f
        setPadding(0, 32, 0, 8)
    }

    private fun refreshDevices() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        inputs = am.getDevices(AudioManager.GET_DEVICES_INPUTS).filter { isInput(it.type) }
        outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { isOutput(it.type) }
        inSpin.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, inputs.map { devName(it) })
        outSpin.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, outputs.map { devName(it) })
        statusText.text = if (inputs.isEmpty()) {
            "No mic found. Plug in your USB or Type-C mic, then tap Refresh."
        } else {
            "Choose your devices, then tap Start monitor."
        }
    }

    private fun isInput(t: Int): Boolean =
        t == AudioDeviceInfo.TYPE_BUILTIN_MIC ||
        t == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        t == AudioDeviceInfo.TYPE_USB_DEVICE ||
        t == AudioDeviceInfo.TYPE_USB_HEADSET ||
        t == AudioDeviceInfo.TYPE_USB_ACCESSORY ||
        t == AudioDeviceInfo.TYPE_LINE_ANALOG ||
        t == AudioDeviceInfo.TYPE_LINE_DIGITAL

    private fun isOutput(t: Int): Boolean =
        t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER ||
        t == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        t == AudioDeviceInfo.TYPE_USB_DEVICE ||
        t == AudioDeviceInfo.TYPE_USB_HEADSET ||
        t == AudioDeviceInfo.TYPE_USB_ACCESSORY ||
        t == AudioDeviceInfo.TYPE_LINE_ANALOG ||
        t == AudioDeviceInfo.TYPE_LINE_DIGITAL ||
        t == AudioDeviceInfo.TYPE_HDMI

    private fun devName(d: AudioDeviceInfo): String {
        val kind = when (d.type) {
            AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB or Type-C"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth"
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Phone mic"
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
            AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired"
            else -> "Other"
        }
        val name = d.productName?.toString()?.takeIf { it.isNotBlank() } ?: "Device"
        return "$name ($kind)"
    }

    private fun toggleMonitor() {
        val running = engine
        if (running != null) {
            running.stop()
            engine = null
            startBtn.text = "Start monitor"
            recBtn.isEnabled = false
            recBtn.text = "Record"
            routeText.text = ""
            statusText.text = "Stopped."
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            return
        }
        val inDev = inputs.getOrNull(inSpin.selectedItemPosition)
        if (inDev == null) {
            statusText.text = "No input selected. Plug in your mic and tap Refresh."
            return
        }
        val outDev = outputs.getOrNull(outSpin.selectedItemPosition)
        try {
            val e = Engine(this, inDev, outDev)
            e.start()
            engine = e
            startBtn.text = "Stop"
            recBtn.isEnabled = true
            routeText.text = "Mic: ${e.inName()}\nEarbuds: ${e.outName()}"
            statusText.text = "Monitoring. Tap Record to save a take."
        } catch (ex: Exception) {
            statusText.text = "Could not start: ${ex.message}"
        }
    }

    private fun toggleRecord() {
        val e = engine ?: return
        if (e.recording) {
            val f = e.stopRecording()
            recBtn.text = "Record"
            statusText.text = if (f != null) "Saved: ${f.absolutePath}" else "Nothing saved."
        } else {
            val f = e.startRecording()
            recBtn.text = "Stop recording"
            statusText.text = "Recording to ${f.absolutePath}"
        }
    }
}
