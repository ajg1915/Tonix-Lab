/* Tonix Lab hub: routing, stream settings, share links, player builder, help.
   No dependencies. Everything saves to localStorage on this device. */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
var store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- toast + copy ---------- */
var toastT = 0;
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
}
function copyText(text) {
  var done = function () { toast('Copied'); };
  var fallback = function () {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy') ? done() : toast('Press and hold to copy'); } catch (e) { toast('Press and hold to copy'); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

/* ---------- theme (shares a key with studio.html) ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('psb.theme.v1', t); } catch (e) {}
  $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.themeSet === t); });
}
setTheme(document.documentElement.dataset.theme || 'dark');
$$('[data-theme-set]').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.dataset.themeSet); }); });
$$('[data-theme-cycle]').forEach(function (b) {
  b.addEventListener('click', function () {
    var order = ['dark', 'system', 'light'], cur = document.documentElement.dataset.theme;
    setTheme(order[(order.indexOf(cur) + 1) % 3]); toast('Theme: ' + document.documentElement.dataset.theme);
  });
});

/* ---------- install ---------- */
var deferredInstall = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault(); deferredInstall = e;
  $$('[data-install]').forEach(function (b) { b.hidden = false; });
});
$$('[data-install]').forEach(function (b) {
  b.addEventListener('click', function () {
    if (!deferredInstall) return;
    deferredInstall.prompt(); deferredInstall = null;
    $$('[data-install]').forEach(function (x) { x.hidden = true; });
  });
});

