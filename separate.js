/* Tonix Lab built-in music separation (vocals / music), running on this device.
   Model: Open-Unmix UMX-L vocals, as ONNX (nsosu/demucs-onnx on Hugging Face), run with ONNX Runtime Web.
   The model takes a magnitude spectrogram (batch, 2, 2049, frames) and returns the vocal part of it. We turn that
   into a mask, apply it to the song's own spectrogram, and transform back. Music = song minus vocals. */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var Ctx = window.AudioContext || window.webkitAudioContext;

var MODEL_URL = 'https://huggingface.co/nsosu/demucs-onnx/resolve/main/umxl_vocals.onnx';
try { var qp = new URLSearchParams(location.search).get('model'); if (qp && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) MODEL_URL = qp; } catch (e) {}
var CACHE = 'tonix-models-v1';
var NFFT = 4096, HOP = 1024, BINS = 2049, SR = 44100, CORE = 20 * SR, CTX = 3 * SR, XF = SR >> 1;

var file = null, cancel = false, running = false, session = null, urls = [];
function msg(t) { $('#biMsg').textContent = t || ''; }
function bar(p) { $('#biBar').style.width = Math.max(0, Math.min(100, p)) + '%'; }
function err(t) { var e = $('#biErr'); e.hidden = !t; e.textContent = t || ''; }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

