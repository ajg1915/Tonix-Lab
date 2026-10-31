/* Tonix Lab vocal remover. Everything runs on this device.
   Method: a singer recorded in the middle of a stereo mix is the same in the left and right channels.
   Take the middle (L+R)/2, keep only the voice range of it, and subtract that from both channels.
   Bass and cymbals, which sit outside that range, are left alone. */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var Ctx = window.AudioContext || window.webkitAudioContext;
var dec = null, orig = null, origUrl = '', resUrl = '', resWav = null, name = 'song', showing = 'res', busyT = 0, runId = 0;
var o = { mode: 'inst', method: 'smart', str: 100, lo: 120, hi: 9000, tight: 1, norm: true };

function err(t) { var e = $('#err'); e.hidden = !t; e.textContent = t || ''; }

/* ---------- load ---------- */
function load(file) {
  if (!file) return;
  err(''); $('#monoWarn').hidden = true;
  name = file.name.replace(/\.[^.]+$/, '') || 'song';
  $('#fname').textContent = file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)';
  if (file.size > 400 * 1048576) { err('That file is very large. Try one under 400 MB.'); return; }
  if (origUrl) URL.revokeObjectURL(origUrl);
  origUrl = URL.createObjectURL(file);
  dec = dec || new Ctx();
  file.arrayBuffer().then(function (ab) {
    return new Promise(function (res, rej) { dec.decodeAudioData(ab, res, rej); });
  }).then(function (buf) {
    orig = buf;
    $('#monoWarn').hidden = !isMono(buf);
    $('#opts').hidden = false; $('#out').hidden = false;
    run();
  }).catch(function () { orig = null; err('This browser could not read that file. Try an MP3 or WAV.'); });
}
function isMono(b) {
  if (b.numberOfChannels < 2) return true;
  var l = b.getChannelData(0), r = b.getChannelData(1), step = Math.max(1, Math.floor(l.length / 200000));
  for (var i = 0; i < l.length; i += step) if (Math.abs(l[i] - r[i]) > 1e-4) return false;
  return true;
}

/* ---------- process ---------- */
/* Zero-phase band-pass (voice range). A filter run forward and then backward has no phase shift, which is what lets
   the subtraction below cancel the voice cleanly right up to the edges of the range. */
