/*
 * INV — shared helpers for the admin invoice module (/admin/invoices/*):
 * invoice settings, status rules, totals, auto numbering and the printable invoice.
 * Load after data-layer.js and dashboard.js.
 *
 * Invoice settings (issuer, bank account, defaults) are kept in this browser's
 * localStorage — they only appear on printed invoices, never in the public repo.
 */
window.INV = (function () {
  var SETTINGS_KEY = 'liswan-invoice-settings';
  var DEFAULTS = {
    issuer_name: 'Liswan Susanto — liswan.dev',
    issuer_email: 'hello@liswan.dev',
    issuer_phone: '',
    issuer_address: '',
    issuer_npwp: '',
    bank_name: '',
    bank_account: '',
    bank_holder: '',
    prefix: 'INV',
    due_days: 14,
    tax_percent: 0,
    footer_note: 'Terima kasih atas kepercayaan Anda.',
    payment_methods: 'Transfer Bank, QRIS, Tunai'
  };

  function getSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  var STATUS = {
    unpaid: { label: 'Belum dibayar', pill: 'status-neutral' },
    partial: { label: 'Dibayar sebagian', pill: 'status-warning' },
    paid: { label: 'Lunas', pill: 'status-success' },
    overdue: { label: 'Jatuh tempo', pill: 'status-danger' }
  };

  function today() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + (Number(n) || 0)); return d.toISOString().slice(0, 10); }

  function balance(inv) { return Math.max(0, (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)); }

  // Stored status is unpaid/partial/paid; "overdue" is derived from the due date.
  function statusOf(inv) {
    if (inv.status === 'paid' || balance(inv) === 0 && Number(inv.total_amount) > 0) return 'paid';
    if (inv.due_date && inv.due_date < today()) return 'overdue';
    return inv.status === 'partial' ? 'partial' : 'unpaid';
  }
  function pill(inv) {
    var s = STATUS[statusOf(inv)];
    return '<span class="status-pill ' + s.pill + '">' + s.label + '</span>';
  }

  function totals(items, taxPercent, discount) {
    var subtotal = (items || []).reduce(function (s, it) { return s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0); }, 0);
    var disc = Math.min(subtotal, Number(discount) || 0);
    var tax = Math.round((subtotal - disc) * (Number(taxPercent) || 0) / 100);
    return { subtotal: subtotal, discount: disc, tax: tax, total: subtotal - disc + tax };
  }

  // PREFIX-YYYY-### continuing from the highest number used this year.
  function nextNumber(invoices) {
    var prefix = getSettings().prefix || 'INV', year = new Date().getFullYear();
    var re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-' + year + '-(\\d+)$');
    var max = 0;
    (invoices || []).forEach(function (i) { var m = re.exec(i.invoice_number || ''); if (m) max = Math.max(max, +m[1]); });
    return prefix + '-' + year + '-' + String(max + 1).padStart(3, '0');
  }

  // invoices + projects + clients, joined for display
  async function loadAll() {
    var res = await Promise.all([DB.listAllInvoices(), DB.listAllProjects(), DB.listClients()]);
    var projects = res[1], clients = res[2];
    var invoices = res[0].map(function (inv) {
      var p = projects.find(function (x) { return x.id === inv.project_id; }) || null;
      var c = p ? clients.find(function (x) { return x.id === p.client_id; }) || null : null;
      return Object.assign({}, inv, { _project: p, _client: c });
    });
    return { invoices: invoices, projects: projects, clients: clients };
  }

  function waLink(inv) {
    var c = inv._client;
    var num = c && c.whatsapp ? String(c.whatsapp).replace(/[^\d]/g, '').replace(/^0/, '62') : '';
    var text = 'Halo ' + (c && c.contact_person ? c.contact_person : '') + ', berikut tagihan ' + inv.invoice_number +
      ' sebesar ' + Dash.formatCurrency(balance(inv)) + (inv.due_date ? ' dengan jatuh tempo ' + Dash.formatDate(inv.due_date) : '') + '. Terima kasih.';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }

  // Printable invoice in a new window — the browser's print dialog can "Save as PDF".
  function print(inv, items, payments) {
    var s = getSettings(), esc = Dash.escapeHtml, cur = Dash.formatCurrency, p = inv._project, c = inv._client;
    items = items && items.length ? items : [{ description: p ? p.name : 'Jasa pengembangan sistem', qty: 1, unit_price: inv.total_amount }];
    var t = totals(items, inv.tax_percent, inv.discount_amount);
    var rows = items.map(function (it, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.description) + '</td><td class="r">' + it.qty + '</td><td class="r">' + cur(it.unit_price) + '</td><td class="r">' + cur((Number(it.qty) || 0) * (Number(it.unit_price) || 0)) + '</td></tr>';
    }).join('');
    var payRows = (payments || []).map(function (py) {
      return '<div><span>' + Dash.formatDate(py.paid_at) + ' · ' + esc(py.method || '-') + '</span><span>' + cur(py.amount) + '</span></div>';
    }).join('');
    var bank = s.bank_name || s.bank_account
      ? '<div class="box"><h4>Pembayaran ke</h4><strong>' + esc(s.bank_name) + ' ' + esc(s.bank_account) + '</strong><br>a.n. ' + esc(s.bank_holder) + '</div>' : '';
    var w = window.open('', '_blank');
    if (!w) { Dash.toast('Pop-up diblokir browser — izinkan pop-up untuk mencetak', 'danger'); return; }
    w.document.write('<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>' + esc(inv.invoice_number) + '</title><style>' +
      '*{box-sizing:border-box} body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:40px;font-size:13px}' +
      '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #032E66;padding-bottom:18px}' +
      '.top img{height:54px} h1{margin:0;font-size:30px;letter-spacing:.04em;color:#032E66}' +
      '.meta{text-align:right;line-height:1.7} .meta b{display:inline-block;min-width:90px;color:#555;font-weight:600}' +
      '.to{margin:26px 0;display:flex;justify-content:space-between;gap:20px;line-height:1.6} h4{margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#777;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse;margin-top:10px} th{background:#032E66;color:#fff;text-align:left;padding:10px;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase}' +
      'td{padding:10px;border-bottom:1px solid #e5e5e5} .r{text-align:right}' +
      '.bottom{display:flex;justify-content:space-between;gap:30px;margin-top:18px;align-items:flex-start}' +
      '.sum{width:320px} .sum div{display:flex;justify-content:space-between;padding:6px 0} .sum .t{border-top:2px solid #032E66;font-size:16px;font-weight:700;margin-top:4px;padding-top:10px}' +
      '.box{border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;line-height:1.6;margin-bottom:10px} .pays div{display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#444}' +
      '.notes{white-space:pre-wrap;color:#444;line-height:1.6}' +
      '.foot{margin-top:50px;color:#666;font-size:11.5px;border-top:1px solid #e5e5e5;padding-top:14px;display:flex;justify-content:space-between}' +
      '@media print{body{padding:18mm} .noprint{display:none}}' +
      '</style></head><body>' +
      '<div class="top"><div><img src="' + location.origin + '/assets/img/liswan-logo.svg" alt="liswan.dev"></div>' +
      '<div class="meta"><h1>INVOICE</h1><div><b>No.</b> ' + esc(inv.invoice_number) + '</div><div><b>Tanggal</b> ' + Dash.formatDate(inv.issue_date || inv.created_at) + '</div>' +
      '<div><b>Jatuh tempo</b> ' + Dash.formatDate(inv.due_date) + '</div><div><b>Status</b> ' + STATUS[statusOf(inv)].label + '</div></div></div>' +
      '<div class="to"><div><h4>Ditagihkan kepada</h4><strong>' + esc(c ? c.company_name : '-') + '</strong><br>' +
      (c && c.contact_person ? esc(c.contact_person) + '<br>' : '') + (c && c.address ? esc(c.address) + '<br>' : '') + (c && c.email ? esc(c.email) : '') +
      (p ? '<br><span style="color:#777">Proyek: ' + esc(p.name) + '</span>' : '') + '</div>' +
      '<div style="text-align:right"><h4>Dari</h4><strong>' + esc(s.issuer_name) + '</strong><br>' + [s.issuer_address, s.issuer_email, s.issuer_phone, s.issuer_npwp ? 'NPWP ' + s.issuer_npwp : ''].filter(Boolean).map(esc).join('<br>') + '</div></div>' +
      '<table><thead><tr><th>#</th><th>Deskripsi</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="bottom"><div style="flex:1">' + bank + (payRows ? '<div class="box pays"><h4>Riwayat pembayaran</h4>' + payRows + '</div>' : '') +
      (inv.notes ? '<h4 style="margin-top:12px">Catatan</h4><div class="notes">' + esc(inv.notes) + '</div>' : '') + '</div>' +
      '<div class="sum"><div><span>Subtotal</span><span>' + cur(t.subtotal) + '</span></div>' +
      (t.discount ? '<div><span>Diskon</span><span>− ' + cur(t.discount) + '</span></div>' : '') +
      (Number(inv.tax_percent) ? '<div><span>Pajak (' + inv.tax_percent + '%)</span><span>' + cur(t.tax) + '</span></div>' : '') +
      '<div><span><b>Total</b></span><span><b>' + cur(inv.total_amount) + '</b></span></div>' +
      '<div><span>Dibayar</span><span>' + cur(inv.paid_amount) + '</span></div>' +
      '<div class="t"><span>Sisa tagihan</span><span>' + cur(balance(inv)) + '</span></div></div></div>' +
      '<div class="foot"><span>' + esc(s.footer_note) + '</span><span>liswan.dev · IT Support &amp; Software Developer</span></div>' +
      '<p class="noprint" style="margin-top:30px;text-align:center"><button onclick="print()" style="padding:10px 22px;font-size:14px;cursor:pointer">Cetak / Simpan PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){print()},300)}<\/script></body></html>');
    w.document.close();
  }

  return {
    getSettings: getSettings, saveSettings: saveSettings, STATUS: STATUS, statusOf: statusOf, pill: pill,
    balance: balance, totals: totals, nextNumber: nextNumber, loadAll: loadAll, print: print, waLink: waLink,
    today: today, addDays: addDays
  };
})();