/* ---------- router ---------- */
var VIEWS = ['home', 'live', 'share', 'help'];
var TITLES = { home: 'Tonix Lab', live: 'Go live · Tonix Lab', share: 'Share & embed · Tonix Lab', help: 'How to · Tonix Lab' };
var firstRoute = true;
function route() {
  var h = (location.hash || '#home').slice(1);
  if (VIEWS.indexOf(h) < 0) h = 'home';
  VIEWS.forEach(function (v) { $('#v-' + v).hidden = v !== h; });
  $$('[data-nav]').forEach(function (a) {
    if (a.dataset.nav === h) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (h !== 'live') stopPreview();
  document.title = TITLES[h];
  window.scrollTo(0, 0);
  if (!firstRoute) { var hd = $('#v-' + h + ' h1'); if (hd) { hd.tabIndex = -1; hd.focus({ preventScroll: true }); } }
  firstRoute = false;
}
window.addEventListener('hashchange', route);

/* =====================================================================
   GO LIVE: stream settings
   ===================================================================== */
var RES = { '360': [640, 360], '480': [854, 480], '720': [1280, 720], '1080': [1920, 1080] };
var SUGGEST = {
  '360-30': [400, 1000], '360-60': [600, 1500], '480-30': [600, 1500], '480-60': [900, 2200],
  '720-30': [1500, 4000], '720-60': [2500, 6000], '1080-30': [3000, 6500], '1080-60': [4500, 9000]
};
var PRESETS = [
  { id: 'data', label: 'Mobile data', note: '480p at 24 fps. Easy on data and batteries.', v: { video: true, res: '480', fps: 24, vKbps: 800, vMode: 'auto', aKbps: 64, stereo: false } },
  { id: 'balanced', label: 'Balanced', note: '720p at 30 fps. A safe choice for most streams.', v: { video: true, res: '720', fps: 30, vKbps: 2500, vMode: 'fixed', aKbps: 128, stereo: true } },
  { id: 'hq', label: 'High quality', note: '1080p at 30 fps. Needs a strong, steady upload.', v: { video: true, res: '1080', fps: 30, vKbps: 5000, vMode: 'fixed', aKbps: 192, stereo: true } },
  { id: 'smooth', label: 'Smooth 60', note: '720p at 60 fps for fast motion, like gaming or sport.', v: { video: true, res: '720', fps: 60, vKbps: 4500, vMode: 'fixed', aKbps: 160, stereo: true } },
  { id: 'audio', label: 'Audio only', note: 'No video. Smallest and lightest, great for podcasts and music.', v: { video: false, vKbps: 0, vMode: 'fixed', aKbps: 192, stereo: true } }
];
var DEF = { video: true, res: '720', fps: 30, vKbps: 2500, vMode: 'fixed', codec: 'h264', aKbps: 128, stereo: true, sr: 48000, ec: false, ns: false, agc: false, cam: '', mic: '', src: 'cam', m3u8: '', aud: '', mirror: false, flipv: false };
var TYPES = { video: 'b', res: 's', fps: 'n', vKbps: 'n', vMode: 's', codec: 's', aKbps: 'n', stereo: 'b', sr: 'n', ec: 'b', ns: 'b', agc: 'b', cam: 's', mic: 's', src: 's', m3u8: 's', aud: 's', mirror: 'b', flipv: 'b' };
var S = (function () { var o = {}, saved = store.get('tonix.stream.v1', {}), k; for (k in DEF) o[k] = saved[k] !== undefined ? saved[k] : DEF[k]; return o; })();
if (!S.vKbps) S.vKbps = 2500;
function saveS() { store.set('tonix.stream.v1', S); }

var CODECS = [
  { id: 'h264', label: 'H.264', mime: 'video/h264', note: 'Best compatibility and uses your device\'s hardware encoder. The best default.' },
  { id: 'vp8', label: 'VP8', mime: 'video/vp8', note: 'Widely supported. A little less efficient than H.264.' },
  { id: 'vp9', label: 'VP9', mime: 'video/vp9', note: 'Sharper at the same bitrate, but uses more CPU.' },
  { id: 'av1', label: 'AV1', mime: 'video/av1', note: 'Most efficient, but heavy. Only for recent, powerful devices.' }
];
var codecOk = {};
(function () {
  var known = false, mimes = [];
  try {
    var c = window.RTCRtpSender && RTCRtpSender.getCapabilities && RTCRtpSender.getCapabilities('video');
    if (c && c.codecs) { known = true; mimes = c.codecs.map(function (x) { return x.mimeType.toLowerCase(); }); }
  } catch (e) {}
  CODECS.forEach(function (c) { codecOk[c.id] = known ? mimes.indexOf(c.mime) >= 0 : true; });
  if (!codecOk[S.codec]) S.codec = (CODECS.filter(function (c) { return codecOk[c.id]; })[0] || CODECS[0]).id;
})();

function fmtData(mb) { return mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : Math.round(mb) + ' MB'; }
function fmtRate(kbps) { return kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : Math.round(kbps) + ' kbps'; }
function suggestKey() { return S.res + '-' + (S.fps >= 50 ? 60 : 30); }

function renderLive() {
  if (S.video && S.vKbps < 300) S.vKbps = 2500; // coming back from audio-only
  document.body.dataset.src = S.src;
  var pv = $('#prev'); if (pv) pv.style.transform = dirT();
  var lf = $('#liveFrame iframe'); if (lf) lf.style.transform = dirT();
  if (urlP) urlP.setDir(S.mirror, S.flipv);
  var urlMode = S.src === 'm3u8';
  $('#goNote').textContent = urlMode
    ? 'Viewers play your M3U8 link straight from its source, so there is no limit on audience size and nothing is sent from this device. Go live starts your player and marks you on air. You can close this page afterwards.'
    : 'Streams run through VDO.Ninja. Pressing Go live asks to use your camera and mic. Anyone with your viewer link can watch.';
  if (urlMode && !urlP && !live.on) {
    $('#prevBtn').textContent = 'Test link'; $('#prevBtn').classList.add('pri');
    $('#prevMsg').textContent = 'Paste your M3U8 link, then press Test link';
  }
  // controls reflect state
  $$('[data-k]').forEach(function (el) {
    var k = el.dataset.k, v = S[k];
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(v) === el.dataset.v);
    else if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT' && (k === 'cam' || k === 'mic')) { if ($$('option', el).some(function (o) { return o.value === v; })) el.value = v; }
    else el.value = v;
  });
  $('#videoBox').hidden = !S.video;
  $$('[data-k="res"],[data-k="fps"]').forEach(function (b) { b.disabled = !S.video; });
  $('#vOut').textContent = fmtRate(S.vKbps);
  $('#aOut').textContent = S.aKbps + ' kbps';
  $('#vHintShort').textContent = S.res + 'p · ' + S.fps + ' fps';

  var range = SUGGEST[suggestKey()], hint = $('#vHint');
  hint.className = 'note';
  if (S.vKbps < range[0]) { hint.textContent = 'Low for this size. Expect blocky motion. Suggested: ' + range[0] + ' to ' + range[1] + ' kbps.'; hint.classList.add('warn'); }
  else if (S.vKbps > range[1]) { hint.textContent = 'More than this size needs. Viewers on slow connections may buffer. Suggested: ' + range[0] + ' to ' + range[1] + ' kbps.'; hint.classList.add('warn'); }
  else { hint.textContent = 'Good for this size. Suggested: ' + range[0] + ' to ' + range[1] + ' kbps.'; hint.classList.add('ok'); }
  $('#modeNote').textContent = S.vMode === 'auto'
    ? 'Starts at this bitrate and lowers it if your connection struggles. Best on mobile data or shaky Wi-Fi.'
    : 'Holds this bitrate. Predictable, and best for OBS or a steady connection.';

  // encoder list
  var sel = $('#codec');
  if (!sel.options.length) CODECS.forEach(function (c) { var o = document.createElement('option'); o.value = c.id; sel.appendChild(o); });
  CODECS.forEach(function (c, i) { sel.options[i].textContent = c.label + (codecOk[c.id] ? '' : ' (not available on this device)'); sel.options[i].disabled = !codecOk[c.id]; });
  sel.value = S.codec;
  $('#codecNote').textContent = CODECS.filter(function (c) { return c.id === S.codec; })[0].note + ' Used on your viewer and OBS links.';

  // totals
  var total = (S.video ? S.vKbps : 0) + S.aKbps;
  $('#rTotal').textContent = fmtRate(total);
  $('#rHour').textContent = fmtData(total * 0.45);
  $('#rUp').textContent = fmtRate(total * 1.3);

  // presets
  var active = PRESETS.filter(function (p) { return Object.keys(p.v).every(function (k) { return S[k] === p.v[k]; }); })[0];
  $$('#presets .chip').forEach(function (c) { c.setAttribute('aria-pressed', !!active && c.dataset.id === active.id); });
  $('#presetNote').textContent = active ? active.note : 'Custom settings.';
  if (live && live.on) lockSettings(true);
}

function buildPresets() {
  var box = $('#presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id; b.textContent = p.label;
    b.addEventListener('click', function () {
      for (var k in p.v) S[k] = p.v[k];
      saveS(); renderLive(); renderShare(); if (previewing) startPreview();
    });
    box.appendChild(b);
  });
}

