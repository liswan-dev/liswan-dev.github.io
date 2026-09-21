/*
 * content-loader.js — hydrates index.html from data/content.json.
 * The HTML already ships with full static content (fast first paint, works
 * with JS disabled, good for SEO). This script fetches content.json and, if
 * it loads successfully, overwrites the DOM with the latest edited content —
 * so editing content.json (e.g. via /admin/content/) updates the live site
 * without ever touching index.html by hand.
 */
(function () {
  var ICONS = {
    check: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    bolt: '<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>',
    clock: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    assets: '<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>',
    workflow: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    dashboard: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14"/>',
    automation: '<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>',
    drive: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 001.6-9.75A6 6 0 006 9.5 4.5 4.5 0 003 15z"/>',
    website: '<path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/>'
  };
  var CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Content fields may contain a small "<grad>...</grad>" marker (typed by the admin editor)
  // meaning "highlight this part with the gradient text style" — converted to the real span here.
  function gradHtml(str) {
    return esc(str).replace(/&lt;grad&gt;/g, '<span class="grad-text">').replace(/&lt;\/grad&gt;/g, '</span>');
  }
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  }
  function setHtml(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.innerHTML = value;
  }
  function icon(name, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (ICONS[name] || ICONS.check) + '</svg>';
  }

  function renderHero(d) {
    setText('c-hero-eyebrow', d.eyebrow);
    setHtml('c-hero-headline', gradHtml(d.headline));
    setText('c-hero-sub', d.subheadline);
    setText('c-hero-cta-primary', d.ctaPrimaryLabel);
    setText('c-hero-cta-secondary', d.ctaSecondaryLabel);
    var stackEl = document.getElementById('c-hero-stack');
    if (stackEl && d.stack) stackEl.innerHTML = d.stack.map(function (s) { return '<span class="stack-pill">' + esc(s) + '</span>'; }).join('');
    var linesEl = document.getElementById('c-hero-card-lines');
    if (linesEl && d.card && d.card.lines) {
      linesEl.innerHTML = d.card.lines.map(function (l) {
        return '<div class="hero-card-line"><span class="k">' + esc(l.k) + '</span><span class="v">' + esc(l.v) + '</span></div>';
      }).join('');
    }
    if (d.card) setHtml('c-hero-card-badge', '&#9679; ' + esc(d.card.badge));
  }

  function renderStats(list) {
    var el = document.getElementById('c-stats');
    if (!el || !list) return;
    el.innerHTML = list.map(function (s) {
      return '<div class="stat"><h3>' + gradHtml(s.value) + '</h3><p>' + esc(s.label) + '</p></div>';
    }).join('');
  }

  function renderAbout(d) {
    setText('c-about-eyebrow', d.eyebrow);
    setHtml('c-about-title', gradHtml(d.title));
    setText('c-about-desc', d.description);
    var el = document.getElementById('c-about-points');
    if (el && d.points) {
      el.innerHTML = d.points.map(function (p) {
        return '<div class="about-point"><div class="ic">' + icon(p.icon, 18) + '</div>' +
          '<div><h4>' + esc(p.title) + '</h4><p>' + esc(p.desc) + '</p></div></div>';
      }).join('');
    }
  }

  function renderServices(d) {
    setText('c-services-eyebrow', d.eyebrow);
    setText('c-services-title', d.title);
    setText('c-services-desc', d.description);
    var el = document.getElementById('c-services-grid');
    if (el && d.items) {
      el.innerHTML = d.items.map(function (s) {
        return '<div class="svc-card"><div class="ic">' + icon(s.icon, 22) + '</div>' +
          '<h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p></div>';
      }).join('');
    }
  }

  function renderPortfolio(d) {
    setText('c-portfolio-eyebrow', d.eyebrow);
    setText('c-portfolio-title', d.title);
    setText('c-portfolio-desc', d.description);
    var el = document.getElementById('c-portfolio-grid');
    if (el && d.items) {
      el.innerHTML = d.items.map(function (p) {
        var chips = (p.chips || []).map(function (c) { return '<span class="pf-chip">' + esc(c) + '</span>'; }).join('');
        return '<div class="pf-card"><div class="pf-card-top"><h3>' + esc(p.title) + '</h3><span class="pf-tag">' + esc(p.tag) + '</span></div>' +
          '<p>' + esc(p.desc) + '</p><div class="pf-chips">' + chips + '</div></div>';
      }).join('');
    }
  }

  function renderProcess(d) {
    setText('c-process-eyebrow', d.eyebrow);
    setText('c-process-title', d.title);
    setText('c-process-desc', d.description);
    var el = document.getElementById('c-process-list');
    if (el && d.steps) {
      el.innerHTML = d.steps.map(function (s) {
        return '<div class="process-item"><span class="process-num">' + esc(s.num) + '</span><h4>' + esc(s.title) + '</h4><p>' + esc(s.desc) + '</p></div>';
      }).join('');
    }
  }

  function priceCardHtml(tier) {
    var features = (tier.features || []).map(function (f) { return '<li>' + CHECK_SVG + esc(f) + '</li>'; }).join('');
    var subject = encodeURIComponent(tier.ctaSubject || tier.name || '');
    return '<div class="price-card' + (tier.featured ? ' featured' : '') + '">' +
      (tier.featured ? '<span class="price-badge">Paling Populer</span>' : '') +
      '<h3>' + esc(tier.name) + '</h3>' +
      '<p class="price-desc">' + esc(tier.desc) + '</p>' +
      '<div class="price-amount"><div><span class="from">' + (tier.priceFrom ? esc(tier.priceFrom) : '&nbsp;') + '</span>' +
      '<span class="num"' + (tier.priceFrom ? '' : ' style="font-size:24px;"') + '>' + esc(tier.price) + '</span></div></div>' +
      '<ul class="price-features">' + features + '</ul>' +
      '<a href="mailto:hello@liswan.dev?subject=' + subject + '" class="btn ' + (tier.featured ? 'btn-grad' : 'btn-ghost') + ' btn-block">' + esc(tier.ctaLabel || 'Konsultasi') + '</a>' +
      '</div>';
  }

  function renderPricing(d) {
    setText('c-pricing-eyebrow', d.eyebrow);
    setText('c-pricing-title', d.title);
    setText('c-pricing-desc', d.description);
    if (d.tabs) { setText('c-pricing-tab-apps', d.tabs.apps); setText('c-pricing-tab-website', d.tabs.website); }
    var appsEl = document.getElementById('c-pricing-apps-grid');
    if (appsEl && d.apps) appsEl.innerHTML = d.apps.map(priceCardHtml).join('');
    var webEl = document.getElementById('c-pricing-website-grid');
    if (webEl && d.website) webEl.innerHTML = d.website.map(priceCardHtml).join('');
  }

  function renderContact(d) {
    setText('c-contact-eyebrow', d.eyebrow);
    setText('c-contact-title', d.title);
    setText('c-contact-desc', d.description);
    setText('c-contact-cta-email', 'Email ' + d.email);
    var emailLinks = ['c-hero-cta-primary', 'c-contact-cta-email', 'c-contact-meta-email'];
    emailLinks.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.tagName === 'A' && d.email) el.href = 'mailto:' + d.email;
    });
    setText('c-contact-meta-email', d.email);
    ['c-contact-cta-github', 'c-contact-meta-github'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && d.github) el.href = d.github;
    });
    setText('c-contact-meta-github', d.githubLabel || d.github);
    setText('c-contact-response', d.responseNote);
  }

  function renderFooter(d) {
    var el = document.getElementById('c-footer-text');
    if (el && d) el.innerHTML = '&copy; <span id="year">' + new Date().getFullYear() + '</span> ' + esc(d.text);
  }

  function render(content) {
    if (content.hero) renderHero(content.hero);
    if (content.stats) renderStats(content.stats);
    if (content.about) renderAbout(content.about);
    if (content.services) renderServices(content.services);
    if (content.portfolio) renderPortfolio(content.portfolio);
    if (content.process) renderProcess(content.process);
    if (content.pricing) renderPricing(content.pricing);
    if (content.contact) renderContact(content.contact);
    if (content.footer) renderFooter(content.footer);
  }

  fetch('/data/content.json', { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('content.json not found'); return res.json(); })
    .then(render)
    .catch(function (err) {
      // Static fallback content already in the HTML stays as-is.
      console.warn('content-loader: keeping static fallback content —', err.message);
    });
})();
