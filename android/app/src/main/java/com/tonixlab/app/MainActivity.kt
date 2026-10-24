package com.tonixlab.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView

class MainActivity : Activity() {
    private val ink = Color.parseColor("#0d0e11")
    private val panel2 = Color.parseColor("#22262e")
    private val panelFill = Color.parseColor("#1a1d23")
    private val line = Color.parseColor("#2b303a")
    private val lineHi = Color.parseColor("#3b4250")
    private val textColor = Color.parseColor("#ebe7de")
    private val mute = Color.parseColor("#9097a4")
    private val faint = Color.parseColor("#646a77")
    private val amber = Color.parseColor("#ffb340")
    private val amberSoft = Color.parseColor("#26ffb340")
    private val recColor = Color.parseColor("#ff4a3a")
    private val recSoft = Color.parseColor("#331a16")
    private val go = Color.parseColor("#3fcf8e")

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
        window.statusBarColor = ink
        window.navigationBarColor = ink

        inSpin = Spinner(this).apply { background = roundRect(panel2, lineHi, 8) }
        outSpin = Spinner(this).apply { background = roundRect(panel2, lineHi, 8) }
        startBtn = btn("Start monitor") { toggleMonitor() }
        recBtn = btn("Record") { toggleRecord() }.apply { isEnabled = false }
        val refresh = btn("Refresh devices") { refreshDevices() }
        routeText = TextView(this).apply {
            textSize = 14f
            setTextColor(textColor)
            typeface = Typeface.MONOSPACE
        }
        statusText = TextView(this).apply {
            textSize = 13f
            setTextColor(mute)
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = "TONIX LAB"
                textSize = 32f
                setTextColor(textColor)
                typeface = Typeface.DEFAULT_BOLD
                letterSpacing = 0.07f
            })
            addView(TextView(this@MainActivity).apply {
                text = "VOCAL CHANNEL & RECORDER"
                textSize = 11f
                setTextColor(faint)
                typeface = Typeface.MONOSPACE
                letterSpacing = 0.14f
            })
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(40), dp(16), dp(24))
        }
        root.addView(header, lp(0))
        root.addView(panel(label("Input (your USB or Type-C mic)"), inSpin, label("Output (your earbuds)"), outSpin, refresh), lp(14))
        root.addView(panel(startBtn, recBtn, routeText, statusText), lp(14))

        setContentView(ScrollView(this).apply {
            setBackgroundColor(ink)
            addView(root)
        })

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

    private fun dp(n: Int): Int = (n * resources.displayMetrics.density).toInt()

    private fun lp(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(top)
        }

    private fun roundRect(fill: Int, stroke: Int, radiusDp: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(fill)
            cornerRadius = dp(radiusDp).toFloat()
            setStroke(dp(1), stroke)
        }

    private fun panel(vararg items: View): LinearLayout {
        val p = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundRect(panelFill, line, 12)
            setPadding(dp(16), dp(14), dp(16), dp(16))
        }
        items.forEach { p.addView(it, lp(10)) }
        return p
    }

    private fun label(caption: String): TextView = TextView(this).apply {
        this.text = caption.uppercase()
        textSize = 11f
        setTextColor(faint)
        typeface = Typeface.DEFAULT_BOLD
        letterSpacing = 0.14f
    }

    private fun btn(caption: String, onClick: () -> Unit): Button = Button(this).apply {
        isAllCaps = false
        this.text = caption.uppercase()
        typeface = Typeface.DEFAULT_BOLD
        textSize = 13f
        letterSpacing = 0.08f
        setMinimumHeight(dp(48))
        applyBtn(this, false)
        setOnClickListener { onClick() }
    }

    private fun applyBtn(b: Button, on: Boolean, rec: Boolean = false) {
        val active = on || rec
        val col = when {
            rec -> recColor
            on -> amber
            else -> textColor
        }
        val fill = when {
            rec -> recSoft
            on -> amberSoft
            else -> panel2
        }
        b.background = roundRect(fill, if (active) col else lineHi, 8)
        b.setTextColor(col)
    }

    private fun setStatus(msg: String, good: Boolean) {
        statusText.text = msg
        statusText.setTextColor(if (good) go else mute)
    }

    private inner class StyledAdapter(items: List<String>) :
        ArrayAdapter<String>(this@MainActivity, android.R.layout.simple_spinner_item, items) {
        init {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val tv = super.getView(position, convertView, parent) as TextView
            tv.setTextColor(textColor)
            tv.textSize = 15f
            tv.setPadding(dp(12), dp(12), dp(12), dp(12))
            return tv
        }

        override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View {
            val tv = super.getDropDownView(position, convertView, parent) as TextView
            tv.setTextColor(textColor)
            tv.setBackgroundColor(panel2)
            tv.setPadding(dp(14), dp(12), dp(14), dp(12))
            return tv
        }
    }

    private fun refreshDevices() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        inputs = am.getDevices(AudioManager.GET_DEVICES_INPUTS).filter { isInput(it.type) }
        outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { isOutput(it.type) }
        inSpin.adapter = StyledAdapter(inputs.map { devName(it) })
        outSpin.adapter = StyledAdapter(outputs.map { devName(it) })
        if (inputs.isEmpty()) {
            setStatus("No mic found. Plug in your USB or Type-C mic, then tap Refresh.", false)
        } else {
            setStatus("Choose your devices, then tap Start monitor.", false)
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
            startBtn.text = "START MONITOR"
            applyBtn(startBtn, false)
            recBtn.isEnabled = false
            recBtn.text = "RECORD"
            applyBtn(recBtn, false)
            routeText.text = ""
            setStatus("Stopped.", false)
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            return
        }
        val inDev = inputs.getOrNull(inSpin.selectedItemPosition)
        if (inDev == null) {
            setStatus("No input selected. Plug in your mic and tap Refresh.", false)
            return
        }
        val outDev = outputs.getOrNull(outSpin.selectedItemPosition)
        try {
            val e = Engine(this, inDev, outDev)
            e.start()
            engine = e
            startBtn.text = "STOP"
            applyBtn(startBtn, true)
            recBtn.isEnabled = true
            routeText.text = "MIC  ${e.inName()}\nEARBUDS  ${e.outName()}"
            setStatus("Monitoring. Tap Record to save a take.", true)
        } catch (ex: Exception) {
            setStatus("Could not start: ${ex.message}", false)
        }
    }

    private fun toggleRecord() {
        val e = engine ?: return
        if (e.recording) {
            val f = e.stopRecording()
            recBtn.text = "RECORD"
            applyBtn(recBtn, false)
            setStatus(if (f != null) "Saved: ${f.absolutePath}" else "Nothing saved.", true)
        } else {
            val f = e.startRecording()
            recBtn.text = "STOP RECORDING"
            applyBtn(recBtn, false, rec = true)
            setStatus("Recording to ${f.absolutePath}", true)
        }
    }
}
