/*
 * pages-admin.js — visual editor at /admin/pages/.
 * Loads a public page in an iframe with ?cms-edit=1 (see page-content.js), collects
 * text/image edits into a working copy of data/pages.json, and publishes it:
 *   - with a GitHub token (github-publish.js): uploads new images to /uploads/ and
 *     commits data/pages.json directly — live after GitHub Pages rebuilds (~1 min);
 *   - without one: downloads pages.json to be committed by hand.
 */
(function () {
  var PAGES = [
    { path: '/services/', label: 'Services / Layanan' },
    { path: '/portfolio/', label: 'Portfolio / Proyek' },
    { path: '/case-studies/', label: 'Case Studies' },
    { path: '/case-studies/smart-master-asset/', label: 'Case Study — Smart Master Asset' },
    { path: '/case-studies/sales-force-automation/', label: 'Case Study — Sales Force Automation' },
    { path: '/case-studies/inventory-management-system/', label: 'Case Study — Inventory Management' },
    { path: '/profile/', label: 'Profile / Tentang' },
    { path: '/stack/', label: 'Stack' },
    { path: '/architecture/', label: 'Architecture' },
    { path: '/log/', label: 'Log' },
    { path: '/contact/', label: 'Contact' },
    { path: '/start-project/', label: 'Start Project' }
  ];

  var BASE = {};      // pages.json as published
  var WORK = {};      // working copy (what the editor shows)
  var BLOBS = {};     // pending uploads: previewUrl -> { blob, name }
  var current = PAGES[0].path;
  var frame, frameLang = 'en', pendingImage = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.Dash ? Dash.escapeHtml(String(s == null ? '' : s)) : String(s); }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function toast(m, t) { if (window.Dash) Dash.toast(m, t || 'success'); }
  function pageLabel(path) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].path === path) return PAGES[i].label; return path; }

  function changeList() {
    var out = [];
    Object.keys(WORK).forEach(function (path) {
      var w = WORK[path] || {}, b = BASE[path] || {};
      Object.keys(w).forEach(function (k) { if (JSON.stringify(w[k]) !== JSON.stringify(b[k])) out.push({ path: path, key: k, ov: w[k], removed: false }); });
      Object.keys(b).forEach(function (k) { if (!w[k]) out.push({ path: path, key: k, ov: b[k], removed: true }); });
    });
    return out;
  }

  function post(msg) {
    msg.source = 'cms-admin';
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, location.origin);
  }
  function pushToFrame() { post({ type: 'apply', overrides: WORK[current] || {} }); }

  function renderChanges() {
    var list = changeList();
    $('pe-total').textContent = list.length;
    var el = $('pe-changes');
    if (!list.length) { el.innerHTML = '<div class="pe-empty">Belum ada perubahan.</div>'; return; }
    el.innerHTML = list.map(function (c, i) {
      var ov = c.ov, body;
      if (c.removed) body = '<div class="o">' + esc(ov.en || ov.text || ov.src || '') + '</div><div class="v">↺ dikembalikan ke teks asli</div>';
      else if (ov.src !== undefined) body = '<img src="' + esc(ov.src) + '" alt=""><div class="o">' + esc(ov.orig) + '</div>';
      else if (ov.text !== undefined) body = '<div class="o">' + esc(ov.orig) + '</div><div class="v">' + esc(ov.text) + '</div>';
      else body = (ov.en != null ? '<div class="v"><b>EN:</b> ' + esc(ov.en) + '</div>' : '') + (ov.id != null ? '<div class="v"><b>ID:</b> ' + esc(ov.id) + '</div>' : '') + '<div class="o">' + esc(ov.orig) + '</div>';
      return '<div class="pe-change"><div class="pe-change-top"><span>' + esc(pageLabel(c.path)) + '</span>' +
        '<button type="button" class="btn-mini" data-undo="' + i + '">Batalkan</button></div>' + body + '</div>';
    }).join('');
    el.querySelectorAll('[data-undo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = list[+btn.getAttribute('data-undo')];
        WORK[c.path] = WORK[c.path] || {};
        if (BASE[c.path] && BASE[c.path][c.key]) WORK[c.path][c.key] = clone(BASE[c.path][c.key]);
        else delete WORK[c.path][c.key];
        afterChange();
      });
    });
  }

  function renderGh() {
    var ok = GH.isReady(), t = GH.target();
    $('pe-gh-dot').classList.toggle('ok', ok);
    $('pe-gh-label').textContent = t.label;
    $('pe-publish').textContent = t.button;
    $('pe-save-note').innerHTML = t.note;
  }

  function afterChange() {
    Object.keys(WORK).forEach(function (p) { if (WORK[p] && !Object.keys(WORK[p]).length && !BASE[p]) delete WORK[p]; });
    renderChanges(); pushToFrame();
  }

  function loadFrame() {
    $('pe-path').textContent = current;
    $('pe-open').href = current;
    $('pe-count').textContent = 'memuat…';
    $('pe-lang').hidden = true;
    frame.src = current + '?cms-edit=1&t=' + Date.now();
  }

  // --------------------------------------------------------------- messages from the page
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.source !== 'cms-frame') return;
    var d = e.data;
    if (d.type === 'ready') {
      $('pe-count').textContent = '· ' + d.count + ' elemen bisa diedit';
      $('pe-lang').hidden = !d.hasLang;
      // keep the language the admin picked when switching pages
      if (d.hasLang && d.lang !== frameLang) post({ type: 'lang', lang: frameLang });
      else frameLang = d.lang;
      syncLangButtons();
      pushToFrame();
    }
    if (d.type === 'lang') { frameLang = d.lang; syncLangButtons(); }
    if (d.type === 'edit') onEdit(d);
    if (d.type === 'pick-image') openImage(d);
  });

  function onEdit(d) {
    var page = WORK[d.path] = WORK[d.path] || {};
    var ov = page[d.key] ? clone(page[d.key]) : { orig: d.orig };
    ov.orig = d.orig;
    if (d.kind === 'bi') {
      ov[d.field] = d.value;
      var origField = d.field === 'id' ? d.origId : d.orig;
      if (d.value === origField) delete ov[d.field];
      if (ov.en == null && ov.id == null) { delete page[d.key]; afterChange(); return; }
    } else {
      if (d.value === d.orig) { delete page[d.key]; afterChange(); return; }
      ov.text = d.value;
    }
    page[d.key] = ov;
    afterChange();
  }

  // --------------------------------------------------------------- image modal
  function openImage(d) {
    pendingImage = { path: d.path, key: d.key, orig: d.orig, src: d.current, alt: d.alt, blob: null };
    $('img-preview').src = d.current;
    $('img-path').value = d.current && d.current.indexOf('blob:') !== 0 && d.current.indexOf('data:') !== 0 ? d.current : '';
    $('img-alt').value = d.alt || '';
    $('img-file').value = '';
    Dash.openModal('modal-image');
  }

  function bindImageModal() {
    $('img-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      GH.compressImage(f).then(function (blob) {
        var url = URL.createObjectURL(blob);
        BLOBS[url] = { blob: blob, name: f.name };
        pendingImage.src = url; pendingImage.blob = blob;
        $('img-preview').src = url; $('img-path').value = '';
        toast('Gambar siap (' + Math.round(blob.size / 1024) + ' KB) — klik Terapkan');
      }).catch(function (err) { toast(err.message, 'danger'); });
    });
    $('img-path').addEventListener('input', function () {
      if (this.value.trim()) { pendingImage.src = this.value.trim(); $('img-preview').src = pendingImage.src; }
    });
    $('img-apply').addEventListener('click', function () {
      if (!pendingImage) return;
      var page = WORK[pendingImage.path] = WORK[pendingImage.path] || {};
      var alt = $('img-alt').value;
      if (pendingImage.src === pendingImage.orig && !alt) delete page[pendingImage.key];
      else page[pendingImage.key] = { orig: pendingImage.orig, src: pendingImage.src, alt: alt };
      Dash.closeModal('modal-image'); afterChange();
    });
    $('img-reset').addEventListener('click', function () {
      if (!pendingImage) return;
      if (WORK[pendingImage.path]) delete WORK[pendingImage.path][pendingImage.key];
      Dash.closeModal('modal-image'); afterChange();
    });
  }

  // --------------------------------------------------------------- language
  function syncLangButtons() {
    document.querySelectorAll('#pe-lang button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === frameLang); });
  }

  // --------------------------------------------------------------- publish / download
  function blobToDataUrl(blob) {
    return new Promise(function (resolve) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.readAsDataURL(blob); });
  }

  // Replace pending blob: URLs using `resolver(url, meta) -> Promise<string>`.
  function resolveBlobs(obj, resolver) {
    var jobs = [];
    Object.keys(obj).forEach(function (path) {
      Object.keys(obj[path]).forEach(function (k) {
        var ov = obj[path][k];
        if (ov.src && ov.src.indexOf('blob:') === 0) {
          var meta = BLOBS[ov.src];
          if (!meta) { delete obj[path][k]; return; }
          jobs.push(resolver(ov.src, meta).then(function (finalSrc) { ov.src = finalSrc; }));
        }
      });
      if (!Object.keys(obj[path]).length) delete obj[path];
    });
    return Promise.all(jobs).then(function () { return obj; });
  }

  function download() {
    var out = clone(WORK);
    resolveBlobs(out, function (url, meta) { return blobToDataUrl(meta.blob); }).then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'pages.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast('pages.json diunduh — timpa data/pages.json lalu commit & push.');
    });
  }

  function publish() {
    if (!GH.isReady()) { GH.openSettings(renderGh); return; }
    if (!changeList().length) { toast('Tidak ada perubahan untuk disimpan', 'warning'); return; }
    var btn = $('pe-publish');
    btn.disabled = true; btn.textContent = 'Mengunggah…';
    var out = clone(WORK), uploaded = {};
    resolveBlobs(out, function (url, meta) {
      if (uploaded[url]) return uploaded[url];
      return (uploaded[url] = GH.uploadImage(meta.blob, meta.name));
    }).then(function (data) {
      btn.textContent = 'Menyimpan…';
      return GH.putJson('data/pages.json', data, 'Update konten halaman via admin').then(function () { return data; });
    }).then(function (data) {
      BASE = clone(data); WORK = clone(data); BLOBS = {};
      afterChange();
      toast(GH.hasToken() ? 'Terpublish! Situs live terupdate dalam ±1 menit.' : 'Tersimpan ke data/pages.json — refresh halaman untuk melihat hasilnya.');
    }).catch(function (err) {
      toast('Gagal menyimpan: ' + GH.explain(err.message), 'danger');
    }).then(function () { renderGh(); });
  }

  // --------------------------------------------------------------- init
  document.addEventListener('DOMContentLoaded', function () {
    var session = Dash.initShell({ role: 'admin' });
    if (!session) return;
    frame = $('pe-frame');

    var sel = $('pe-page');
    sel.innerHTML = PAGES.map(function (p) { return '<option value="' + p.path + '">' + esc(p.label) + '  —  ' + p.path + '</option>'; }).join('');
    sel.addEventListener('change', function () { current = sel.value; loadFrame(); });

    document.querySelectorAll('#pe-lang button').forEach(function (b) {
      b.addEventListener('click', function () { frameLang = b.getAttribute('data-lang'); syncLangButtons(); post({ type: 'lang', lang: frameLang }); });
    });
    $('pe-more').addEventListener('click', function () { Dash.openModal('modal-more'); });
    $('pe-changes-btn').addEventListener('click', function () { Dash.openModal('modal-changes'); });
    $('pe-gh-btn').addEventListener('click', function () { Dash.closeModal('modal-more'); GH.openSettings(renderGh); });
    $('pe-publish').addEventListener('click', publish);
    $('pe-download').addEventListener('click', function () { Dash.closeModal('modal-more'); download(); });
    $('pe-discard').addEventListener('click', function () {
      Dash.closeModal('modal-more');
      if (!changeList().length) return;
      if (!confirm('Buang semua perubahan yang belum disimpan?')) return;
      WORK = clone(BASE); BLOBS = {}; afterChange();
    });
    window.addEventListener('beforeunload', function (e) { if (changeList().length) { e.preventDefault(); e.returnValue = ''; } });
    bindImageModal();
    renderGh();

    GH.ready()
      .then(function () { renderGh(); return GH.getJson('data/pages.json'); })
      .catch(function () { return {}; })
      .then(function (json) { BASE = json || {}; WORK = clone(BASE); renderChanges(); loadFrame(); });
  });
})();