function setKey(k, raw) {
  var t = TYPES[k], v = raw;
  if (t === 'n') v = Number(raw); else if (t === 'b') v = raw === true || raw === 'true'; else v = String(raw);
  if (t === 'n' && isNaN(v)) return;
  S[k] = v; saveS();
  if (k === 'src' || k === 'm3u8' || k === 'aud') { if (urlP) stopUrlPreview(); if (k === 'src') stopPreview(); }
  renderLive(); renderShare();
  if (live.on && k === 'vKbps') vdoSend({ bitrate: S.vKbps, lock: true });
  if (previewing && (k === 'cam' || k === 'mic' || k === 'res' || k === 'fps' || k === 'video' || k === 'ec' || k === 'ns' || k === 'agc' || k === 'stereo' || k === 'sr')) schedulePreview();
}
var rePrevT = 0;
function schedulePreview() { clearTimeout(rePrevT); rePrevT = setTimeout(startPreview, 350); }

function wireLive() {
  $$('[data-k]').forEach(function (el) {
    var k = el.dataset.k;
    if (el.tagName === 'BUTTON') el.addEventListener('click', function () { setKey(k, el.dataset.v); });
    else if (el.type === 'checkbox') el.addEventListener('change', function () { setKey(k, el.checked); });
    else if (el.type === 'range') el.addEventListener('input', function () { setKey(k, el.value); });
    else el.addEventListener('change', function () { setKey(k, el.value); });
  });
  $('#vSuggest').addEventListener('click', function () {
    var r = SUGGEST[suggestKey()]; setKey('vKbps', Math.round((r[0] + r[1]) / 2 / 100) * 100);
  });
  $('#goBtn').addEventListener('click', function () { if (live.on) endLive(); else goLive(); });
  $('#liveMic').addEventListener('click', function () { live.micOn = !live.micOn; vdoSend({ mic: live.micOn }); paintLive(); });
  $('#liveCam').addEventListener('click', function () { live.camOn = !live.camOn; vdoSend({ camera: live.camOn }); paintLive(); });
}


/* =====================================================================
   GOING LIVE: VDO.Ninja runs in an iframe inside the preview box.
   Messages go to and from that iframe only, and only on VDO.Ninja's origin.
   ===================================================================== */
var VDO_ORIGIN = (function () { try { return new URL(TonixVdo.HOST).origin; } catch (e) { return 'https://vdo.ninja'; } })();
var live = { on: false, frame: null, t0: 0, tick: 0, statT: 0, views: 0, ready: false, micOn: true, camOn: true, wake: null };

function selLabel(sel) { var o = sel.options[sel.selectedIndex]; return o && o.value ? o.textContent : ''; }
function pushLink(clean) {
  return TonixVdo.pushUrl(room, S, { camLabel: S.video ? selLabel($('#camSel')) : '', micLabel: selLabel($('#micSel')), clean: clean });
}
function vdoSend(msg) {
  if (!live.on || !live.frame || !live.frame.contentWindow) return;
  try { live.frame.contentWindow.postMessage(msg, VDO_ORIGIN); } catch (e) {}
}
function lockSettings(on) {
  $$('[data-k]').forEach(function (el) { var k = el.dataset.k; if (k !== 'vKbps' && k !== 'mirror' && k !== 'flipv') el.disabled = on; });
  $$('#presets .chip').forEach(function (c) { c.disabled = on; });
  $('#camSel').disabled = on; $('#micSel').disabled = on;
  $('#prevBtn').disabled = on; $('#flipBtn').disabled = on;
}
function paintLive() {
  var sec = Math.floor((Date.now() - live.t0) / 1000), m = Math.floor(sec / 60), h = Math.floor(m / 60);
  $('#liveTime').textContent = (h ? h + ':' + String(m % 60).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec % 60).padStart(2, '0');
  if (live.mode === 'url') { $('#liveViews').textContent = '-'; $('#liveState').textContent = urlErr ? 'Link problem' : 'On air'; return; }
  $('#liveViews').textContent = live.views;
  $('#liveState').textContent = live.ready ? 'On air' : (sec > 25 ? 'Waiting' : 'Starting');
  var mic = $('#liveMic'), cam = $('#liveCam');
  mic.setAttribute('aria-pressed', !live.micOn); mic.textContent = live.micOn ? 'Mute mic' : 'Unmute mic';
  cam.setAttribute('aria-pressed', !live.camOn); cam.textContent = live.camOn ? 'Hide camera' : 'Show camera';
  cam.hidden = !S.video;
  if (!live.ready && sec > 25) previewMsg('Still waiting. Allow the camera and mic if asked. If nothing happens, use the new-tab link below.', 'warn');
  else if (live.ready) previewMsg('');
}
function onVdoMsg(e) {
  if (!live.on || !live.frame || e.source !== live.frame.contentWindow || e.origin !== VDO_ORIGIN) return;
  var d = e.data; if (!d || typeof d !== 'object') return;
  if (d.stats && typeof d.stats === 'object') {
    live.ready = true;
    if (typeof d.stats.total_outbound_connections === 'number') live.views = d.stats.total_outbound_connections;
  } else if (d.action === 'view-connection') {
    live.ready = true; live.views = Math.max(0, live.views + (d.value ? 1 : -1));
  }
  paintLive();
}
window.addEventListener('message', onVdoMsg);

