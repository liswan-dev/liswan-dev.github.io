/*
 * github-publish.js — lets the admin panel save straight to the GitHub repo.
 * The site is static (GitHub Pages), so "publish" = commit files through the
 * GitHub Contents API. The admin pastes a fine-grained Personal Access Token
 * (Contents: read & write, this repo only); it is kept in THIS browser's
 * localStorage only — never written into the repo or sent anywhere but api.github.com.
 * Local mode: when the site runs through run.bat (tools/dev-server.py on localhost),
 * edits are also written straight into the project folder, so they show up on the
 * local site immediately — commit & push afterwards to put them live.
 * Without a token or local server, admin pages fall back to "download the JSON and commit by hand".
 */
window.GH = (function () {
  var KEY = 'liswan-gh-settings';
  var DEFAULTS = { owner: 'liswan-dev', repo: 'liswan-dev.github.io', branch: 'main', token: '' };

  function getSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function hasToken() { return !!getSettings().token; }

  // Detect tools/dev-server.py once; LOCAL stays false on the live site.
  var LOCAL = false;
  var readyPromise = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? fetch('/__local/ping', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { LOCAL = !!(j && j.ok); }).catch(function () {})
    : Promise.resolve();
  function ready() { return readyPromise; }
  function isLocal() { return LOCAL; }
  function isReady() { return hasToken() || LOCAL; }

  // UI text for the save bar: where "Publish" will write to.
  function target() {
    var s = getSettings();
    if (hasToken() && LOCAL) return { button: 'Publish', label: 'Lokal + GitHub',
      note: 'Disimpan ke folder proyek <b>dan</b> di-commit ke GitHub. Situs lokal langsung berubah, situs live ±1 menit kemudian.' };
    if (hasToken()) return { button: 'Publish', label: 'GitHub',
      note: 'Di-commit langsung ke GitHub — situs live terupdate ±1 menit kemudian.' };
    if (LOCAL) return { button: 'Simpan', label: 'Mode lokal',
      note: 'Disimpan langsung ke folder proyek — refresh situs lokal untuk melihat hasilnya. Untuk live: commit &amp; push, atau hubungkan GitHub.' };
    var onLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return { button: 'Hubungkan GitHub', label: 'Belum terhubung',
      note: onLocalhost
        ? 'Jalankan situs lewat <b>run.bat</b> agar bisa simpan langsung ke proyek, atau hubungkan GitHub.'
        : 'Klik <b>Hubungkan GitHub</b> dan tempel token GitHub (sekali saja per browser). Setelah itu tombol berubah jadi <b>Publish</b>.' };
  }

  function localSave(path, base64) {
    return fetch('/__local/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path, base64: base64 })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error('Simpan lokal gagal: ' + (j.error || 'HTTP ' + r.status));
        return j;
      });
    });
  }

  function api(path, opts) {
    var s = getSettings();
    opts = opts || {};
    return fetch('https://api.github.com/repos/' + s.owner + '/' + s.repo + path, {
      method: opts.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + s.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 404 && opts.allow404) return null;
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status));
        return json;
      });
    });
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Write one file: into the local project (if running via run.bat) and/or GitHub (one commit).
  function putFile(path, base64, message) {
    var local = LOCAL ? localSave(path, base64) : Promise.resolve();
    if (!hasToken()) return local;
    return local.then(function () { return putGithub(path, base64, message); });
  }
  function putGithub(path, base64, message) {
    var s = getSettings();
    return api('/contents/' + path + '?ref=' + encodeURIComponent(s.branch), { allow404: true })
      .then(function (existing) {
        var body = { message: message, content: base64, branch: s.branch };
        if (existing && existing.sha) body.sha = existing.sha;
        return api('/contents/' + path, { method: 'PUT', body: body });
      });
  }
  function base64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Read a JSON data file from the freshest source: the GitHub branch when a token is set
  // (GitHub Pages can lag ~1 min behind a commit — loading the site copy right after
  // publishing would bring back old content and the next publish would overwrite edits),
  // otherwise the site itself, cache-busted.
  function getJson(path) {
    var fromSite = function () {
      return fetch('/' + path + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    };
    if (!hasToken() || LOCAL) return fromSite();
    var s = getSettings();
    return api('/contents/' + path + '?ref=' + encodeURIComponent(s.branch), { allow404: true })
      .then(function (f) { return f && f.content ? JSON.parse(base64ToUtf8(f.content)) : fromSite(); })
      .catch(fromSite);
  }

  function putJson(path, obj, message) {
    return putFile(path, utf8ToBase64(JSON.stringify(obj, null, 2) + '\n'), message);
  }

  // Resize to max 1920px & re-encode as WebP before committing, so uploads stay light.
  function compressImage(file, maxSize, quality) {
    maxSize = maxSize || 1920; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (/svg/.test(file.type)) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Gagal memproses gambar')); }, 'image/webp', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid')); };
      img.src = url;
    });
  }

  function slugName(name) {
    return String(name || 'gambar').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gambar';
  }

  // Upload an image to /uploads/ and return its public path.
  function uploadImage(blob, originalName) {
    var ext = /svg/.test(blob.type) ? 'svg' : 'webp';
    var path = 'uploads/' + Date.now() + '-' + slugName(originalName) + '.' + ext;
    return blobToBase64(blob).then(function (b64) {
      return putFile(path, b64, 'Upload gambar ' + path + ' via admin');
    }).then(function () { return '/' + path; });
  }

  function testConnection() {
    return api('').then(function (repo) {
      if (repo.permissions && !repo.permissions.push) throw new Error('Token tidak punya izin menulis ke repo ini');
      return repo;
    });
  }

  // Settings modal, shared by every admin page that publishes.
  function openSettings(onSaved) {
    var s = getSettings();
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay open';
    wrap.innerHTML =
      '<div class="modal-box" style="max-width:520px">' +
        '<div class="modal-header"><h3>Koneksi GitHub</h3><button class="modal-close" type="button" data-x>&times;</button></div>' +
        '<div class="modal-body"><div class="form-grid">' +
          '<p class="form-hint" style="margin:0">Buat <b>fine-grained token</b> di GitHub → Settings → Developer settings → Personal access tokens. Repository access: <b>hanya repo ini</b>. Permissions: <b>Contents = Read and write</b>. Token disimpan hanya di browser ini.</p>' +
          '<div class="form-grid cols-2">' +
            '<div class="form-field"><label class="form-label">Owner</label><input class="form-input" data-f="owner"></div>' +
            '<div class="form-field"><label class="form-label">Repo</label><input class="form-input" data-f="repo"></div>' +
          '</div>' +
          '<div class="form-field"><label class="form-label">Branch</label><input class="form-input" data-f="branch"></div>' +
          '<div class="form-field"><label class="form-label">Token</label><input class="form-input" type="password" autocomplete="off" data-f="token" placeholder="github_pat_..."></div>' +
          '<p class="form-hint" data-status style="margin:0"></p>' +
        '</div></div>' +
        '<div class="modal-footer" style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">' +
          '<button class="btn btn-secondary" type="button" data-clear>Hapus Token</button>' +
          '<div style="display:flex;gap:10px"><button class="btn btn-secondary" type="button" data-test>Tes Koneksi</button><button class="btn btn-primary" type="button" data-save>Simpan</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    ['owner', 'repo', 'branch', 'token'].forEach(function (k) { wrap.querySelector('[data-f="' + k + '"]').value = s[k] || ''; });
    var status = wrap.querySelector('[data-status]');
    function read() {
      var n = {};
      ['owner', 'repo', 'branch', 'token'].forEach(function (k) { n[k] = wrap.querySelector('[data-f="' + k + '"]').value.trim(); });
      return n;
    }
    function close() { wrap.remove(); }
    wrap.querySelector('[data-x]').onclick = close;
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('[data-clear]').onclick = function () {
      var n = read(); n.token = ''; saveSettings(n); wrap.querySelector('[data-f="token"]').value = '';
      status.textContent = 'Token dihapus dari browser ini.'; if (onSaved) onSaved();
    };
    wrap.querySelector('[data-test]').onclick = function () {
      saveSettings(read()); status.textContent = 'Menghubungkan…';
      testConnection().then(function (r) { status.textContent = '✓ Terhubung ke ' + r.full_name + ' — siap publish.'; })
        .catch(function (e) { status.textContent = '✕ ' + e.message; });
    };
    wrap.querySelector('[data-save]').onclick = function () {
      saveSettings(read()); close();
      if (window.Dash) Dash.toast(hasToken() ? 'Koneksi GitHub disimpan' : (LOCAL ? 'Token kosong — simpan ke folder proyek saja' : 'Token kosong — mode unduh manual'), 'success');
      if (onSaved) onSaved();
    };
  }

  return {
    getSettings: getSettings, isReady: isReady, hasToken: hasToken, isLocal: isLocal, ready: ready, target: target,
    getJson: getJson, putFile: putFile, putJson: putJson,
    compressImage: compressImage, uploadImage: uploadImage, blobToBase64: blobToBase64,
    testConnection: testConnection, openSettings: openSettings
  };
})();
