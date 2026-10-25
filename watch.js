/* Shared by watch.html (branded viewer page) and embed.html (bare player).
   Reads ?room=...&codec=...&vb=...&ab=...&title=...&accent=... and shows the stream. */
(function () {
'use strict';
var q = new URLSearchParams(location.search);
var room = TonixVdo.cleanRoom(q.get('room'));
var codec = (q.get('codec') || '').toLowerCase();
var vb = parseInt(q.get('vb'), 10) || 2500;
var ab = parseInt(q.get('ab'), 10) || 128;
var accent = /^[0-9a-f]{6}$/i.test(q.get('accent') || '') ? '#' + q.get('accent') : '';
var title = (q.get('title') || '').slice(0, 60);
if (accent) document.documentElement.style.setProperty('--amber', accent);

var box = document.getElementById('player'), msg = document.getElementById('msg');
if (title) { var t = document.getElementById('ttl'); if (t) t.textContent = title; document.title = title + ' · Tonix Lab'; }

if (!room) {
  msg.hidden = false;
  msg.textContent = 'This link is missing its room name. Ask the person who shared it to send the link again.';
} else {
  var f = document.createElement('iframe');
  f.title = title || 'Live stream';
  f.src = TonixVdo.viewUrl(room, { codec: codec, vKbps: vb, aKbps: ab, video: true }, { clean: 'ish' });
  f.allow = 'autoplay; fullscreen; picture-in-picture';
  f.setAttribute('allowfullscreen', '');
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  box.appendChild(f);
  var pl = document.getElementById('plain'); if (pl) pl.href = TonixVdo.plainView(room);
}
})();