function acquireWake() {
  if (!live.on || !navigator.wakeLock || document.hidden) return;
  navigator.wakeLock.request('screen').then(function (l) { live.wake = l; }).catch(function () {});
}
document.addEventListener('visibilitychange', function () { if (!document.hidden) acquireWake(); });
window.addEventListener('beforeunload', function (e) { if (live.on && live.mode !== 'url') { e.preventDefault(); e.returnValue = ''; } });

var urlP = null, urlErr = false;
function stopUrlPreview() {
  if (urlP) { urlP.destroy(); urlP = null; }
  var b = $('#urlFrame'); b.innerHTML = ''; b.hidden = true; urlErr = false;
  if (!live.on) { $('#vid').classList.remove('on'); $('#prevState').textContent = 'Off'; renderLive(); }
}
function startUrlPlayer() {
  var u = TonixPlayer.okUrl(S.m3u8);
  if (!u) { previewMsg('Paste a working M3U8 link first. It starts with https and usually ends in .m3u8.', 'err'); return false; }
  if (urlP) { urlP.destroy(); urlP = null; }
  urlErr = false; previewMsg('');
  var box = $('#urlFrame'); box.hidden = false; $('#vid').classList.add('on');
  urlP = TonixPlayer.mount(box, { src: u, aud: TonixPlayer.okUrl(S.aud), muted: true, mirror: S.mirror, flip: S.flipv, onStatus: function (k, t) {
    urlErr = k === 'err';
    if (k === 'err') previewMsg(t, 'err'); else if (k === 'ok') previewMsg('');
  } });
  $('#urlSound').textContent = 'Sound off'; $('#urlSound').setAttribute('aria-pressed', 'false');
  return true;
}
function goLiveUrl() {
  if (!TonixPlayer.okUrl(S.m3u8)) { previewMsg('Paste a working M3U8 link first. It starts with https and usually ends in .m3u8.', 'err'); return; }
  stopPreview(); previewMsg('');
  if (!startUrlPlayer()) return;
  live.on = true; live.mode = 'url'; live.frame = null; live.t0 = Date.now(); live.views = 0; live.ready = true;
  $('#vid').classList.add('on', 'air');
  $('#vid .tally').innerHTML = '<i class="dot"></i>LIVE';
  $('#liveCtl').hidden = false;
  $('#goBtn').textContent = 'End stream';
  $('#prevState').textContent = 'Live';
  $$('[data-nav="live"]').forEach(function (a) { a.classList.add('onair'); });
  lockSettings(true); paintLive();
  live.tick = setInterval(paintLive, 1000);
  try { $('#vid').scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
  toast('You are live. Share your viewer link.');
}

function goLive() {
  if (S.src === 'm3u8') { goLiveUrl(); return; }
  if (!room) { toast('Set a room name in Share first'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { previewMsg('This browser cannot reach your camera or mic. Try Chrome or Safari over https.', 'err'); return; }
  stopPreview(); previewMsg('');
  var f = document.createElement('iframe');
  f.title = 'Your live stream';
  f.allow = 'camera; microphone; autoplay; display-capture; fullscreen';
  f.setAttribute('allowfullscreen', '');
  f.src = pushLink(true); f.style.transform = dirT();
  var box = $('#liveFrame'); box.innerHTML = ''; box.appendChild(f); box.hidden = false;
  live.on = true; live.frame = f; live.t0 = Date.now(); live.views = 0; live.ready = false; live.micOn = true; live.camOn = true;
  $('#vid').classList.add('on', 'air');
  $('#vid .tally').innerHTML = '<i class="dot"></i>LIVE';
  $('#liveCtl').hidden = false; $('#liveOpen').href = pushLink(false);
  $('#goBtn').textContent = 'End stream';
  $('#prevState').textContent = 'Live';
  $$('[data-nav="live"]').forEach(function (a) { a.classList.add('onair'); });
  lockSettings(true); paintLive();
  live.tick = setInterval(paintLive, 1000);
  live.statT = setInterval(function () { vdoSend({ getStats: true, cib: 'tl-stats' }); }, 3000);
  acquireWake();
  try { $('#vid').scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
  toast('Going live. Allow the camera and mic if asked.');
}

function endLive() {
  vdoSend({ close: true });
  clearInterval(live.tick); clearInterval(live.statT);
  var box = $('#liveFrame'); box.innerHTML = ''; box.hidden = true;
  live.on = false; live.frame = null; live.ready = false; live.mode = ''; stopUrlPreview();
  if (live.wake) { try { live.wake.release(); } catch (e) {} live.wake = null; }
  $('#vid').classList.remove('on', 'air');
  $('#vid .tally').innerHTML = '<i class="dot"></i>PREVIEW';
  $('#liveCtl').hidden = true; previewMsg('');
  $('#goBtn').textContent = 'Go live';
  $('#prevState').textContent = 'Off';
  $$('[data-nav="live"]').forEach(function (a) { a.classList.remove('onair'); });
  lockSettings(false); renderLive();
  toast('Stream ended');
}

/* ---------- preview ---------- */
var stream = null, previewing = false, ac = null, raf = 0, facing = '';
function previewMsg(t, kind) { var n = $('#prevNote'); n.textContent = t || ''; n.className = 'note' + (kind ? ' ' + kind : ''); }

function stopPreview() {
  clearTimeout(rePrevT);
  cancelAnimationFrame(raf); raf = 0;
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  if (ac) { try { ac.close(); } catch (e) {} ac = null; }
  previewing = false;
  var v = $('#prev'); if (v) v.srcObject = null;
  $('#vid').classList.remove('on'); $('#lvl').style.width = '0';
  $('#prevBtn').textContent = 'Start preview'; $('#prevBtn').classList.add('pri');
  $('#prevState').textContent = 'Off'; $('#actual').textContent = '';
  $('#prevMsg').textContent = S.video ? 'Start the preview to check your camera and mic' : 'Audio only. Start the preview to check your mic';
}

function constraints() {
  var wh = RES[S.res] || RES['720'];
  var a = { echoCancellation: S.ec, noiseSuppression: S.ns, autoGainControl: S.agc, channelCount: { ideal: S.stereo ? 2 : 1 }, sampleRate: { ideal: S.sr } };
  if (S.mic) a.deviceId = { exact: S.mic };
  var v = false;
  if (S.video) {
    v = { width: { ideal: wh[0] }, height: { ideal: wh[1] }, frameRate: { ideal: S.fps } };
    if (S.cam) v.deviceId = { exact: S.cam }; else if (facing) v.facingMode = { ideal: facing };
  }
  return { audio: a, video: v };
}

function explain(e) {
  var n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera or mic is blocked. Open How to, "Camera or microphone is blocked", for the fix.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera or mic found that matches. Check the device lists below.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'Another app is using your camera or mic. Close it and try again.';
  return 'Could not start the preview' + (e && e.message ? ': ' + e.message : '.');
}

function startPreview(retried) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { previewMsg('This browser cannot reach your camera or mic. Try Chrome, Safari or Firefox over https.', 'err'); return; }
  var wasOn = previewing; stopPreview();
  $('#prevBtn').disabled = true; $('#prevBtn').textContent = 'Starting...'; previewMsg('');
  navigator.mediaDevices.getUserMedia(constraints()).then(function (s) {
    stream = s; previewing = true;
    var v = $('#prev'); v.srcObject = s; var p = v.play(); if (p && p.catch) p.catch(function () {});
    $('#vid').classList.add('on');
    if (!S.video) { $('#vid').classList.remove('on'); $('#prevMsg').textContent = 'Audio only'; }
    $('#prevBtn').textContent = 'Stop preview'; $('#prevBtn').classList.remove('pri');
    $('#prevState').textContent = 'On';
    var vt = s.getVideoTracks()[0], at = s.getAudioTracks()[0], bits = [];
    if (vt) { var st = vt.getSettings(); if (st.width) bits.push('Video ' + st.width + 'x' + st.height + (st.frameRate ? ' @ ' + Math.round(st.frameRate) + ' fps' : '')); }
    if (at) { var as = at.getSettings(); bits.push('Audio ' + (as.channelCount === 2 ? 'stereo' : 'mono') + (as.sampleRate ? ' ' + (as.sampleRate / 1000) + ' kHz' : '')); }
    $('#actual').textContent = bits.length ? 'Actual: ' + bits.join(' · ') : '';
    fillDevices(); meter(s);
    $('#flipBtn').hidden = !(S.video && vt && vt.getSettings().facingMode);
  }).catch(function (e) {
    if (!retried && e && e.name === 'OverconstrainedError' && (S.cam || S.mic)) { S.cam = ''; S.mic = ''; saveS(); renderLive(); startPreview(true); return; }
    previewMsg(explain(e), 'err'); stopPreview();
  }).then(function () { $('#prevBtn').disabled = false; });
}

function meter(s) {
  if (!s.getAudioTracks().length) return;
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    ac = new AC(); if (ac.state === 'suspended' && ac.resume) ac.resume().catch(function () {}); var src = ac.createMediaStreamSource(s), an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    var buf = new Uint8Array(an.fftSize), bar = $('#lvl');
    (function tick() {
      an.getByteTimeDomainData(buf); var sum = 0, i;
      for (i = 0; i < buf.length; i++) { var d = (buf[i] - 128) / 128; sum += d * d; }
      var db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-6);
      bar.style.width = clamp((db + 60) / 60, 0, 1) * 100 + '%';
      raf = requestAnimationFrame(tick);
    })();
  } catch (e) {}
}

function fillDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices().then(function (list) {
    function fill(sel, kind, key) {
      var cur = S[key]; sel.innerHTML = '';
      var d0 = document.createElement('option'); d0.value = ''; d0.textContent = 'System default'; sel.appendChild(d0);
      var n = 0;
      list.forEach(function (d) {
        if (d.kind !== kind) return; n++;
        var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || (kind === 'videoinput' ? 'Camera ' : 'Microphone ') + n; sel.appendChild(o);
      });
      sel.value = $$('option', sel).some(function (o) { return o.value === cur; }) ? cur : '';
    }
    fill($('#camSel'), 'videoinput', 'cam'); fill($('#micSel'), 'audioinput', 'mic');
    $('#devNote').textContent = 'Pick the camera and mic you want. The preview restarts with your choice.';
  }).catch(function () {});
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', function () { if (previewing) fillDevices(); });
}

