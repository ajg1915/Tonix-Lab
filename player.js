/* Tonix Lab link player: plays an M3U8 (HLS) live link, with an optional second audio link.
   Used by watch.html, embed.html and the Go live preview. hls.js (Apache-2.0) is loaded only when needed. */
(function (root) {
'use strict';

var MSG_BAD = 'This link will not play. Check that it is a working .m3u8 address that starts with https, that the stream is live, and that its host allows other websites to play it.';

function okUrl(u) {
  try { var x = new URL(String(u || '').trim()); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; }
}
function isHls(u) { return /m3u8/i.test(u); }

var hlsLoading = null;
function loadHls() {
  if (root.Hls) return Promise.resolve();
  if (!hlsLoading) hlsLoading = new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = 'hls.light.min.js';
    s.onload = res; s.onerror = function () { hlsLoading = null; rej(new Error('hls.js failed to load')); };
    document.head.appendChild(s);
  });
  return hlsLoading;
}

/* Attach one URL to a <video> or <audio>. Calls onErr(message) when it cannot play. Returns { destroy }. */
function attach(media, url, onErr) {
  var h = null, dead = false;
  function fail(m) { if (!dead && onErr) onErr(m || MSG_BAD); }
  if (location.protocol === 'https:' && /^http:/i.test(url)) { fail('This link starts with http, and browsers block that on an https page. Use the https version of the link.'); return { destroy: function () {} }; }
  media.addEventListener('error', function () { if (!h) fail(); });
  if (!isHls(url) || media.canPlayType('application/vnd.apple.mpegurl')) {
    media.src = url;                                   // plain file, or Safari / iPhone playing HLS natively
  } else {
    loadHls().then(function () {
      if (dead) return;
      if (!root.Hls.isSupported()) { fail('This browser cannot play M3U8 links.'); return; }
      h = new root.Hls({ lowLatencyMode: true, enableWorker: true });
      h.on(root.Hls.Events.ERROR, function (ev, d) {
        if (!d || !d.fatal) return;
        if (d.type === root.Hls.ErrorTypes.MEDIA_ERROR) { try { h.recoverMediaError(); } catch (e) { fail(); } }
        else fail();
      });
      h.loadSource(url); h.attachMedia(media);
    }).catch(function () { fail('The player could not load. Check your connection and try again.'); });
  }
  return { destroy: function () { dead = true; if (h) { try { h.destroy(); } catch (e) {} h = null; } try { media.removeAttribute('src'); media.load(); } catch (e) {} } };
}

/* Build a player inside `box`. o = { src, aud, muted, controls, onStatus(kind, text) }. */
function mount(box, o) {
  box.innerHTML = '';
  var wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;inset:0;background:#000';
  var v = document.createElement('video'); v.playsInline = true; v.setAttribute('playsinline', ''); v.controls = o.controls !== false; v.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000';
  var withAud = !!okUrl(o.aud);
  v.muted = !!o.muted || withAud;                        // with a second audio link, the video's own sound stays off
  wrap.appendChild(v);
  var a = null;
  if (withAud) { a = document.createElement('audio'); a.muted = !!o.muted; wrap.appendChild(a); }
  var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Tap to play';
  btn.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 22px;border:0;border-radius:999px;background:#ffb340;color:#111;font:600 16px system-ui,sans-serif;cursor:pointer;display:none';
  var msg = document.createElement('div'); msg.setAttribute('role', 'status');
  msg.style.cssText = 'position:absolute;inset:auto 0 0 0;padding:10px 12px;background:rgba(0,0,0,.75);color:#ff9d92;font:13px/1.4 system-ui,sans-serif;text-align:center;display:none';
  wrap.appendChild(btn); wrap.appendChild(msg); box.appendChild(wrap);

  function status(kind, text) { if (o.onStatus) o.onStatus(kind, text); }
  function err(t) { msg.textContent = t; msg.style.display = 'block'; btn.style.display = 'none'; status('err', t); }
  var vh = attach(v, okUrl(o.src), err), ah = a ? attach(a, okUrl(o.aud), function () { err('The audio link will not play. Check the audio address. The video link is separate.'); }) : null;

  function play() {
    var ps = [v.play()]; if (a) ps.push(a.play());
    return Promise.all(ps.map(function (p) { return p && p.catch ? p : Promise.resolve(); })).then(function () { btn.style.display = 'none'; });
  }
  btn.addEventListener('click', function () { play().catch(function () {}); });
  v.addEventListener('playing', function () { msg.style.display = 'none'; btn.style.display = 'none'; status('ok', 'Playing'); });
  v.addEventListener('waiting', function () { status('wait', 'Buffering'); });
  var p0 = v.play(); if (a) { var p1 = a.play(); if (p1 && p1.catch) p1.catch(function () {}); }
  if (p0 && p0.catch) p0.catch(function () { if (msg.style.display === 'none') btn.style.display = 'block'; });
  setTimeout(function () { if (v.paused && msg.style.display === 'none') btn.style.display = 'block'; }, 1200);

  return {
    video: v, audio: a,
    setSound: function (on) { if (a) a.muted = !on; else v.muted = !on; },
    destroy: function () { vh.destroy(); if (ah) ah.destroy(); box.innerHTML = ''; }
  };
}

root.TonixPlayer = { okUrl: okUrl, mount: mount };
})(window);