/* ---------- FFT (complex, radix-2, 4096) ---------- */
var T = (function () {
  var n = NFFT, h = n / 2, cs = new Float64Array(h), sn = new Float64Array(h), rev = new Uint16Array(n), i, b, bits = 12;
  for (i = 0; i < h; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
  for (i = 0; i < n; i++) { var r = 0; for (b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  return { cs: cs, sn: sn, rev: rev };
})();
function fft(re, im, inv) {
  var n = NFFT, i, j, k, size, half, step, tr, ti, c, s, a, b2;
  for (i = 0; i < n; i++) { j = T.rev[i]; if (j > i) { tr = re[i]; re[i] = re[j]; re[j] = tr; ti = im[i]; im[i] = im[j]; im[j] = ti; } }
  for (size = 2; size <= n; size <<= 1) {
    half = size >> 1; step = n / size;
    for (i = 0; i < n; i += size) for (j = 0, k = 0; j < half; j++, k += step) {
      c = T.cs[k]; s = inv ? T.sn[k] : -T.sn[k]; a = i + j; b2 = a + half;
      tr = c * re[b2] - s * im[b2]; ti = c * im[b2] + s * re[b2];
      re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
var WIN = new Float64Array(NFFT); for (var wi = 0; wi < NFFT; wi++) WIN[wi] = 0.5 - 0.5 * Math.cos(2 * Math.PI * wi / NFFT);

/* STFT like torch.stft(center=True, reflect padding). Result is frame-major: [t * BINS + k]. */
function stft(x) {
  var n = x.length, pad = NFFT / 2, frames = 1 + Math.floor(n / HOP), p = new Float32Array(n + NFFT), i, t, k;
  p.set(x, pad);
  for (i = 0; i < pad; i++) { p[pad - 1 - i] = x[i + 1]; p[pad + n + i] = x[n - 2 - i]; }
  var re = new Float32Array(frames * BINS), im = new Float32Array(frames * BINS), fr = new Float64Array(NFFT), fi = new Float64Array(NFFT);
  for (t = 0; t < frames; t++) {
    var o = t * HOP;
    for (k = 0; k < NFFT; k++) { fr[k] = p[o + k] * WIN[k]; fi[k] = 0; }
    fft(fr, fi, false);
    for (k = 0; k < BINS; k++) { re[t * BINS + k] = fr[k]; im[t * BINS + k] = fi[k]; }
  }
  return { re: re, im: im, frames: frames };
}
function istft(re, im, frames, n) {
  var pad = NFFT / 2, len = (frames - 1) * HOP + NFFT, y = new Float32Array(len), env = new Float32Array(len), fr = new Float64Array(NFFT), fi = new Float64Array(NFFT), t, k;
  for (t = 0; t < frames; t++) {
    var b = t * BINS;
    for (k = 0; k < BINS; k++) { fr[k] = re[b + k]; fi[k] = im[b + k]; }
    for (k = 1; k < BINS - 1; k++) { fr[NFFT - k] = re[b + k]; fi[NFFT - k] = -im[b + k]; }
    fft(fr, fi, true);
    var o = t * HOP;
    for (k = 0; k < NFFT; k++) { y[o + k] += fr[k] / NFFT * WIN[k]; env[o + k] += WIN[k] * WIN[k]; }
  }
  var out = new Float32Array(n);
  for (k = 0; k < n; k++) { var e = env[k + pad]; out[k] = e > 1e-8 ? y[k + pad] / e : 0; }
  return out;
}

/* ---------- audio in / out ---------- */
function toStereo44(buf) {
  var len = Math.ceil(buf.duration * SR), oc = new OfflineAudioContext(2, len, SR), s = oc.createBufferSource();
  s.buffer = buf; s.connect(oc.destination); s.start();
  return oc.startRendering().then(function (r) { return [r.getChannelData(0), r.numberOfChannels > 1 ? r.getChannelData(1) : r.getChannelData(0)]; });
}
function toWav(L, R) {
  var n = L.length, bytes = n * 4, ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
  function s(off, t) { for (var i = 0; i < t.length; i++) v.setUint8(off + i, t.charCodeAt(i)); }
  s(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, bytes, true);
  var off = 44;
  for (var i = 0; i < n; i++) {
    var l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    v.setInt16(off, l < 0 ? l * 32768 : l * 32767, true); v.setInt16(off + 2, r < 0 ? r * 32768 : r * 32767, true); off += 4;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/* ---------- model: download once, keep it ---------- */
function getModel() {
  var cp = ('caches' in window) ? caches.open(CACHE) : Promise.resolve(null);
  return cp.then(function (cache) {
    return (cache ? cache.match(MODEL_URL) : Promise.resolve(null)).then(function (hit) {
      if (hit) { msg('Loading the model from this device...'); return hit.arrayBuffer(); }
      msg('Downloading the model (first time only)...');
      return fetch(MODEL_URL).then(function (res) {
        if (!res.ok) throw new Error('The model download failed (' + res.status + ').');
        var total = +res.headers.get('content-length') || 0, got = 0, chunks = [], rd = res.body.getReader();
        function pump() {
          return rd.read().then(function (r) {
            if (r.done) return;
            chunks.push(r.value); got += r.value.length;
            if (total) { bar(got / total * 40); msg('Downloading the model (first time only): ' + Math.round(got / 1048576) + ' of ' + Math.round(total / 1048576) + ' MB'); }
            if (cancel) throw new Error('cancelled');
            return pump();
          });
        }
        return pump().then(function () {
          var buf = new Uint8Array(got), o = 0; chunks.forEach(function (c) { buf.set(c, o); o += c.length; }); chunks = null;
          if (cache) { try { cache.put(MODEL_URL, new Response(buf.slice().buffer)).catch(function () {}); } catch (e) {} }
          return buf.buffer;
        });
      });
    });
  });
}
function getSession() {
  if (session) return Promise.resolve(session);
  return getModel().then(function (buf) {
    msg('Starting the model...');
    ort.env.wasm.wasmPaths = new URL('ort/', location.href).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) >> 1)) : 1;
    return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }).then(function (s) { session = s; return s; });
}

/* ---------- one chunk ---------- */
function separateChunk(xL, xR) {
  var n = xL.length, sL = stft(xL), sR = stft(xR), F = sL.frames, k, t;
  var inp = new Float32Array(2 * BINS * F);
  for (t = 0; t < F; t++) for (k = 0; k < BINS; k++) {
    var i0 = t * BINS + k;
    inp[k * F + t] = Math.hypot(sL.re[i0], sL.im[i0]);
    inp[(BINS + k) * F + t] = Math.hypot(sR.re[i0], sR.im[i0]);
  }
  var feeds = {}; feeds[session.inputNames[0]] = new ort.Tensor('float32', inp, [1, 2, BINS, F]);
  var magCopy = inp; // the model must not change the buffer, but keep the reference we read from
  return session.run(feeds).then(function (res) {
    var out = res[session.outputNames[0]];
    if (out.dims.length !== 4 || out.dims[2] !== BINS || out.dims[3] !== F) throw new Error('The model returned an unexpected shape: ' + out.dims.join('x'));
    var o = out.data, vr = new Float32Array(F * BINS), vi = new Float32Array(F * BINS), wr = new Float32Array(F * BINS), wi2 = new Float32Array(F * BINS);
    for (t = 0; t < F; t++) for (k = 0; k < BINS; k++) {
      var i0 = t * BINS + k, a = (k * F + t), b = ((BINS + k) * F + t);
      var mL = magCopy[a] > 1e-8 ? Math.min(1, Math.max(0, o[a] / magCopy[a])) : 0;
      var mR = magCopy[b] > 1e-8 ? Math.min(1, Math.max(0, o[b] / magCopy[b])) : 0;
      vr[i0] = sL.re[i0] * mL; vi[i0] = sL.im[i0] * mL; wr[i0] = sR.re[i0] * mR; wi2[i0] = sR.im[i0] * mR;
    }
    return [istft(vr, vi, F, n), istft(wr, wi2, F, n)];
  });
}

/* ---------- whole song, in overlapping chunks ---------- */
function separate(L, R, onProg) {
  var n = L.length, vocL = new Float32Array(n), vocR = new Float32Array(n), starts = [], s;
  for (s = 0; s < n; s += CORE) starts.push(s);
  var idx = 0, t0 = Date.now();
  function next() {
    if (cancel) throw new Error('cancelled');
    if (idx >= starts.length) return;
    var s0 = starts[idx], e0 = Math.min(n, s0 + CORE);
    var ks = Math.max(0, s0 - (XF >> 1)), ke = Math.min(n, e0 + (XF >> 1)), a = Math.max(0, ks - CTX), b = Math.min(n, ke + CTX);
    if (b - a < NFFT * 2) throw new Error('That song is too short to separate.');
    return separateChunk(L.subarray(a, b), R.subarray(a, b)).then(function (v) {
      for (var i = ks; i < ke; i++) {
        var w = 1;
        if (s0 > 0 && i < s0 + (XF >> 1)) w = Math.min(w, (i - (s0 - (XF >> 1))) / XF);
        if (e0 < n && i >= e0 - (XF >> 1)) w = Math.min(w, ((e0 + (XF >> 1)) - i) / XF);
        vocL[i] += v[0][i - a] * w; vocR[i] += v[1][i - a] * w;
      }
      idx++;
      var el = (Date.now() - t0) / 1000, left = el / idx * (starts.length - idx);
      onProg(40 + 60 * idx / starts.length, 'Separating... ' + idx + ' of ' + starts.length + ' parts' + (idx < starts.length ? ', about ' + Math.ceil(left / 60) + ' min left' : ''));
      return tick().then(next);
    });
  }
  return Promise.resolve().then(next).then(function () { return [vocL, vocR]; });
}

/* ---------- page wiring ---------- */
function reset() { urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = []; $('#biOut').hidden = true; err(''); bar(0); msg(''); }
function load(f) {
  if (!f) return;
  file = f; reset(); $('#biName').textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)'; $('#biGo').disabled = false;
}
function run() {
  if (running || !file) return;
  running = true; cancel = false; reset(); $('#biGo').hidden = true; $('#biCancel').hidden = false; $('#biState').textContent = 'Working';
  var name = file.name.replace(/\.[^.]+$/, '') || 'song', ctx = new Ctx(), L, R;
  msg('Reading the song...'); bar(1);
  file.arrayBuffer().then(function (ab) {
    return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); });
  }).then(function (buf) { try { ctx.close(); } catch (e) {} return toStereo44(buf); })
  .then(function (ch) { L = ch[0]; R = ch[1]; return getSession(); })
  .then(function () { bar(40); return separate(L, R, function (p, t) { bar(p); msg(t); }); })
  .then(function (v) {
    var n = L.length, iL = new Float32Array(n), iR = new Float32Array(n);
    for (var i = 0; i < n; i++) { iL[i] = L[i] - v[0][i]; iR[i] = R[i] - v[1][i]; }
    var vocBlob = toWav(v[0], v[1]), instBlob = toWav(iL, iR), vu = URL.createObjectURL(vocBlob), iu = URL.createObjectURL(instBlob);
    urls.push(vu, iu);
    $('#biVoc').src = vu; $('#biInst').src = iu;
    $('#biDlVoc').onclick = function () { dl(vu, name + ' (vocals).wav'); }; $('#biDlInst').onclick = function () { dl(iu, name + ' (music, no vocals).wav'); };
    $('#biOut').hidden = false; bar(100); msg('Done.'); $('#biState').textContent = 'Done';
  }).catch(function (e) {
    $('#biState').textContent = 'Ready';
    if (e && e.message === 'cancelled') { msg('Cancelled.'); bar(0); }
    else { msg(''); err(explain(e)); }
  }).then(function () { running = false; $('#biGo').hidden = false; $('#biCancel').hidden = true; });
}
function explain(e) {
  var m = (e && e.message) || String(e);
  if (/Failed to fetch|NetworkError|download failed/i.test(m)) return 'Could not download the model. Check your connection and try again. (' + m + ')';
  if (/out of memory|allocation|memory/i.test(m)) return 'This device ran out of memory. Try a computer, or a shorter song. (' + m + ')';
  return 'Something went wrong: ' + m;
}
function dl(u, n) { var a = document.createElement('a'); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); }

$('#biFile').addEventListener('change', function () { load(this.files[0]); });
var drop = $('#biDrop');
['dragenter', 'dragover'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('over'); }); });
drop.addEventListener('drop', function (ev) { var f = ev.dataTransfer && ev.dataTransfer.files[0]; if (f) load(f); });
$('#biGo').addEventListener('click', run);
$('#biCancel').addEventListener('click', function () { cancel = true; msg('Stopping...'); });
window.addEventListener('beforeunload', function (e) { if (running) { e.preventDefault(); e.returnValue = ''; } });
})();