function wirePreview() {
  $('#urlSound').addEventListener('click', function () {
    if (!urlP) return; var on = this.getAttribute('aria-pressed') !== 'true'; urlP.setSound(on);
    this.setAttribute('aria-pressed', on); this.textContent = on ? 'Sound on' : 'Sound off';
  });
  $('#prevBtn').addEventListener('click', function () {
    if (S.src === 'm3u8') {
      if (urlP) { stopUrlPreview(); previewMsg(''); }
      else if (startUrlPlayer()) { $('#prevBtn').textContent = 'Stop test'; $('#prevBtn').classList.remove('pri'); $('#prevState').textContent = 'Testing'; }
      return;
    }
    if (previewing) { stopPreview(); previewMsg(''); } else startPreview(); });
  $('#flipBtn').addEventListener('click', function () { facing = facing === 'environment' ? 'user' : 'environment'; S.cam = ''; saveS(); renderLive(); startPreview(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && previewing) { stopPreview(); previewMsg('Preview stopped because the page was hidden.'); } });
}

/* =====================================================================
   SHARE: links and social
   ===================================================================== */
var BASE = location.origin + location.pathname.replace(/[^\/]*$/, '');
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32); }
function randRoom() {
  var a = 'abcdefghjkmnpqrstuvwxyz23456789', r = '', b = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(b);
  for (var i = 0; i < b.length; i++) r += a[b[i] % a.length];
  return 'tonix-' + r;
}
/* Links carry your quality choices so viewers and OBS ask VDO.Ninja for the same codec and bitrate. */
function dirT() { return (S.mirror ? 'scaleX(-1)' : '') + (S.flipv ? ' scaleY(-1)' : ''); }
function dirQ() { return (S.mirror ? '&mr=1' : '') + (S.flipv ? '&fl=1' : ''); }
function linksFor(room) {
  if (S.src === 'm3u8') {
    var su = TonixPlayer.okUrl(S.m3u8), au = TonixPlayer.okUrl(S.aud);
    if (!su) return { watch: '', guest: '', obs: '', embed: '', url: true };
    var up = '?src=' + encodeURIComponent(su) + (au ? '&aud=' + encodeURIComponent(au) : '') + dirQ();
    return { watch: BASE + 'watch.html' + up, guest: '', obs: BASE + 'embed.html' + up, embed: BASE + 'embed.html' + up, url: true };
  }
  var q = '?room=' + encodeURIComponent(room) + '&codec=' + encodeURIComponent(S.codec) + '&vb=' + S.vKbps + '&ab=' + S.aKbps + dirQ();
  return {
    watch: BASE + 'watch.html' + q,
    guest: TonixVdo.pushUrl(room, S, { clean: false, autostart: false }),
    obs: TonixVdo.viewUrl(room, S),
    embed: BASE + 'embed.html' + q
  };
}
var room = store.get('tonix.room.v1', '') || randRoom();
store.set('tonix.room.v1', room);

