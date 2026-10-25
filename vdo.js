/* Tonix Lab <-> VDO.Ninja link builder.
   Tonix Lab does not copy VDO.Ninja's code. It builds links to the VDO.Ninja service
   (https://vdo.ninja, an open source project) and embeds it in an iframe.
   Parameter meanings come from https://docs.vdo.ninja:
     push side:  push, webcam, autostart, cleanoutput, width, height, fps, ovb (outbound bitrate),
                 mvb (max bitrate), stereo, aec / denoise / autogain (0 or 1), videodevice, audiodevice
     view side:  view, cleanoutput, codec, videobitrate (vb), audiobitrate
   Change VDO.Ninja's address here to use a self-hosted copy. */
(function (root) {
'use strict';

var HOST = 'https://vdo.ninja/';
var RES = { '360': [640, 360], '480': [854, 480], '720': [1280, 720], '1080': [1920, 1080] };

function qs(pairs) {
  return pairs.map(function (p) {
    return p.length === 1 ? encodeURIComponent(p[0]) : encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
  }).join('&');
}
function num(v, d) { v = Number(v); return isFinite(v) && v > 0 ? Math.round(v) : d; }
function id(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40); }

/* The page that publishes your camera and mic. S = the Go live settings. */
function pushUrl(room, S, opts) {
  opts = opts || {};
  var p = [['push', id(room)]];
  if (S.video) {
    var wh = RES[S.res] || RES['720'];
    p.push(['webcam']);
    p.push(['width', wh[0]], ['height', wh[1]], ['fps', num(S.fps, 30)]);
    if (opts.camLabel) p.push(['videodevice', opts.camLabel]);
  } else {
    p.push(['videodevice', '0']);
  }
  if (opts.micLabel) p.push(['audiodevice', opts.micLabel]);
  var vb = num(S.vKbps, 2500);
  if (S.video) { p.push(['ovb', vb]); if (S.vMode === 'fixed') p.push(['mvb', vb]); }
  if (S.stereo) p.push(['stereo']);
  p.push(['aec', S.ec ? 1 : 0], ['denoise', S.ns ? 1 : 0], ['autogain', S.agc ? 1 : 0]);
  if (opts.autostart !== false) p.push(['autostart']);
  if (opts.clean !== false) p.push(['cleanoutput']);
  return HOST + '?' + qs(p);
}

/* The page that plays a stream. Used inside watch.html, embed.html and as the OBS source. */
function viewUrl(room, S, opts) {
  opts = opts || {};
  var p = [['view', id(room)]];
  if (opts.clean !== false) p.push(['cleanoutput']);
  var codec = String(S.codec || '').toLowerCase();
  if (['h264', 'vp8', 'vp9', 'av1'].indexOf(codec) >= 0) p.push(['codec', codec]);
  if (S.video !== false) p.push(['videobitrate', num(S.vKbps, 2500)]);
  p.push(['audiobitrate', num(S.aKbps, 128)]);
  return HOST + '?' + qs(p);
}

root.TonixVdo = { HOST: HOST, pushUrl: pushUrl, viewUrl: viewUrl, cleanRoom: id };
})(window);
