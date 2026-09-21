/*
 * Dash — shared dashboard shell logic for Client Portal & Admin Panel pages.
 * Load order on every /client/ and /admin/ page (except the login pages):
 *   supabase-js CDN -> supabase-config.js -> supabase-client.js ->
 *   dummy-data.js -> data-layer.js -> dashboard.js -> <page inline script>
 *
 * Expected markup (see any built page for the full pattern):
 *   <body class="dash-body">
 *     <div class="dash-sidebar-backdrop" data-sidebar-backdrop></div>
 *     <div class="dash-shell">
 *       <aside class="dash-sidebar"> ... links with class="dash-nav-link" ... </aside>
 *       <div>
 *         <header class="dash-topbar">
 *           <button class="dash-hamburger" data-sidebar-toggle>...</button>
 *           <div class="dash-breadcrumb" data-breadcrumb>Dashboard</div>
 *           <div class="dash-topbar-actions">
 *             <button class="dash-icon-btn" id="notif-bell">...<span class="dash-notif-dot" id="notif-dot" hidden></span></button>
 *             <div class="dash-dropdown" id="notif-dropdown"></div>
 *             <button class="dash-profile-btn" id="profile-btn"><span class="dash-avatar" id="profile-avatar"></span><span id="profile-name"></span></button>
 *             <div class="dash-dropdown" id="profile-dropdown">...<button class="dash-dropdown-item" id="logout-btn">Log out</button></div>
 *           </div>
 *         </header>
 *         <main class="dash-main">...</main>
 *       </div>
 *     </div>
 *   </div>
 *   <div class="toast-stack" id="toast-stack"></div>
 */