function coefs(type, f, sr) {
  var w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al, b0, b1, b2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
}
function pass(x, k, rev) {
  var b0 = k[0], b1 = k[1], b2 = k[2], a1 = k[3], a2 = k[4], x1 = 0, x2 = 0, y1 = 0, y2 = 0, n = x.length, i, v, y;
  if (!rev) for (i = 0; i < n; i++) { v = x[i]; y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  else for (i = n - 1; i >= 0; i--) { v = x[i]; y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
}
function bandpass(x, lo, hi, sr) {
  var h = coefs('hp', lo, sr), l = coefs('lp', hi, sr);
  pass(x, h, false); pass(x, h, true); pass(x, l, false); pass(x, l, true);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

/* Music only:  L' = L - s*BP(M)   R' = R - s*BP(R - S),  with M = (L+R)/2 and S = (L-R)/2.
   In the voice range both sides then carry the same signal (the classic L-R karaoke result), so the result also
   sounds right when folded to mono. Outside that range the song is untouched.
   Vocals only: the voice-range middle, as mono. */
function renderClassic() {
  var sr = orig.sampleRate, n = orig.length, s = o.str / 100;
  var L = orig.getChannelData(0), R = orig.numberOfChannels > 1 ? orig.getChannelData(1) : L;
  var hi = Math.min(o.hi, sr * 0.45), lo = Math.min(o.lo, hi - 200), i;
  var m = new Float32Array(n);
  for (i = 0; i < n; i++) m[i] = (L[i] + R[i]) * 0.5;
  var outL = new Float32Array(n), outR = new Float32Array(n);
  return tick().then(function () {
    bandpass(m, lo, hi, sr);
    if (o.mode !== 'inst') { for (i = 0; i < n; i++) outL[i] = outR[i] = m[i] * s; return; }
    for (i = 0; i < n; i++) outL[i] = L[i] - s * m[i];
    return tick().then(function () {
      var rs = m;                                      // reuse the buffer for R - S = 1.5R - 0.5L
      for (i = 0; i < n; i++) rs[i] = 1.5 * R[i] - 0.5 * L[i];
      bandpass(rs, lo, hi, sr);
      for (i = 0; i < n; i++) outR[i] = R[i] - s * rs[i];
    });
  }).then(function () {
    return { length: n, sampleRate: sr, numberOfChannels: 2, getChannelData: function (c) { return c ? outR : outL; } };
  });
}

/* ---------- Smart method: spectral, per frequency bin ----------
   The song is cut into short overlapping slices and each slice into frequency bins. A bin is "centered" when the left
   and right channels carry the same thing in step with each other. Centered bins inside the voice range are turned
   down, in proportion to how centered they are. Unlike plain subtraction this still works when the singer is a little
   louder on one side, and it leaves bins that are clearly off to one side alone. */
var FN = 2048, FH = 512;
var fftT = null;
function fftInit() {
  if (fftT) return fftT;
  var n = FN, h = n / 2, cs = new Float64Array(h), sn = new Float64Array(h), rev = new Uint16Array(n), i, b, bits = Math.log2(n) | 0;
  for (i = 0; i < h; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
  for (i = 0; i < n; i++) { var r = 0; for (b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  fftT = { cs: cs, sn: sn, rev: rev };
  return fftT;
}
function fft(re, im, inv) {
  var t = fftInit(), n = FN, i, j, k, size, half, step, tr, ti, w, c, s;
  for (i = 0; i < n; i++) { j = t.rev[i]; if (j > i) { tr = re[i]; re[i] = re[j]; re[j] = tr; ti = im[i]; im[i] = im[j]; im[j] = ti; } }
  for (size = 2; size <= n; size <<= 1) {
    half = size >> 1; step = n / size;
    for (i = 0; i < n; i += size) for (j = 0, k = 0; j < half; j++, k += step) {
      c = t.cs[k]; s = inv ? t.sn[k] : -t.sn[k];
      var a = i + j, b2 = a + half;
      tr = c * re[b2] - s * im[b2]; ti = c * im[b2] + s * re[b2];
      re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
function smooth(x, a, b) { if (x <= a) return 0; if (x >= b) return 1; var t = (x - a) / (b - a); return t * t * (3 - 2 * t); }
function renderSmart() {
  var sr = orig.sampleRate, n = orig.length, s = o.str / 100, p = o.tight;
  var L = orig.getChannelData(0), R = orig.numberOfChannels > 1 ? orig.getChannelData(1) : L;
  var hi = Math.min(o.hi, sr * 0.45), lo = Math.min(o.lo, hi - 200);
  var half = FN / 2, w = new Float64Array(half + 1), k, win = new Float64Array(FN);
  for (k = 0; k <= half; k++) { var f = k * sr / FN; w[k] = smooth(f, lo * 0.7, lo * 1.3) * (1 - smooth(f, hi * 0.8, hi * 1.2)); }
  for (k = 0; k < FN; k++) win[k] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * (k + 0.5) / FN));
  var outL = new Float32Array(n), outR = new Float32Array(n);
  var lr = new Float64Array(FN), li = new Float64Array(FN), rr = new Float64Array(FN), ri = new Float64Array(FN);
  var scale = 1 / 2, pos = -(FN - FH), inst = o.mode === 'inst', total = Math.ceil((n + FN) / FH), done = 0;
  fftInit();
  function chunk() {
    var end = Math.min(done + 300, total);
    for (; done < end; done++, pos += FH) {
      var j, i;
      for (j = 0; j < FN; j++) { i = pos + j; if (i >= 0 && i < n) { lr[j] = L[i] * win[j]; rr[j] = R[i] * win[j]; } else { lr[j] = rr[j] = 0; } li[j] = ri[j] = 0; }
      fft(lr, li, false); fft(rr, ri, false);
      for (k = 1; k < half; k++) {
        var pl = lr[k] * lr[k] + li[k] * li[k], pr = rr[k] * rr[k] + ri[k] * ri[k], den = pl + pr + 1e-12;
        var c = 2 * (lr[k] * rr[k] + li[k] * ri[k]) / den; if (c < 0) c = 0;
        var m = s * w[k] * (p === 1 ? c : Math.pow(c, p)), g = inst ? 1 - m : m, k2 = FN - k;
        lr[k] *= g; li[k] *= g; rr[k] *= g; ri[k] *= g; lr[k2] *= g; li[k2] *= g; rr[k2] *= g; ri[k2] *= g;
      }
      var gz = inst ? 1 : 0; lr[0] *= gz; li[0] *= gz; rr[0] *= gz; ri[0] *= gz; lr[half] *= gz; li[half] *= gz; rr[half] *= gz; ri[half] *= gz;
      fft(lr, li, true); fft(rr, ri, true);
      for (j = 0; j < FN; j++) { i = pos + j; if (i >= 0 && i < n) { outL[i] += lr[j] / FN * win[j] * scale; outR[i] += rr[j] / FN * win[j] * scale; } }
    }
    setBusy(Math.round(done / total * 100));
    if (done < total) return tick().then(chunk);
  }
  return tick().then(chunk).then(function () {
    return { length: n, sampleRate: sr, numberOfChannels: 2, getChannelData: function (c) { return c ? outR : outL; } };
  });
}
function setBusy(pct) { $('#busy').textContent = 'Working on it... ' + pct + '%'; }
function render() { return o.method === 'classic' ? renderClassic() : renderSmart(); }

function peak(b) {
  var p = 0;
  for (var c = 0; c < b.numberOfChannels; c++) { var d = b.getChannelData(c); for (var i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > p) p = a; } }
  return p;
}
function toWav(b, gain) {
  var n = b.length, ch = 2, bytes = n * ch * 2, ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
  function s(off, t) { for (var i = 0; i < t.length; i++) v.setUint8(off + i, t.charCodeAt(i)); }
  s(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true); v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, bytes, true);
  var L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L, off = 44;
  for (var i = 0; i < n; i++) {
    var l = Math.max(-1, Math.min(1, L[i] * gain)), r = Math.max(-1, Math.min(1, R[i] * gain));
    v.setInt16(off, l < 0 ? l * 32768 : l * 32767, true); v.setInt16(off + 2, r < 0 ? r * 32768 : r * 32767, true); off += 4;
  }
  return new Blob([ab], { type: 'audio/wav' });
}
function run() {
  if (!orig) return;
  var id = ++runId;
  document.body.classList.add('busy'); $('#state').textContent = 'Working'; $('#dl').disabled = true; err('');
  render().then(function (b) {
    if (id !== runId) return;
    var gain = 1;
    if (o.norm) { var p = peak(b); if (p > 1e-4) gain = Math.min(0.89 / p, 12); }
    resWav = toWav(b, gain);
    var t = $('#player').currentTime, was = !$('#player').paused;
    if (resUrl) URL.revokeObjectURL(resUrl);
    resUrl = URL.createObjectURL(resWav);
    document.body.classList.remove('busy'); $('#state').textContent = 'Ready'; $('#dl').disabled = false;
    show(showing, t, was);
  }).catch(function () { if (id !== runId) return; document.body.classList.remove('busy'); $('#state').textContent = 'Error'; err('Something went wrong processing that file. It may be too long for this device. Try a shorter one.'); });
}

/* ---------- player A/B ---------- */
function show(which, t, play) {
  showing = which;
  var p = $('#player'); p.src = which === 'res' ? resUrl : origUrl;
  $('#abRes').setAttribute('aria-pressed', which === 'res'); $('#abOrig').setAttribute('aria-pressed', which !== 'res');
  $('#abRes').classList.toggle('pri', which === 'res'); $('#abOrig').classList.toggle('pri', which !== 'res');
  if (t) p.addEventListener('loadedmetadata', function f() { p.removeEventListener('loadedmetadata', f); try { p.currentTime = t; } catch (e) {} if (play) p.play().catch(function () {}); });
}

/* ---------- wiring ---------- */
$('#file').addEventListener('change', function () { load(this.files[0]); });
var drop = $('#drop');
['dragenter', 'dragover'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('over'); }); });
drop.addEventListener('drop', function (ev) { var f = ev.dataTransfer && ev.dataTransfer.files[0]; if (f) load(f); });

function later() { clearTimeout(busyT); busyT = setTimeout(run, 450); }
document.querySelectorAll('[data-o]').forEach(function (b) {
  b.addEventListener('click', function () { o.mode = b.dataset.o; document.querySelectorAll('[data-o]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); later(); });
});
var TN = { 0.5: 'Widest', 1: 'Wide', 1.5: 'Wide', 2: 'Normal', 2.5: 'Normal', 3: 'Tight', 3.5: 'Tight', 4: 'Very tight' };
document.querySelectorAll('[data-m]').forEach(function (b) {
  b.addEventListener('click', function () { o.method = b.dataset.m; document.querySelectorAll('[data-m]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('#tightBox').hidden = o.method !== 'smart'; later(); });
});
$('#tight').addEventListener('input', function () { o.tight = +this.value; $('#tightOut').textContent = TN[o.tight] || ''; later(); });
$('#str').addEventListener('input', function () { o.str = +this.value; $('#strOut').textContent = o.str + '%'; later(); });
$('#lo').addEventListener('input', function () { o.lo = +this.value; $('#loOut').textContent = o.lo + ' Hz'; later(); });
$('#hi').addEventListener('input', function () { o.hi = +this.value; $('#hiOut').textContent = (o.hi / 1000).toFixed(1) + ' kHz'; later(); });
$('#norm').addEventListener('change', function () { o.norm = this.checked; later(); });
$('#abOrig').addEventListener('click', function () { if (showing !== 'orig') { var p = $('#player'); show('orig', p.currentTime, !p.paused); } });
$('#abRes').addEventListener('click', function () { if (showing !== 'res' && resUrl) { var p = $('#player'); show('res', p.currentTime, !p.paused); } });
$('#dl').addEventListener('click', function () {
  if (!resWav) return;
  var a = document.createElement('a'); a.href = resUrl; a.download = name + (o.mode === 'inst' ? ' (no vocals).wav' : ' (vocals only).wav');
  document.body.appendChild(a); a.click(); a.remove();
});
})();
