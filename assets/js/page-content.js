/*
 * page-content.js — applies admin edits (data/pages.json) to any public page,
 * and powers the visual editor at /admin/pages/ (loaded in an iframe with ?cms-edit=1).
 *
 * Every text "leaf" (an element holding only text) and every <img> gets a key from its
 * position in the DOM. An edit is stored as { orig, en, id } / { orig, text } / { orig, src },
 * and is only applied while the element still has its original text/src (`orig`) — so if the
 * HTML is later rewritten by hand, stale edits are skipped instead of landing on the wrong spot.
 * Bilingual elements (data-id="…Indonesian…", English as default text) keep both languages
 * in sync with the ID/EN toggle in main.js.
 */
(function () {
  var PATH = (location.pathname.replace(/index\.html$/, '') || '/').replace(/([^/])$/, '$1/');
  var EDIT = /[?&]cms-edit=1/.test(location.search) && window.parent !== window;
  var SKIP = 'script,style,noscript,svg,template,iframe,input,textarea,select,option,#theme-toggle,#lang-toggle,[data-cms-skip]';
  var TEXT_TAGS = /^(H[1-6]|P|LI|A|BUTTON|SPAN|DIV|TD|TH|LABEL|SMALL|STRONG|EM|B|I|CODE|FIGCAPTION|BLOCKQUOTE|DT|DD|SUMMARY)$/;

  function isTextLeaf(el) {
    if (!TEXT_TAGS.test(el.tagName) || el.closest(SKIP)) return false;
    var hasText = false;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.tagName !== 'BR') return false;
      if (n.nodeType === 3 && n.nodeValue.trim()) hasText = true;
    }
    return hasText;
  }

  function keyOf(el) {
    var parts = [];
    while (el && el !== document.body) {
      var i = 0, s = el;
      while ((s = s.previousElementSibling)) i++;
      parts.unshift(el.tagName.toLowerCase() + i);
      el = el.parentElement;
    }
    return parts.join('.');
  }

  function lang() { return document.documentElement.getAttribute('lang') === 'id' ? 'id' : 'en'; }

  // Snapshot original content once, before anything else rewrites the DOM.
  var ITEMS = [];
  function collect() {
    ITEMS = [];
    document.body.querySelectorAll('*').forEach(function (el) {
      if (el.tagName === 'IMG') {
        if (el.closest(SKIP)) return;
        if (el.dataset.cmsOrig === undefined) el.dataset.cmsOrig = el.getAttribute('src') || '';
        ITEMS.push({ el: el, type: 'img', key: keyOf(el) });
      } else if (isTextLeaf(el)) {
        if (el.dataset.cmsOrig === undefined) {
          el.dataset.cmsOrig = el.dataset.enCache !== undefined ? el.dataset.enCache : el.textContent.trim();
          if (el.hasAttribute('data-id')) el.dataset.cmsOrigId = el.getAttribute('data-id');
        }
        ITEMS.push({ el: el, type: el.hasAttribute('data-id') ? 'bi' : 'text', key: keyOf(el) });
      }
    });
  }

  function applyItem(it, ov) {
    var el = it.el;
    if (!ov || ov.orig !== el.dataset.cmsOrig) {
      // restore original (used by the editor when a change is discarded)
      if (el.dataset.cmsApplied) {
        if (it.type === 'img') el.setAttribute('src', el.dataset.cmsOrig);
        else if (it.type === 'bi') {
          el.setAttribute('data-id', el.dataset.cmsOrigId);
          el.dataset.enCache = el.dataset.cmsOrig;
          el.textContent = lang() === 'id' ? el.dataset.cmsOrigId : el.dataset.cmsOrig;
        } else el.textContent = el.dataset.cmsOrig;
        delete el.dataset.cmsApplied;
      }
      return;
    }
    if (it.type === 'img') { if (ov.src) el.setAttribute('src', ov.src); if (ov.alt != null) el.setAttribute('alt', ov.alt); }
    else if (it.type === 'bi') {
      var en = ov.en != null ? ov.en : el.dataset.cmsOrig;
      var id = ov.id != null ? ov.id : el.dataset.cmsOrigId;
      el.setAttribute('data-id', id);
      el.dataset.enCache = en;
      el.textContent = lang() === 'id' ? id : en;
    } else if (ov.text != null) el.textContent = ov.text;
    el.dataset.cmsApplied = '1';
  }

  var CURRENT = {};
  function applyAll(map) {
    CURRENT = map || {};
    ITEMS.forEach(function (it) { applyItem(it, CURRENT[it.key]); });
  }

  collect();
  fetch('/data/pages.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (all) { if (!EDIT) applyAll((all && all[PATH]) || {}); else window.__cmsBaseline = (all && all[PATH]) || {}; })
    .catch(function () {});

  if (!EDIT) return;

  // ------------------------------------------------------------------ edit mode
  var css = document.createElement('style');
  css.textContent =
    '[data-cms-hot]{cursor:text!important}' +
    '[data-cms-hot]:hover{outline:2px dashed #e10600!important;outline-offset:3px}' +
    'img[data-cms-hot]{cursor:pointer!important}' +
    '[data-cms-editing]{outline:2px solid #e10600!important;outline-offset:3px;background:rgba(225,6,0,.08)!important}' +
    '[data-cms-applied]{box-shadow:0 0 0 1px rgba(225,6,0,.55)!important}' +
    '.reveal{opacity:1!important;transform:none!important;clip-path:none!important}';
  document.head.appendChild(css);

  function send(msg) { msg.source = 'cms-frame'; window.parent.postMessage(msg, location.origin); }
  function findItem(el) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].el === el) return ITEMS[i]; return null; }
  function markHot() { ITEMS.forEach(function (it) { it.el.setAttribute('data-cms-hot', ''); }); }

  var editing = null;
  function finishEdit(cancel) {
    if (!editing) return;
    var it = editing; editing = null;
    var el = it.el;
    el.removeAttribute('contenteditable'); el.removeAttribute('data-cms-editing');
    if (cancel) { applyItem(it, CURRENT[it.key]); return; }
    var value = el.innerText.replace(/\s+\n/g, '\n').trim();
    var field = it.type === 'bi' ? lang() : 'text';
    send({ type: 'edit', path: PATH, key: it.key, kind: it.type, orig: el.dataset.cmsOrig, origId: el.dataset.cmsOrigId || null, field: field, value: value });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-cms-hot]');
    var link = e.target.closest('a,button');
    if (editing && el !== editing.el) finishEdit();
    if (!el) { if (link) e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation();
    var it = findItem(el);
    if (!it) return;
    if (it.type === 'img') {
      send({ type: 'pick-image', path: PATH, key: it.key, orig: el.dataset.cmsOrig, current: el.getAttribute('src'), alt: el.getAttribute('alt') || '' });
      return;
    }
    if (editing && editing.el === el) return;
    finishEdit();
    editing = it;
    el.setAttribute('data-cms-editing', '');
    try { el.contentEditable = 'plaintext-only'; } catch (err) { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.focus();
    var range = document.createRange(); range.selectNodeContents(el);
    var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(); }
  }, true);
  document.addEventListener('focusout', function (e) { if (editing && e.target === editing.el) finishEdit(); }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.source !== 'cms-admin') return;
    var d = e.data;
    if (d.type === 'lang') finishEdit();
    if (d.type === 'apply' && !editing) applyAll(d.overrides);
    if (d.type === 'lang') {
      var t = document.getElementById('lang-toggle');
      if (t && lang() !== d.lang) t.click();
      applyAll(CURRENT);
      send({ type: 'lang', lang: lang() });
    }
  });

  function ready() {
    // main.js may have re-rendered language by now; re-snapshot keys (orig values are kept).
    collect(); markHot();
    send({ type: 'ready', path: PATH, lang: lang(), title: document.title, count: ITEMS.length, hasLang: !!document.getElementById('lang-toggle') });
  }
  if (document.readyState === 'complete') setTimeout(ready, 50);
  else window.addEventListener('load', function () { setTimeout(ready, 50); });
})();