window.Dash = (function () {
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatCurrency(n) {
    n = Number(n) || 0;
    return 'Rp ' + n.toLocaleString('id-ID');
  }

  function formatDate(iso, opts) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', opts || { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return ((parts[0] || '')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function toast(message, type) {
    var stack = document.getElementById('toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toast-stack'; stack.className = 'toast-stack'; document.body.appendChild(stack); }
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = message;
    stack.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 250);
    }, 3200);
  }

  function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function confirmAction(message, confirmLabel) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.innerHTML =
        '<div class="modal-box" style="width:min(400px,100%)">' +
        '  <div class="modal-body" style="padding-top:26px">' +
        '    <p style="font-size:14.5px;line-height:1.7;color:var(--text)">' + escapeHtml(message) + '</p>' +
        '  </div>' +
        '  <div class="modal-footer">' +
        '    <button type="button" class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '    <button type="button" class="btn btn-primary" data-act="ok">' + escapeHtml(confirmLabel || 'Confirm') + '</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target.getAttribute('data-act') === 'cancel') { overlay.remove(); resolve(false); }
        if (e.target.getAttribute('data-act') === 'ok') { overlay.remove(); resolve(true); }
      });
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.dash-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  }

  async function renderNotifications() {
    var dropdown = document.getElementById('notif-dropdown');
    var dot = document.getElementById('notif-dot');
    if (!dropdown || !window.DB) return;
    var items = await window.DB.listNotifications();
    var unread = items.filter(function (n) { return !n.is_read; }).length;
    if (dot) dot.hidden = unread === 0;
    dropdown.innerHTML = '<div class="dash-dropdown-head"><strong>Notifications</strong><span>' + unread + ' unread</span></div>' +
      (items.length ? items.slice(0, 8).map(function (n) {
        return '<a href="' + escapeHtml(n.link || '#') + '" class="dash-notif-item' + (n.is_read ? '' : ' unread') + '" data-notif-id="' + n.id + '">' +
          '<strong>' + escapeHtml(n.title) + '</strong><p>' + escapeHtml(n.body || '') + '</p><time>' + formatDate(n.created_at) + '</time></a>';
      }).join('') : '<div class="empty-state" style="padding:24px 10px"><p>No notifications yet.</p></div>');
    dropdown.querySelectorAll('[data-notif-id]').forEach(function (a) {
      a.addEventListener('click', function () { window.DB.markNotificationRead(a.getAttribute('data-notif-id')); });
    });
  }

  function initShell(opts) {
    opts = opts || {};
    var session = window.DB ? window.DB.requireAuth(opts.role || 'client') : null;
    if (!session) return null;

    var path = location.pathname.replace(/\/index\.html$/, '/');
    document.querySelectorAll('.dash-nav-link').forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && path.indexOf(href) === 0 && href !== '/') a.classList.add('active');
    });

    var nameEl = document.getElementById('profile-name');
    var emailEl = document.getElementById('profile-email');
    var avatarEl = document.getElementById('profile-avatar');
    if (nameEl) nameEl.textContent = session.fullName;
    if (emailEl) emailEl.textContent = session.email;
    if (avatarEl) avatarEl.textContent = initials(session.fullName);

    var sidebarToggle = document.querySelector('[data-sidebar-toggle]');
    var sidebarBackdrop = document.querySelector('[data-sidebar-backdrop]');
    function closeSidebar() { document.body.classList.remove('dash-sidebar-open'); }
    if (sidebarToggle) sidebarToggle.addEventListener('click', function () { document.body.classList.toggle('dash-sidebar-open'); });
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    var bell = document.getElementById('notif-bell');
    if (bell) {
      renderNotifications();
      bell.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = document.getElementById('notif-dropdown').classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) { document.getElementById('notif-dropdown').classList.add('open'); renderNotifications(); }
      });
    }
    var profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
      profileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = document.getElementById('profile-dropdown').classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) document.getElementById('profile-dropdown').classList.add('open');
      });
    }
    document.addEventListener('click', closeAllDropdowns);

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', async function () {
      await window.DB.logout();
      location.href = opts.role === 'admin' ? '/admin/login/' : '/client/login/';
    });

    var searchInput = document.querySelector('.dash-search input');
    if (searchInput) searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('[data-search-row]').forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
      });
    });

    var THEME_KEY = 'liswan-theme';
    var themeToggle = document.getElementById('theme-toggle');
    var currentTheme = function () { return document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); };
    var paint = function () { if (themeToggle) themeToggle.textContent = currentTheme() === 'dark' ? '☀' : '\u{1F319}'; };
    paint();
    if (themeToggle) themeToggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      paint();
    });

    document.querySelectorAll('.dash-tabs').forEach(function (tabs) {
      var buttons = tabs.querySelectorAll('.dash-tab');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = btn.getAttribute('data-tab-target');
          var scope = tabs.closest('[data-tab-scope]') || document;
          scope.querySelectorAll('.dash-tab').forEach(function (b) { b.classList.remove('active'); });
          scope.querySelectorAll('.dash-tab-panel').forEach(function (p) { p.classList.remove('active'); });
          btn.classList.add('active');
          var panel = scope.querySelector('[data-tab-panel="' + target + '"]');
          if (panel) panel.classList.add('active');
        });
      });
    });

    document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.getAttribute('data-modal-close')); });
    });
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('open'); });
    });

    if (!window.isLiveBackend) {
      var demoTag = document.createElement('div');
      demoTag.textContent = 'DEMO MODE — dummy data, no live backend';
      demoTag.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1300;text-align:center;padding:6px;font:700 10.5px "Plus Jakarta Sans",sans-serif;letter-spacing:.06em;background:#a8720f;color:#fff;pointer-events:none';
      document.body.appendChild(demoTag);
    }

    return session;
  }

  return {
    initShell: initShell, toast: toast, openModal: openModal, closeModal: closeModal,
    confirm: confirmAction, escapeHtml: escapeHtml, formatCurrency: formatCurrency,
    formatDate: formatDate, initials: initials, renderNotifications: renderNotifications
  };
})();
