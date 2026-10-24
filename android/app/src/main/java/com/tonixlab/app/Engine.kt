package com.tonixlab.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Native audio path: the mic is opened from the chosen input device and
 * the monitor is sent to the chosen output device. Mono, 48 kHz, 16-bit.
 */
class Engine(
    private val ctx: Context,
    private val inDev: AudioDeviceInfo,
    private val outDev: AudioDeviceInfo?
) {
    private val rate = 48000
    private val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var rec: AudioRecord? = null
    private var track: AudioTrack? = null
    private var th: Thread? = null

    @Volatile private var running = false

    @Volatile
    var recording = false
        private set

    private var file: RandomAccessFile? = null
    private var outFile: File? = null
    private var dataBytes = 0L

    fun inName(): String {
        val dev: AudioDeviceInfo = rec?.routedDevice ?: inDev
        return dev.productName?.toString() ?: "Unknown"
    }

    fun outName(): String {
        val dev: AudioDeviceInfo? = track?.routedDevice ?: outDev
        return dev?.productName?.toString() ?: "System default"
    }

    fun start() {
        val unprocessed = am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
        val source = if (unprocessed) MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
        val enc = AudioFormat.ENCODING_PCM_16BIT

        val inMin = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, enc)
        val r = AudioRecord.Builder()
            .setAudioSource(source)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(enc)
                    .setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build()
            )
            .setBufferSizeInBytes(inMin * 4)
            .build()
        if (Build.VERSION.SDK_INT >= 28) {
            r.preferredDevice = inDev
        }

        val outMin = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, enc)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(enc)
                    .setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(outMin * 4)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        val od = outDev
        if (od != null) {
            t.preferredDevice = od
        }

        rec = r
        track = t
        r.startRecording()
        t.play()
        running = true
        th = thread(name = "tonix-audio") { loop(r, t) }
    }

    private fun loop(r: AudioRecord, t: AudioTrack) {
        val buf = ShortArray(480)
        while (running) {
            val n = r.read(buf, 0, buf.size)
            if (n < 0) break
            if (n == 0) continue
            t.write(buf, 0, n)
            if (recording) {
                val bb = ByteBuffer.allocate(n * 2).order(ByteOrder.LITTLE_ENDIAN)
                for (i in 0 until n) bb.putShort(buf[i])
                synchronized(this) {
                    file?.write(bb.array())
                    dataBytes += (n * 2).toLong()
                }
            }
        }
    }

    fun startRecording(): File {
        val dir = File(ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "Tonix")
        dir.mkdirs()
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val f = File(dir, "take_$stamp.wav")
        val raf = RandomAccessFile(f, "rw")
        raf.setLength(0)
        raf.write(wavHeader(0L))
        synchronized(this) {
            file = raf
            outFile = f
            dataBytes = 0L
            recording = true
        }
        return f
    }

    fun stopRecording(): File? {
        synchronized(this) {
            recording = false
            val raf = file ?: return null
            raf.seek(0)
            raf.write(wavHeader(dataBytes))
            raf.close()
            file = null
            return outFile
        }
    }

    fun stop() {
        running = false
        th?.join(1000)
        stopRecording()
        try {
            rec?.stop()
        } catch (e: Exception) {
        }
        rec?.release()
        rec = null
        try {
            track?.stop()
        } catch (e: Exception) {
        }
        track?.release()
        track = null
    }

    private fun wavHeader(dataLen: Long): ByteArray {
        val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        h.put("RIFF".toByteArray())
        h.putInt((36 + dataLen).toInt())
        h.put("WAVE".toByteArray())
        h.put("fmt ".toByteArray())
        h.putInt(16)
        h.putShort(1)
        h.putShort(1)
        h.putInt(rate)
        h.putInt(rate * 2)
        h.putShort(2)
        h.putShort(16)
        h.put("data".toByteArray())
        h.putInt(dataLen.toInt())
        return h.array()
    }
}
