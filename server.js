/* Tonix Lab: talk to the vocal-remover server running in Docker (see the server folder). */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var file = null, busy = false, urls = [];
var KEY = 'tonix.srv.url';
try { var sv = localStorage.getItem(KEY); if (sv) $('#srvUrl').value = sv; } catch (e) {}
function base() { return $('#srvUrl').value.trim().replace(/\/+$/, ''); }
function msg(t) { $('#srvMsg').textContent = t || ''; }
function err(t) { var e = $('#srvErr'); e.hidden = !t; e.textContent = t || ''; }
function bar(p) { $('#srvBar').style.width = Math.max(0, Math.min(100, p)) + '%'; }
function state(t) { $('#srvState').textContent = t; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function netHelp(e) {
  return 'Could not reach the server at ' + base() + '. Check that Docker is running (open ' + base() + '/health in a new tab and look for {"ok":true}). If Chrome asks to allow access to devices on your network, choose Allow. (' + ((e && e.message) || e) + ')';
}
function check() {
  err(''); state('Checking');
  try { localStorage.setItem(KEY, base()); } catch (e) {}
  return fetch(base() + '/health').then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
    .then(function (j) { state('Ready'); msg('Server is running' + (j.stub ? ' (test mode)' : '') + '.'); return true; })
    .catch(function (e) { state('Not found'); msg(''); err(netHelp(e)); return false; });
}
function load(f) {
  if (!f) return; file = f; $('#srvName').textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)'; $('#srvGo').disabled = false; $('#srvOut').hidden = true; err('');
}
function dl(u, n) { var a = document.createElement('a'); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); }
function fetchBlob(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('download failed (' + r.status + ')'); return r.blob(); }); }
function run() {
  if (busy || !file) return; busy = true; err(''); $('#srvGo').disabled = true; $('#srvOut').hidden = true; bar(3); state('Working'); msg('Sending the song to your server...');
  try { localStorage.setItem(KEY, base()); } catch (e) {}
  var fd = new FormData(), id, name = file.name.replace(/\.[^.]+$/, '') || 'song';
  fd.append('file', file, file.name);
  fetch(base() + '/separate', { method: 'POST', body: fd }).then(function (r) {
    if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.detail || ('server said ' + r.status)); });
    return r.json();
  }).then(function (j) {
    id = j.id; var t0 = Date.now();
    function poll() {
      return fetch(base() + '/job/' + id).then(function (r) { if (!r.ok) throw new Error('job lost (' + r.status + ')'); return r.json(); }).then(function (s) {
        if (s.status === 'error') throw new Error(s.message);
        if (s.status === 'done') return;
        msg(s.message + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)'); bar(Math.min(92, 8 + (Date.now() - t0) / 3000));
        return sleep(1500).then(poll);
      });
    }
    return poll();
  }).then(function () {
    msg('Getting your files...'); bar(95);
    return Promise.all([fetchBlob(base() + '/file/' + id + '/music'), fetchBlob(base() + '/file/' + id + '/vocals')]);
  }).then(function (b) {
    urls.forEach(function (u) { URL.revokeObjectURL(u); }); var iu = URL.createObjectURL(b[0]), vu = URL.createObjectURL(b[1]); urls = [iu, vu];
    $('#srvInst').src = iu; $('#srvVoc').src = vu;
    $('#srvDlInst').onclick = function () { dl(iu, name + ' (music, no vocals).wav'); }; $('#srvDlVoc').onclick = function () { dl(vu, name + ' (vocals).wav'); };
    $('#srvOut').hidden = false; bar(100); msg('Done.'); state('Done');
  }).catch(function (e) {
    state('Ready'); msg(''); bar(0);
    var m = (e && e.message) || String(e);
    err(/Failed to fetch|NetworkError|Load failed/i.test(m) ? netHelp(e) : 'The server reported a problem: ' + m);
  }).then(function () { busy = false; $('#srvGo').disabled = !file; });
}
$('#srvCheck').addEventListener('click', check);
$('#srvFile').addEventListener('change', function () { load(this.files[0]); });
var drop = $('#srvDrop');
['dragenter', 'dragover'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('over'); }); });
drop.addEventListener('drop', function (ev) { var f = ev.dataTransfer && ev.dataTransfer.files[0]; if (f) load(f); });
$('#srvGo').addEventListener('click', run);
})();
