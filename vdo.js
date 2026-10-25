/* Tonix Lab <-> VDO.Ninja link builder.
   Tonix Lab does not copy VDO.Ninja's code. It builds links to the VDO.Ninja service
   (https://vdo.ninja, an open source project) and embeds it in an iframe.
   Parameter meanings come from https://docs.vdo.ninja:
     push side:  push, webcam, autostart, cleanoutput, width, height, fps, ovb (outbound bitrate),
                 mvb (max bitrate), stereo, aec / denoise / autogain (0 or 1), videodevice, audiodevice
     view side:  view, cleanoutput / cleanish, codec, videobitrate (vb), audiobitrate
   The VDO.Ninja files live in the vdo/ folder of this site (self-hosted, AGPL-3.0, see vdo/README-TONIX.md).
   To use the public service instead, set HOST to 'https://vdo.ninja/'. */
(function (root) {
'use strict';

var HOST = (function () { try { return new URL('vdo/', document.baseURI).href; } catch (e) { return 'https://vdo.ninja/'; } })();
var RES = { '360': [640, 360], '480': [854, 480], '720': [1280, 720], '1080': [1920, 1080] };

function qs(pairs) {
  return pairs.map(function (p) {
    return p.length === 1 ? encodeURIComponent(p[0]) : encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
  }).join('&');
}
function num(v, d) { v = Number(v); return isFinite(v) && v > 0 ? Math.round(v) : d; }
/* Letters and numbers only. VDO.Ninja rewrites other characters in stream IDs, and the camera side and the
   viewer side must end up with exactly the same ID, so we never send anything it would rewrite. */
function id(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }

/* The page that publishes your camera and mic. S = the Go live settings. */
function pushUrl(room, S, opts) {
  opts = opts || {};
  var p = [['push', id(room)]];
  if (S.video) {
    var wh = RES[S.res] || RES['720'];
    p.push(['webcam']);
    /* maxframerate asks for "up to this many"; plain fps demands exactly that many and fails on cameras that cannot. */
    p.push(['width', wh[0]], ['height', wh[1]], ['maxframerate', num(S.fps, 30)]);
    if (opts.camLabel) p.push(['videodevice', opts.camLabel]);
  } else {
    p.push(['videodevice', '0']);
  }
  if (opts.micLabel) p.push(['audiodevice', opts.micLabel]);
  var vb = num(S.vKbps, 2500);
  if (S.video) { p.push(['ovb', vb]); if (S.vMode === 'fixed') p.push(['mvb', vb]); }
  if (S.stereo) p.push(['stereo']);
  p.push(['aec', S.ec ? 1 : 0], ['denoise', S.ns ? 1 : 0], ['autogain', S.agc ? 1 : 0]);
  /* nomirror stops VDO.Ninja mirroring a front camera on its own, so the live box matches the plain preview.
     Mirror and flip choices are applied by Tonix Lab itself, on the frame, because VDO.Ninja's own options are not consistent across cameras. */
  p.push(['nomirror']);
  if (opts.autostart !== false) p.push(['autostart']);
  if (opts.clean !== false) p.push(['cleanoutput']);
  return HOST + '?' + qs(p);
}

/* The page that plays a stream. Used inside watch.html, embed.html and as the OBS source. */
function viewUrl(room, S, opts) {
  opts = opts || {};
  var p = [['view', id(room)]];
  /* Web pages use cleanish: it keeps VDO.Ninja's tap-to-play button, which browsers need before they allow sound.
     OBS and Streamlabs have no such rule, so their link keeps the fully clean cleanoutput. */
  if (opts.clean === 'ish') p.push(['cleanish']);
  else if (opts.clean !== false) p.push(['cleanoutput']);
  var codec = String(S.codec || '').toLowerCase();
  if (['h264', 'vp8', 'vp9', 'av1'].indexOf(codec) >= 0) p.push(['codec', codec]);
  if (S.video !== false) p.push(['videobitrate', num(S.vKbps, 2500)]);
  p.push(['audiobitrate', num(S.aKbps, 128)]);
  return HOST + '?' + qs(p);
}

/* Plain link with no extra options: the first thing to try when a stream will not show. */
function plainView(room) { return HOST + '?view=' + encodeURIComponent(id(room)); }

root.TonixVdo = { plainView: plainView, HOST: HOST, pushUrl: pushUrl, viewUrl: viewUrl, cleanRoom: id };
})(window);