var SOCIAL = [
  { n: 'X', u: function (l, m) { return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(m) + '&url=' + encodeURIComponent(l); } },
  { n: 'Facebook', u: function (l) { return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(l); } },
  { n: 'WhatsApp', u: function (l, m) { return 'https://wa.me/?text=' + encodeURIComponent(m + ' ' + l); } },
  { n: 'Telegram', u: function (l, m) { return 'https://t.me/share/url?url=' + encodeURIComponent(l) + '&text=' + encodeURIComponent(m); } },
  { n: 'Reddit', u: function (l, m) { return 'https://www.reddit.com/submit?url=' + encodeURIComponent(l) + '&title=' + encodeURIComponent(m); } },
  { n: 'Email', u: function (l, m) { return 'mailto:?subject=' + encodeURIComponent(m) + '&body=' + encodeURIComponent(m + '\n' + l); } }
];


/* QR code for the viewer link. Drawn on this device (no outside service), always dark on white so any phone camera can read it. */
function drawQr(cv, text, size) {
  var q; try { q = qrcode(0, 'M'); q.addData(text); q.make(); } catch (e) { return false; }
  var n = q.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2));
  var px = cell * (n + quiet * 2); cv.width = px; cv.height = px;
  var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, px, px); c.fillStyle = '#000';
  for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return true;
}
function renderQr(url) {
  if (!url) { var cv = $('#qrCanvas'), cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); $('#qrNote').textContent = 'The code appears once there is a viewer link.'; $('#qrSave').disabled = $('#qrShow').disabled = true; return; }
  var ok = drawQr($('#qrCanvas'), url, 264);
  $('#qrNote').textContent = ok ? '' : 'This link is too long for a QR code. Shorten the room name.';
  $('#qrSave').disabled = $('#qrShow').disabled = !ok;
  if (ok && !$('#qrOver').hidden) drawQr($('#qrBig'), url, 600);
}

