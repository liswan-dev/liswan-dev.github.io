/*
 * content-admin.js — powers /admin/content/: a form editor for data/content.json.
 * The site is static (GitHub Pages, no backend). "Publish" commits data/content.json
 * (plus any newly uploaded images) straight to the repo via github-publish.js when a
 * GitHub token is configured; otherwise the admin downloads the JSON and commits by hand.
 */
(function () {
  var ICON_OPTIONS = ['check', 'bolt', 'clock', 'assets', 'workflow', 'dashboard', 'automation', 'drive', 'website'];
  var STATE = null;
  var BLOBS = {};   // pending image uploads: previewUrl -> { blob, name }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function fieldWrap(labelText, inputEl, hint) {
    // "Judul (keterangan)" -> label "Judul" + keterangan as an info popover
    var m = /^(.*?)\s*\((.+)\)\s*$/.exec(labelText || '');
    if (m && m[1]) { labelText = m[1]; hint = hint ? m[2] + '. ' + hint : m[2]; }
    var wrap = h('div', { class: 'form-field' });
    wrap.appendChild(h('label', { class: 'form-label' }, [document.createTextNode(labelText)]));
    wrap.appendChild(inputEl);
    if (hint) wrap.appendChild(h('div', { class: 'form-hint' }, [document.createTextNode(hint)]));
    return wrap;
  }

  function textInput(value, onInput, placeholder) {
    var inp = h('input', { class: 'form-input', type: 'text', value: value || '', placeholder: placeholder || '' });
    inp.addEventListener('input', function () { onInput(inp.value); });
    return inp;
  }

  function textareaInput(value, onInput) {
    var inp = h('textarea', { class: 'form-textarea' });
    inp.value = value || '';
    inp.addEventListener('input', function () { onInput(inp.value); });
    return inp;
  }

  function checkboxField(labelText, checked, onChange) {
    var inp = h('input', { type: 'checkbox' });
    inp.checked = !!checked;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    var label = h('label', { class: 'form-check' }, [inp, document.createTextNode(labelText)]);
    return label;
  }

  function selectField(labelText, value, options, onChange) {
    var sel = h('select', { class: 'form-select' });
    options.forEach(function (opt) {
      var o = h('option', { value: opt }, [document.createTextNode(opt)]);
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    return fieldWrap(labelText, sel);
  }

  function grid2(children) {
    return h('div', { class: 'form-grid cols-2' }, children);
  }

  function card(titleText, children) {
    var c = h('div', { class: 'dash-card', style: 'margin-bottom:18px' });
    if (titleText) c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode(titleText)]));
    var g = h('div', { class: 'form-grid' }, children);
    c.appendChild(g);
    return c;
  }

  function repeaterItem(label, onRemove, fieldsEl) {
    var head = h('div', { class: 'repeater-item-head' }, [
      h('strong', {}, [document.createTextNode(label)]),
      h('button', { type: 'button', class: 'btn-remove' }, [document.createTextNode('✕ Hapus')])
    ]);
    head.querySelector('.btn-remove').addEventListener('click', onRemove);
    return h('div', { class: 'repeater-item' }, [head, fieldsEl]);
  }

  function addButton(label, onClick) {
    var btn = h('button', { type: 'button', class: 'btn-add' }, [document.createTextNode('+ ' + label)]);
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ---------------- image field (preview + upload + path) ----------------
  function imageField(labelText, value, onChange) {
    var wrap = h('div', { class: 'form-field' });
    wrap.appendChild(h('label', { class: 'form-label' }, [document.createTextNode(labelText)]));
    var row = h('div', { style: 'display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start' });
    var img = h('img', { alt: '', style: 'width:120px;height:68px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--surface-tint,rgba(0,0,0,.04))' });
    var right = h('div', { style: 'display:grid;gap:8px' });
    var path = h('input', { class: 'form-input', type: 'text', placeholder: '/projects/gambar.webp — kosongkan jika tidak ada' });
    var file = h('input', { class: 'form-input', type: 'file', accept: 'image/*' });
    function show(v) { if (v) { img.src = v; img.style.visibility = 'visible'; } else img.style.visibility = 'hidden'; }
    path.value = value && value.indexOf('blob:') !== 0 ? value : '';
    show(value);
    path.addEventListener('input', function () { onChange(path.value.trim()); show(path.value.trim()); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      GH.compressImage(f).then(function (blob) {
        var url = URL.createObjectURL(blob);
        BLOBS[url] = { blob: blob, name: f.name };
        path.value = ''; show(url); onChange(url);
        if (window.Dash) Dash.toast('Gambar siap (' + Math.round(blob.size / 1024) + ' KB) — akan diunggah saat publish', 'success');
      }).catch(function (err) { if (window.Dash) Dash.toast(err.message, 'danger'); });
    });
    right.appendChild(file); right.appendChild(path);
    row.appendChild(img); row.appendChild(right);
    wrap.appendChild(row);
    wrap.appendChild(h('div', { class: 'form-hint' }, [document.createTextNode('Unggah file baru (otomatis diperkecil) atau isi path gambar yang sudah ada.')]));
    return wrap;
  }

  // ---------------- chips (list of plain strings) ----------------
  function chipsEditor(list, onChange) {
    var wrap = h('div', { class: 'chips-row' });
    function repaint() {
      wrap.innerHTML = '';
      list.forEach(function (val, i) {
        var inp = h('input', { value: val });
        inp.addEventListener('input', function () { list[i] = inp.value; onChange(); });
        var rm = h('button', { type: 'button' }, [document.createTextNode('✕')]);
        rm.addEventListener('click', function () { list.splice(i, 1); onChange(); repaint(); });
        wrap.appendChild(h('span', { class: 'chip-input' }, [inp, rm]));
      });
      var add = h('button', { type: 'button', class: 'chip-input' }, [document.createTextNode('+ tambah')]);
      add.addEventListener('click', function () { list.push('Baru'); onChange(); repaint(); });
      wrap.appendChild(add);
    }
    repaint();
    return wrap;
  }

  // ==================== HERO ====================
  function renderHero(panel) {
    panel.innerHTML = '';
    var d = STATE.hero;
    panel.appendChild(card('Headline', [
      fieldWrap('Eyebrow (label kecil di atas judul)', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul (pakai <grad>...</grad> untuk beri warna gradient sebagian teks)', textareaInput(d.headline, function (v) { d.headline = v; })),
      fieldWrap('Sub-judul', textareaInput(d.subheadline, function (v) { d.subheadline = v; })),
      imageField('Gambar latar hero', d.image, function (v) { if (v) d.image = v; else delete d.image; }),
      grid2([
        fieldWrap('Label tombol utama', textInput(d.ctaPrimaryLabel, function (v) { d.ctaPrimaryLabel = v; })),
        fieldWrap('Label tombol kedua', textInput(d.ctaSecondaryLabel, function (v) { d.ctaSecondaryLabel = v; }))
      ])
    ]));

    var stackCard = h('div', { class: 'dash-card', style: 'margin-bottom:18px' });
    stackCard.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('Badge Tech Stack')]));
    stackCard.appendChild(chipsEditor(d.stack, function () {}));
    panel.appendChild(stackCard);

    var linesCard = h('div', { class: 'dash-card', style: 'margin-bottom:18px' });
    linesCard.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('Kartu "Terminal" di Hero')]));
    var linesRepeater = h('div', { class: 'repeater' });
    function repaintLines() {
      linesRepeater.innerHTML = '';
      d.card.lines.forEach(function (line, i) {
        var fields = grid2([
          fieldWrap('Label', textInput(line.k, function (v) { line.k = v; })),
          fieldWrap('Nilai', textInput(line.v, function (v) { line.v = v; }))
        ]);
        linesRepeater.appendChild(repeaterItem('Baris ' + (i + 1), function () { d.card.lines.splice(i, 1); repaintLines(); }, fields));
      });
    }
    repaintLines();
    linesCard.appendChild(linesRepeater);
    linesCard.appendChild(addButton('Tambah Baris', function () { d.card.lines.push({ k: 'Label', v: 'Nilai' }); repaintLines(); }));
    linesCard.appendChild(h('div', { style: 'margin-top:14px' }, [
      fieldWrap('Teks badge di bawah kartu', textInput(d.card.badge, function (v) { d.card.badge = v; }))
    ]));
    panel.appendChild(linesCard);
  }

  // ==================== STATS ====================
  function renderStats(panel) {
    panel.innerHTML = '';
    var list = STATE.stats;
    var c = h('div', { class: 'dash-card' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('4 Angka Statistik di Hero')]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      list.forEach(function (s, i) {
        var fields = grid2([
          fieldWrap('Angka (boleh simbol, mis. 6+ / 100% / ∞)', textInput(s.value, function (v) { s.value = v; })),
          fieldWrap('Label', textInput(s.label, function (v) { s.label = v; }))
        ]);
        rep.appendChild(repeaterItem('Stat ' + (i + 1), function () { list.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Statistik', function () { list.push({ value: '0', label: 'Label baru' }); repaint(); }));
    panel.appendChild(c);
  }

  // ==================== ABOUT ====================
  function renderAbout(panel) {
    panel.innerHTML = '';
    var d = STATE.about;
    panel.appendChild(card('Tentang Kami', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul (boleh pakai <grad>...</grad>)', textareaInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; }))
    ]));

    var c = h('div', { class: 'dash-card' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('3 Poin Keunggulan')]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      d.points.forEach(function (p, i) {
        var fields = h('div', { class: 'form-grid' }, [
          selectField('Ikon', p.icon, ICON_OPTIONS, function (v) { p.icon = v; }),
          fieldWrap('Judul', textInput(p.title, function (v) { p.title = v; })),
          fieldWrap('Deskripsi', textareaInput(p.desc, function (v) { p.desc = v; }))
        ]);
        rep.appendChild(repeaterItem('Poin ' + (i + 1), function () { d.points.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Poin', function () { d.points.push({ icon: 'check', title: 'Judul baru', desc: 'Deskripsi singkat.' }); repaint(); }));
    panel.appendChild(c);
  }

  // ==================== SERVICES ====================
  function renderServices(panel) {
    panel.innerHTML = '';
    var d = STATE.services;
    panel.appendChild(card('Judul Section', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul', textInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; }))
    ]));

    var c = h('div', { class: 'dash-card' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('Daftar Layanan')]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      d.items.forEach(function (s, i) {
        var fields = h('div', { class: 'form-grid' }, [
          selectField('Ikon', s.icon, ICON_OPTIONS, function (v) { s.icon = v; }),
          fieldWrap('Judul Layanan', textInput(s.title, function (v) { s.title = v; })),
          fieldWrap('Deskripsi', textareaInput(s.desc, function (v) { s.desc = v; }))
        ]);
        rep.appendChild(repeaterItem('Layanan ' + (i + 1), function () { d.items.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Layanan', function () { d.items.push({ icon: 'website', title: 'Layanan baru', desc: 'Deskripsi singkat.' }); repaint(); }));
    panel.appendChild(c);
  }

  // ==================== PORTFOLIO ====================
  function renderPortfolio(panel) {
    panel.innerHTML = '';
    var d = STATE.portfolio;
    panel.appendChild(card('Judul Section', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul', textInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; }))
    ]));

    var c = h('div', { class: 'dash-card' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('Daftar Portofolio')]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      d.items.forEach(function (p, i) {
        p.chips = p.chips || [];
        var chipsWrap = fieldWrap('Chip / Tag kecil', chipsEditor(p.chips, function () {}));
        var fields = h('div', { class: 'form-grid' }, [
          grid2([
            fieldWrap('Judul Proyek', textInput(p.title, function (v) { p.title = v; })),
            fieldWrap('Tag (pojok kanan)', textInput(p.tag, function (v) { p.tag = v; }))
          ]),
          fieldWrap('Deskripsi', textareaInput(p.desc, function (v) { p.desc = v; })),
          imageField('Gambar proyek', p.image, function (v) { if (v) p.image = v; else delete p.image; }),
          chipsWrap
        ]);
        rep.appendChild(repeaterItem('Proyek ' + (i + 1), function () { d.items.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Proyek', function () { d.items.push({ title: 'Proyek baru', tag: 'Sistem', desc: 'Deskripsi singkat.', chips: [] }); repaint(); }));
    panel.appendChild(c);
  }

  // ==================== PROCESS ====================
  function renderProcess(panel) {
    panel.innerHTML = '';
    var d = STATE.process;
    panel.appendChild(card('Judul Section', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul', textInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; }))
    ]));

    var c = h('div', { class: 'dash-card' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode('Tahapan Proses')]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      d.steps.forEach(function (s, i) {
        var fields = h('div', { class: 'form-grid' }, [
          grid2([
            fieldWrap('Nomor (mis. 01)', textInput(s.num, function (v) { s.num = v; })),
            fieldWrap('Judul Tahap', textInput(s.title, function (v) { s.title = v; }))
          ]),
          fieldWrap('Deskripsi', textareaInput(s.desc, function (v) { s.desc = v; }))
        ]);
        rep.appendChild(repeaterItem('Tahap ' + (i + 1), function () { d.steps.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Tahap', function () {
      var n = String(d.steps.length + 1).padStart(2, '0');
      d.steps.push({ num: n, title: 'Tahap baru', desc: 'Deskripsi singkat.' }); repaint();
    }));
    panel.appendChild(c);
  }

  // ==================== PRICING ====================
  function renderPriceTierGroup(container, tiers, groupLabel) {
    var c = h('div', { class: 'dash-card', style: 'margin-bottom:18px' });
    c.appendChild(h('div', { class: 'dash-section-title' }, [document.createTextNode(groupLabel)]));
    var rep = h('div', { class: 'repeater' });
    function repaint() {
      rep.innerHTML = '';
      tiers.forEach(function (t, i) {
        t.features = t.features || [];
        var fields = h('div', { class: 'form-grid' }, [
          grid2([
            fieldWrap('Nama Paket', textInput(t.name, function (v) { t.name = v; })),
            checkboxField('Tandai sebagai "Paling Populer"', t.featured, function (v) { t.featured = v; })
          ]),
          fieldWrap('Deskripsi Singkat', textInput(t.desc, function (v) { t.desc = v; })),
          grid2([
            fieldWrap('Awalan harga (mis. "Mulai dari", kosongkan jika tidak perlu)', textInput(t.priceFrom, function (v) { t.priceFrom = v; })),
            fieldWrap('Harga (mis. "Rp 2.500.000" atau "Hubungi Kami")', textInput(t.price, function (v) { t.price = v; }))
          ]),
          fieldWrap('Fitur (satu per baris)', chipsEditor(t.features, function () {})),
          grid2([
            fieldWrap('Label tombol', textInput(t.ctaLabel, function (v) { t.ctaLabel = v; })),
            fieldWrap('Subjek email saat tombol diklik', textInput(t.ctaSubject, function (v) { t.ctaSubject = v; }))
          ])
        ]);
        rep.appendChild(repeaterItem(t.name || ('Paket ' + (i + 1)), function () { tiers.splice(i, 1); repaint(); }, fields));
      });
    }
    repaint();
    c.appendChild(rep);
    c.appendChild(addButton('Tambah Paket', function () {
      tiers.push({ name: 'Paket Baru', featured: false, desc: '', priceFrom: 'Mulai dari', price: 'Rp 0', features: [], ctaLabel: 'Konsultasi', ctaSubject: 'Konsultasi' });
      repaint();
    }));
    container.appendChild(c);
  }

  function renderPricing(panel) {
    panel.innerHTML = '';
    var d = STATE.pricing;
    panel.appendChild(card('Judul Section', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul', textInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; })),
      grid2([
        fieldWrap('Label tab "Aplikasi Custom"', textInput(d.tabs.apps, function (v) { d.tabs.apps = v; })),
        fieldWrap('Label tab "Website"', textInput(d.tabs.website, function (v) { d.tabs.website = v; }))
      ])
    ]));
    renderPriceTierGroup(panel, d.apps, 'Paket — Aplikasi Custom');
    renderPriceTierGroup(panel, d.website, 'Paket — Website');
  }

  // ==================== CONTACT ====================
  function renderContact(panel) {
    panel.innerHTML = '';
    var d = STATE.contact;
    panel.appendChild(card('Kontak', [
      fieldWrap('Eyebrow', textInput(d.eyebrow, function (v) { d.eyebrow = v; })),
      fieldWrap('Judul', textInput(d.title, function (v) { d.title = v; })),
      fieldWrap('Deskripsi', textareaInput(d.description, function (v) { d.description = v; })),
      grid2([
        fieldWrap('Email', textInput(d.email, function (v) { d.email = v; })),
        fieldWrap('Catatan respon (mis. "Respon dalam 1×24 jam")', textInput(d.responseNote, function (v) { d.responseNote = v; }))
      ]),
      grid2([
        fieldWrap('URL GitHub', textInput(d.github, function (v) { d.github = v; })),
        fieldWrap('Teks link GitHub', textInput(d.githubLabel, function (v) { d.githubLabel = v; }))
      ])
    ]));
    panel.appendChild(card('Footer', [
      fieldWrap('Teks footer (tahun dan simbol © ditambahkan otomatis)', textInput(STATE.footer.text, function (v) { STATE.footer.text = v; }))
    ]));
  }

  function renderAll() {
    var root = document.getElementById('form-root');
    renderHero(root.querySelector('[data-tab-panel="hero"]'));
    renderStats(root.querySelector('[data-tab-panel="stats"]'));
    renderAbout(root.querySelector('[data-tab-panel="about"]'));
    renderServices(root.querySelector('[data-tab-panel="services"]'));
    renderPortfolio(root.querySelector('[data-tab-panel="portfolio"]'));
    renderProcess(root.querySelector('[data-tab-panel="process"]'));
    renderPricing(root.querySelector('[data-tab-panel="pricing"]'));
    renderContact(root.querySelector('[data-tab-panel="contact"]'));
  }

  function loadContent() {
    return GH.ready().then(function () { renderGh(); return GH.getJson('data/content.json'); })
      .then(function (json) {
        STATE = json;
        renderAll();
      })
      .catch(function (err) {
        if (window.Dash) Dash.toast('Gagal memuat content.json: ' + err.message, 'danger');
      });
  }

  // Walk the state and swap pending blob: image URLs using resolver(url, meta) -> Promise<string>.
  function resolveBlobs(obj, resolver) {
    var jobs = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach(function (k) {
        var v = node[k];
        if (typeof v === 'string' && v.indexOf('blob:') === 0) {
          var meta = BLOBS[v];
          if (!meta) { delete node[k]; return; }
          jobs.push(resolver(v, meta).then(function (finalSrc) { node[k] = finalSrc; }));
        } else walk(v);
      });
    })(obj);
    return Promise.all(jobs).then(function () { return obj; });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.readAsDataURL(blob); });
  }

  function renderGh() {
    var ok = GH.isReady(), t = GH.target();
    document.getElementById('gh-dot').classList.toggle('ok', ok);
    document.getElementById('gh-label').textContent = t.label;
    document.getElementById('btn-publish').textContent = t.button;
    var note = document.getElementById('save-note');
    if (note) note.innerHTML = t.note;
  }

  function publish() {
    if (!GH.isReady()) { GH.openSettings(renderGh); return; }
    var btn = document.getElementById('btn-publish');
    btn.disabled = true; btn.textContent = 'Mengunggah…';
    var out = JSON.parse(JSON.stringify(STATE)), uploaded = {};
    resolveBlobs(out, function (url, meta) {
      return uploaded[url] || (uploaded[url] = GH.uploadImage(meta.blob, meta.name));
    }).then(function (data) {
      btn.textContent = 'Menyimpan…';
      return GH.putJson('data/content.json', data, 'Update konten beranda via admin').then(function () { return data; });
    }).then(function (data) {
      STATE = data; BLOBS = {}; renderAll();
      if (window.Dash) Dash.toast(GH.hasToken() ? 'Terpublish! Beranda live terupdate dalam ±1 menit.' : 'Tersimpan ke data/content.json — refresh beranda untuk melihat hasilnya.', 'success');
    }).catch(function (err) {
      if (window.Dash) Dash.toast('Gagal menyimpan: ' + GH.explain(err.message), 'danger');
    }).then(function () { renderGh(); });
  }

  function downloadJson() {
    var out = JSON.parse(JSON.stringify(STATE));
    resolveBlobs(out, function (url, meta) { return blobToDataUrl(meta.blob); }).then(function (data) { saveFile(data); });
  }

  function saveFile(data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'content.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    if (window.Dash) Dash.toast('content.json diunduh. Timpa file di data/content.json lalu commit & push.', 'success');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var session = Dash.initShell({ role: 'admin' });
    if (!session) return;

    loadContent();
    var closeMore = function () { Dash.closeModal('modal-more'); };
    document.getElementById('btn-more').addEventListener('click', function () { Dash.openModal('modal-more'); });
    document.getElementById('btn-reload').addEventListener('click', function () { closeMore(); loadContent(); });
    document.getElementById('btn-download').addEventListener('click', function () { closeMore(); downloadJson(); });
    document.getElementById('btn-publish').addEventListener('click', publish);
    document.getElementById('btn-gh').addEventListener('click', function () { closeMore(); GH.openSettings(renderGh); });
    renderGh();
  });
})();