function renderShare() {
  var L = linksFor(room);
  $('#obsNote').textContent = L.url ? 'Add this as a Browser source in OBS or Streamlabs to show the same player. You can also paste your M3U8 link straight into a Media source.' : 'Clean video and audio straight from VDO.Ninja, with no page around it. Paste it into a Browser source.';
  if (L.url && !L.watch) {
    ['#lkWatch', '#lkGuest', '#lkObs', '#lkEmbed'].forEach(function (id) { $(id).textContent = 'Add your M3U8 link on the Go live tab first.'; });
    $('#socials').innerHTML = ''; renderQr(''); renderEmbed(); return;
  }
  $('#lkWatch').textContent = L.watch; $('#lkGuest').textContent = L.guest; $('#lkObs').textContent = L.obs; $('#lkEmbed').textContent = L.embed;
  renderQr(L.watch);
  var msg = $('#msgIn').value || 'Come watch me live', box = $('#socials'); box.innerHTML = '';
  if (navigator.share) {
    var nb = document.createElement('button'); nb.type = 'button'; nb.className = 'btn pri'; nb.textContent = 'Share...';
    nb.addEventListener('click', function () { navigator.share({ title: msg, text: msg, url: L.watch }).catch(function () {}); });
    box.appendChild(nb);
  }
  SOCIAL.forEach(function (s) {
    var a = document.createElement('a'); a.className = 'btn'; a.textContent = s.n; a.href = s.u(L.watch, msg); a.target = '_blank'; a.rel = 'noopener noreferrer'; box.appendChild(a);
  });
  var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'btn'; cb.textContent = 'Copy link';
  cb.addEventListener('click', function () { copyText(L.watch); }); box.appendChild(cb);
  renderEmbed();
}

function wireShare() {
  var inp = $('#roomIn'); inp.value = room;
  inp.addEventListener('input', function () { var s = slug(inp.value); if (s) { room = s; store.set('tonix.room.v1', room); renderShare(); } });
  inp.addEventListener('blur', function () { inp.value = room; });
  $('#roomNew').addEventListener('click', function () { room = randRoom(); store.set('tonix.room.v1', room); inp.value = room; renderShare(); });
  $('#msgIn').addEventListener('input', renderShare);
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText($('#' + b.dataset.copy).textContent); }); });
  function tab(which) {
    var links = which === 'links';
    $('#paneLinks').hidden = !links; $('#panePlayer').hidden = links;
    $('#tabLinks').setAttribute('aria-pressed', links); $('#tabPlayer').setAttribute('aria-pressed', !links);
  }
  $('#tabLinks').addEventListener('click', function () { tab('links'); });
  $('#tabPlayer').addEventListener('click', function () { tab('player'); });
}

/* =====================================================================
   PLAYER BUILDER
   ===================================================================== */
var ACCENTS = ['#ffb340', '#ff4a3a', '#3fcf8e', '#5aa9ff', '#b57bff', '#ff6fb1'];
var PD = { title: 'My live stream', accent: '#ffb340', ratio: '16:9', chat: true, viewers: true, badge: true, autoplay: false, responsive: true };
var P = (function () { var o = {}, sv = store.get('tonix.player.v1', {}), k; for (k in PD) o[k] = sv[k] !== undefined ? sv[k] : PD[k]; return o; })();
var pvState = 'live', loopUrl = '';
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ratioNums(r) { var p = r.split(':'); return [Number(p[0]), Number(p[1])]; }

function embedHtml() {
  var base = { accent: P.accent.replace('#', ''), chat: P.chat ? 1 : 0, viewers: P.viewers ? 1 : 0, badge: P.badge ? 1 : 0, autoplay: P.autoplay ? 1 : 0, title: P.title };
  if (S.src === 'm3u8') { base.src = TonixPlayer.okUrl(S.m3u8); var au = TonixPlayer.okUrl(S.aud); if (au) base.aud = au; }
  else { base.room = room; base.codec = S.codec; base.vb = S.vKbps; base.ab = S.aKbps; }
  if (S.mirror) base.mr = 1;
  if (S.flipv) base.fl = 1;
  var q = new URLSearchParams(base);
  var src = BASE + 'embed.html?' + q.toString(), rn = ratioNums(P.ratio);
  var attrs = 'title="' + esc(P.title) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"';
  if (P.responsive) {
    return '<div style="position:relative;width:100%;padding-top:' + (rn[1] / rn[0] * 100).toFixed(2) + '%">\n  <iframe src="' + esc(src) + '" ' + attrs + '\n    style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>\n</div>';
  }
  var w = rn[0] >= rn[1] ? 640 : 360, h = Math.round(w * rn[1] / rn[0]);
  return '<iframe src="' + esc(src) + '" width="' + w + '" height="' + h + '" ' + attrs + ' style="border:0"></iframe>';
}
function renderEmbed() { $('#embedCode').value = embedHtml(); }

function renderPlayer() {
  $$('[data-pk]').forEach(function (el) {
    var k = el.dataset.pk;
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', P[k] === el.dataset.v);
    else if (el.type === 'checkbox') el.checked = !!P[k];
  });
  if (document.activeElement !== $('#pTitle')) $('#pTitle').value = P.title;
  $$('#swatches .sw').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.c.toLowerCase() === P.accent.toLowerCase()); });
  var pv = $('#pv'), rn = ratioNums(P.ratio);
  pv.style.setProperty('--pv', P.accent);
  pv.style.maxWidth = rn[0] < rn[1] ? '300px' : '100%';
  $('#pvScreen').style.aspectRatio = rn[0] + ' / ' + rn[1];
  $('#pvTitle').textContent = P.title || 'Untitled';
  var live = pvState === 'live';
  $('#pvLive').setAttribute('aria-pressed', live); $('#pvOff').setAttribute('aria-pressed', !live);
  var badge = $('#pvBadge'); badge.textContent = live ? 'LIVE' : 'OFFLINE'; badge.className = 'badge' + (live ? '' : ' off'); badge.hidden = live && !P.badge;
  $('#pvViews').hidden = !(live && P.viewers);
  $('#pvChat').hidden = !P.chat;
  var loop = $('#pvLoop'), showLoop = !live && !!loopUrl;
  loop.hidden = !showLoop; $('#pvCentre').hidden = showLoop;
  if (showLoop) { var p = loop.play(); if (p && p.catch) p.catch(function () {}); } else loop.pause();
  $('#pvMsg').textContent = live ? 'Your live stream appears here' : 'Offline. Choose a video below to loop here.';
  renderEmbed();
}

function wirePlayer() {
  var sw = $('#swatches');
  ACCENTS.forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'Accent ' + c);
    b.addEventListener('click', function () { P.accent = c; store.set('tonix.player.v1', P); renderPlayer(); }); sw.appendChild(b);
  });
  var pick = document.createElement('input'); pick.type = 'color'; pick.value = P.accent; pick.setAttribute('aria-label', 'Custom accent color');
  pick.addEventListener('input', function () { P.accent = pick.value; store.set('tonix.player.v1', P); renderPlayer(); }); sw.appendChild(pick);

  $$('[data-pk]').forEach(function (el) {
    var k = el.dataset.pk;
    if (el.tagName === 'BUTTON') el.addEventListener('click', function () { P[k] = el.dataset.v; store.set('tonix.player.v1', P); renderPlayer(); });
    else el.addEventListener('change', function () { P[k] = el.checked; store.set('tonix.player.v1', P); renderPlayer(); });
  });
  $('#pTitle').addEventListener('input', function () { P.title = this.value; store.set('tonix.player.v1', P); renderPlayer(); });
  $('#pvLive').addEventListener('click', function () { pvState = 'live'; renderPlayer(); });
  $('#pvOff').addEventListener('click', function () { pvState = 'off'; renderPlayer(); });
  $('#copyEmbed').addEventListener('click', function () { copyText($('#embedCode').value); });
  $('#loopIn').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (loopUrl) URL.revokeObjectURL(loopUrl);
    loopUrl = URL.createObjectURL(f); $('#pvLoop').src = loopUrl; pvState = 'off';
    $('#loopNote').textContent = 'Looping "' + f.name + '" in the preview. It stays on this device for now.';
    renderPlayer();
  });
}

/* =====================================================================
   HELP: search + deep links
   ===================================================================== */
function wireHelp() {
  var q = $('#helpQ'), items = $$('#v-help details'), groups = $$('#v-help .h-group');
  items.forEach(function (d) { d._t = d.textContent.toLowerCase(); });
  q.addEventListener('input', function () {
    var s = q.value.trim().toLowerCase(), any = false;
    items.forEach(function (d) {
      var hit = !s || d._t.indexOf(s) >= 0; d.hidden = !hit; if (hit) any = true;
      if (s.length > 1) d.open = hit; else if (!s) d.open = false;
    });
    groups.forEach(function (g) { g.hidden = !!s; });
    $('#helpNone').hidden = any;
  });
}
function openHelp(id) { location.hash = '#help'; setTimeout(function () { var d = document.getElementById(id); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }, 50); }
document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-help]'); if (a) { e.preventDefault(); openHelp(a.dataset.help); } });

/* ---------- boot ---------- */
buildPresets(); wireLive(); wirePreview(); wireShare(); wirePlayer(); wireHelp();

$('#qrSave').addEventListener('click', function () {
  var a = document.createElement('a'); a.download = 'watch-' + room + '.png'; a.href = $('#qrCanvas').toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
});
$('#qrShow').addEventListener('click', function () { drawQr($('#qrBig'), linksFor(room).watch, 600); $('#qrOver').hidden = false; $('#qrClose').focus(); });
$('#qrClose').addEventListener('click', function () { $('#qrOver').hidden = true; $('#qrShow').focus(); });
$('#qrOver').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#qrOver').hidden) $('#qrOver').hidden = true; });

renderLive(); renderShare(); renderPlayer(); stopPreview(); previewMsg('');
route();
})();
