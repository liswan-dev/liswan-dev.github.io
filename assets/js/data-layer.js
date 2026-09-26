/*
 * DB — single data-access layer used by every client-portal and admin page.
 * Load order (after supabase-client.js and dummy-data.js):
 *   <script src="/assets/js/data-layer.js" defer></script>
 *
 * Behavior:
 *  - If window.isLiveBackend is true (Supabase configured), every method
 *    talks to Supabase and respects the RLS policies in database/schema.sql.
 *  - Otherwise every method reads/writes a localStorage-backed copy of
 *    window.DUMMY_DB ("demo mode"), seeded once, so approvals/revisions/
 *    messages/status changes persist across reloads in this browser.
 *
 * All methods are async and return plain data (or {ok,error}) regardless of
 * backend, so page code never branches on isLive except for UI messaging
 * (e.g. "Demo mode — no real file storage").
 *
 * Demo login credentials (also shown on the login screens):
 *   Client — client@ptabc.co.id / client123
 *   Admin  — admin@liswan.dev / admin123
 */
(function () {
  var STORE_KEY = 'liswan-demo-db';
  var SESSION_KEY = 'liswan-session';

  function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 10); }
  function nowIso() { return new Date().toISOString(); }

  function loadStore() {
    if (!window.isLiveBackend) {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        try {
          var saved = JSON.parse(raw);
          // stores seeded before invoice payments existed: turn each paid_amount into an opening payment
          if (!saved.invoice_payments) {
            saved.invoice_payments = (saved.invoices || []).filter(function (i) { return Number(i.paid_amount) > 0; }).map(function (i) {
              return { id: 'pay-' + i.id, invoice_id: i.id, amount: Number(i.paid_amount), paid_at: String(i.created_at).slice(0, 10), method: 'Saldo awal', note: '', created_at: i.created_at };
            });
            localStorage.setItem(STORE_KEY, JSON.stringify(saved));
          }
          return saved;
        } catch (e) {}
      }
      var seed = JSON.parse(JSON.stringify(window.DUMMY_DB || {}));
      localStorage.setItem(STORE_KEY, JSON.stringify(seed));
      return seed;
    }
    return null;
  }
  function saveStore(store) { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }

  function getSessionSync() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSessionSync(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function currentPathIsClient() { return location.pathname.indexOf('/client/') === 0; }

  var DB = {
    isLive: !!window.isLiveBackend,

    // ---------------------------------------------------------------- AUTH
    async login(email, password) {
      if (this.isLive) {
        var res = await window.sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) return { ok: false, error: res.error.message };
        var profile = await window.sb.from('users').select('*').eq('id', res.data.user.id).single();
        if (profile.error) return { ok: false, error: profile.error.message };
        setSessionSync({ role: profile.data.role, userId: profile.data.id, email: profile.data.email, fullName: profile.data.full_name, clientId: profile.data.client_id });
        return { ok: true, role: profile.data.role };
      }
      var demo = (window.DUMMY_DB || {}).demoAccounts || {};
      var match = null, role = null;
      if (demo.client && email === demo.client.email && password === demo.client.password) { match = demo.client; role = 'client'; }
      if (demo.admin && email === demo.admin.email && password === demo.admin.password) { match = demo.admin; role = 'admin'; }
      if (!match) return { ok: false, error: 'Email atau password salah. Gunakan kredensial demo yang tertera.' };
      var store = loadStore();
      var user = (store.users || []).find(function (u) { return u.id === match.userId; });
      setSessionSync({ role: role, userId: user.id, email: user.email, fullName: user.full_name, clientId: user.client_id });
      return { ok: true, role: role };
    },

    async logout() {
      if (this.isLive) { try { await window.sb.auth.signOut(); } catch (e) {} }
      setSessionSync(null);
    },

    getSession: getSessionSync,

    // Call at the top of every protected page. Redirects if not authorized.
    requireAuth(role) {
      var session = getSessionSync();
      var loginUrl = role === 'admin' ? '/admin/login/' : '/client/login/';
      if (!session || session.role !== role) {
        location.replace(loginUrl);
        return null;
      }
      return session;
    },

    // -------------------------------------------------------- CLIENT READS
    async getMyClient() {
      var session = getSessionSync(); if (!session) return null;
      if (this.isLive) {
        var r = await window.sb.from('clients').select('*').eq('id', session.clientId).single();
        return r.data || null;
      }
      var store = loadStore();
      return (store.clients || []).find(function (c) { return c.id === session.clientId; }) || null;
    },

    async listMyProjects() {
      var session = getSessionSync(); if (!session) return [];
      if (this.isLive) {
        var r = await window.sb.from('projects').select('*').eq('client_id', session.clientId).order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.projects || []).filter(function (p) { return p.client_id === session.clientId; });
    },

    async getProject(projectId) {
      if (this.isLive) {
        var r = await window.sb.from('projects').select('*').eq('id', projectId).single();
        return r.data || null;
      }
      var store = loadStore();
      return (store.projects || []).find(function (p) { return p.id === projectId; }) || null;
    },

    async listProjectStages(projectId) {
      if (this.isLive) return []; // stages are demo-only convenience; live mode derives progress from `projects.progress`
      var store = loadStore();
      return (store.project_stages || {})[projectId] || [];
    },

    async listProjectUpdates(projectId) {
      if (this.isLive) {
        var r = await window.sb.from('project_updates').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.project_updates || []).filter(function (u) { return u.project_id === projectId; })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },

    async listProjectFiles(projectId, category) {
      if (this.isLive) {
        var q = window.sb.from('project_files').select('*').eq('project_id', projectId);
        if (category) q = q.eq('category', category);
        var r = await q.order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.project_files || []).filter(function (f) {
        return f.project_id === projectId && (!category || f.category === category);
      });
    },

    fileDownloadUrl(file) {
      // Demo mode has no real file storage — pages should show a toast instead of navigating.
      return this.isLive ? (file.storage_path || null) : null;
    },

    async listProjectMessages(projectId) {
      if (this.isLive) {
        var r = await window.sb.from('project_messages').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
        return r.data || [];
      }
      var store = loadStore();
      return (store.project_messages || []).filter(function (m) { return m.project_id === projectId; })
        .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    },

    async sendMessage(projectId, message) {
      var session = getSessionSync();
      if (this.isLive) {
        var r = await window.sb.from('project_messages').insert({ project_id: projectId, sender_id: session.userId, sender_role: session.role, message: message }).select().single();
        return r.data;
      }
      var store = loadStore();
      var row = { id: uid('m'), project_id: projectId, sender_role: session.role, sender_name: session.fullName, message: message, created_at: nowIso() };
      store.project_messages = store.project_messages || [];
      store.project_messages.push(row);
      saveStore(store);
      return row;
    },

    async listProjectRevisions(projectId) {
      if (this.isLive) {
        var r = await window.sb.from('project_revisions').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.project_revisions || []).filter(function (rv) { return rv.project_id === projectId; })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },

    async submitRevision(projectId, payload) {
      var session = getSessionSync();
      var row = {
        module: payload.module, description: payload.description, priority: payload.priority || 'normal',
        attachment_url: payload.attachmentName || null, status: 'submitted'
      };
      if (this.isLive) {
        var r = await window.sb.from('project_revisions').insert(Object.assign({ project_id: projectId, submitted_by: session.userId }, row)).select().single();
        return r.data;
      }
      var store = loadStore();
      row.id = uid('r'); row.project_id = projectId; row.submitted_by = session.userId; row.created_at = nowIso();
      store.project_revisions = store.project_revisions || [];
      store.project_revisions.unshift(row);
      saveStore(store);
      return row;
    },

    async listProjectApprovals(projectId) {
      if (this.isLive) {
        var r = await window.sb.from('project_approvals').select('*').eq('project_id', projectId).order('submitted_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.project_approvals || []).filter(function (a) { return a.project_id === projectId; })
        .sort(function (a, b) { return new Date(b.submitted_at) - new Date(a.submitted_at); });
    },

    async decideApproval(approvalId, decision, revisionPayload) {
      var session = getSessionSync();
      if (this.isLive) {
        await window.sb.from('project_approvals').update({ status: decision, decided_at: nowIso(), decided_by: session.userId }).eq('id', approvalId);
      } else {
        var store = loadStore();
        var approval = (store.project_approvals || []).find(function (a) { return a.id === approvalId; });
        if (approval) { approval.status = decision; approval.decided_at = nowIso(); }
        saveStore(store);
      }
      if (decision === 'revision_requested' && revisionPayload) {
        var approvalRow = (await this.listProjectApprovals(revisionPayload.projectId)).find(function (a) { return a.id === approvalId; });
        await this.submitRevision(revisionPayload.projectId, {
          module: approvalRow ? approvalRow.title : 'Approval item',
          description: revisionPayload.description, priority: revisionPayload.priority, attachmentName: revisionPayload.attachmentName
        });
      }
      return true;
    },

    async listInvoices(projectId) {
      var session = getSessionSync();
      if (this.isLive) {
        var q = window.sb.from('invoices').select('*');
        q = projectId ? q.eq('project_id', projectId) : q;
        var r = await q.order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      var myProjectIds = (store.projects || []).filter(function (p) { return p.client_id === session.clientId; }).map(function (p) { return p.id; });
      return (store.invoices || []).filter(function (i) {
        return projectId ? i.project_id === projectId : myProjectIds.indexOf(i.project_id) !== -1;
      });
    },

    async listInvoiceItems(invoiceId) {
      if (this.isLive) {
        var r = await window.sb.from('invoice_items').select('*').eq('invoice_id', invoiceId);
        return r.data || [];
      }
      var store = loadStore();
      return (store.invoice_items || []).filter(function (ii) { return ii.invoice_id === invoiceId; });
    },

    async listNotifications() {
      var session = getSessionSync(); if (!session) return [];
      if (this.isLive) {
        var r = await window.sb.from('notifications').select('*').eq('user_id', session.userId).order('created_at', { ascending: false });
        return r.data || [];
      }
      var store = loadStore();
      return (store.notifications || []).filter(function (n) { return n.user_id === session.userId; })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },

    async markNotificationRead(id) {
      if (this.isLive) { await window.sb.from('notifications').update({ is_read: true }).eq('id', id); return; }
      var store = loadStore();
      var n = (store.notifications || []).find(function (x) { return x.id === id; });
      if (n) n.is_read = true;
      saveStore(store);
    },

    async submitProjectRequest(payload) {
      var session = getSessionSync();
      var row = Object.assign({ client_id: session ? session.clientId : null, status: 'new' }, payload);
      if (this.isLive) {
        var r = await window.sb.from('project_requests').insert(row).select().single();
        return r.data;
      }
      var store = loadStore();
      row.id = uid('req'); row.created_at = nowIso();
      store.project_requests = store.project_requests || [];
      store.project_requests.unshift(row);
      saveStore(store);
      return row;
    },

    // --------------------------------------------------------- ADMIN READS
    async listClients() {
      if (this.isLive) { var r = await window.sb.from('clients').select('*').order('created_at', { ascending: false }); return r.data || []; }
      return (loadStore().clients || []);
    },

    async createClient(payload) {
      if (this.isLive) { var r = await window.sb.from('clients').insert(payload).select().single(); return r.data; }
      var store = loadStore();
      var row = Object.assign({ id: uid('c') }, payload);
      store.clients = store.clients || []; store.clients.push(row); saveStore(store);
      return row;
    },

    async listAllProjects() {
      if (this.isLive) { var r = await window.sb.from('projects').select('*').order('created_at', { ascending: false }); return r.data || []; }
      return (loadStore().projects || []);
    },

    async createProject(payload) {
      if (this.isLive) { var r = await window.sb.from('projects').insert(payload).select().single(); return r.data; }
      var store = loadStore();
      var row = Object.assign({ id: uid('p'), progress: 0, status: 'inquiry', created_at: nowIso() }, payload);
      store.projects = store.projects || []; store.projects.push(row); saveStore(store);
      return row;
    },

    async updateProjectStatus(projectId, status, progress) {
      var patch = { status: status };
      if (typeof progress === 'number') patch.progress = progress;
      if (this.isLive) { await window.sb.from('projects').update(patch).eq('id', projectId); return; }
      var store = loadStore();
      var p = (store.projects || []).find(function (x) { return x.id === projectId; });
      if (p) Object.assign(p, patch);
      saveStore(store);
    },

    async addProjectUpdate(projectId, title, description) {
      var session = getSessionSync();
      if (this.isLive) { var r = await window.sb.from('project_updates').insert({ project_id: projectId, title: title, description: description, created_by: session.userId }).select().single(); return r.data; }
      var store = loadStore();
      var row = { id: uid('up'), project_id: projectId, title: title, description: description, created_at: nowIso() };
      store.project_updates = store.project_updates || []; store.project_updates.unshift(row); saveStore(store);
      return row;
    },

    async uploadFileRecord(projectId, category, fileName, sizeKb) {
      var session = getSessionSync();
      if (this.isLive) { var r = await window.sb.from('project_files').insert({ project_id: projectId, category: category, file_name: fileName, file_size_kb: sizeKb, uploaded_by: session.userId }).select().single(); return r.data; }
      var store = loadStore();
      var row = { id: uid('f'), project_id: projectId, category: category, file_name: fileName, file_size_kb: sizeKb, uploaded_by: session.userId, created_at: nowIso() };
      store.project_files = store.project_files || []; store.project_files.unshift(row); saveStore(store);
      return row;
    },

    async createApproval(projectId, title) {
      if (this.isLive) { var r = await window.sb.from('project_approvals').insert({ project_id: projectId, title: title, status: 'pending' }).select().single(); return r.data; }
      var store = loadStore();
      var row = { id: uid('a'), project_id: projectId, title: title, status: 'pending', submitted_at: nowIso() };
      store.project_approvals = store.project_approvals || []; store.project_approvals.unshift(row); saveStore(store);
      return row;
    },

    async updateRevisionStatus(revisionId, status) {
      if (this.isLive) { await window.sb.from('project_revisions').update({ status: status }).eq('id', revisionId); return; }
      var store = loadStore();
      var rv = (store.project_revisions || []).find(function (x) { return x.id === revisionId; });
      if (rv) rv.status = status;
      saveStore(store);
    },

    async createInvoice(projectId, payload) {
      if (this.isLive) { var r = await window.sb.from('invoices').insert(Object.assign({ project_id: projectId }, payload)).select().single(); return r.data; }
      var store = loadStore();
      var row = Object.assign({ id: uid('inv'), project_id: projectId, paid_amount: 0, status: 'unpaid', created_at: nowIso() }, payload);
      store.invoices = store.invoices || []; store.invoices.push(row); saveStore(store);
      return row;
    },

    // --------------------------------------------------------- INVOICE MODULE (admin)
    async listAllInvoices() {
      if (this.isLive) { var r = await window.sb.from('invoices').select('*').order('created_at', { ascending: false }); return r.data || []; }
      return (loadStore().invoices || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },

    async createInvoiceWithItems(projectId, payload, items) {
      items = (items || []).filter(function (it) { return it.description; });
      if (this.isLive) {
        var r = await window.sb.from('invoices').insert(Object.assign({ project_id: projectId }, payload)).select().single();
        if (r.error) throw new Error(r.error.message);
        if (items.length) {
          var ri = await window.sb.from('invoice_items').insert(items.map(function (it) { return Object.assign({ invoice_id: r.data.id }, it); }));
          if (ri.error) throw new Error(ri.error.message);
        }
        return r.data;
      }
      var store = loadStore();
      store.invoices = store.invoices || [];
      if (store.invoices.some(function (i) { return i.invoice_number === payload.invoice_number; })) throw new Error('Nomor invoice sudah dipakai');
      var row = Object.assign({ id: uid('inv'), project_id: projectId, paid_amount: 0, status: 'unpaid', created_at: nowIso() }, payload);
      store.invoices.push(row);
      store.invoice_items = store.invoice_items || [];
      items.forEach(function (it) { store.invoice_items.push(Object.assign({ id: uid('ii'), invoice_id: row.id }, it)); });
      saveStore(store);
      return row;
    },

    async deleteInvoice(invoiceId) {
      if (this.isLive) { await window.sb.from('invoices').delete().eq('id', invoiceId); return; }
      var store = loadStore();
      store.invoices = (store.invoices || []).filter(function (i) { return i.id !== invoiceId; });
      store.invoice_items = (store.invoice_items || []).filter(function (i) { return i.invoice_id !== invoiceId; });
      store.invoice_payments = (store.invoice_payments || []).filter(function (p) { return p.invoice_id !== invoiceId; });
      saveStore(store);
    },

    async listPayments(invoiceId) {
      if (this.isLive) {
        var q = window.sb.from('invoice_payments').select('*').order('paid_at', { ascending: false });
        if (invoiceId) q = q.eq('invoice_id', invoiceId);
        var r = await q; return r.data || [];
      }
      return (loadStore().invoice_payments || []).filter(function (p) { return !invoiceId || p.invoice_id === invoiceId; })
        .sort(function (a, b) { return new Date(b.paid_at) - new Date(a.paid_at); });
    },

    // Recompute paid_amount/status from the payment rows so the invoice never drifts.
    async _syncInvoicePaid(invoiceId) {
      var pays = await this.listPayments(invoiceId);
      var paid = pays.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
      var inv;
      if (this.isLive) { var r = await window.sb.from('invoices').select('*').eq('id', invoiceId).single(); inv = r.data; }
      else inv = (loadStore().invoices || []).find(function (i) { return i.id === invoiceId; });
      if (!inv) return;
      var total = Number(inv.total_amount) || 0;
      var patch = { paid_amount: paid, status: paid <= 0 ? 'unpaid' : (paid >= total ? 'paid' : 'partial') };
      if (this.isLive) { await window.sb.from('invoices').update(patch).eq('id', invoiceId); return; }
      var store = loadStore();
      var row = (store.invoices || []).find(function (i) { return i.id === invoiceId; });
      if (row) Object.assign(row, patch);
      saveStore(store);
    },

    async recordPayment(invoiceId, payload) {
      var row = Object.assign({ invoice_id: invoiceId }, payload);
      if (this.isLive) {
        var r = await window.sb.from('invoice_payments').insert(row).select().single();
        if (r.error) throw new Error(r.error.message);
        row = r.data;
      } else {
        var store = loadStore();
        row = Object.assign({ id: uid('pay'), created_at: nowIso() }, row);
        store.invoice_payments = store.invoice_payments || []; store.invoice_payments.push(row); saveStore(store);
      }
      await this._syncInvoicePaid(invoiceId);
      return row;
    },

    async deletePayment(paymentId, invoiceId) {
      if (this.isLive) await window.sb.from('invoice_payments').delete().eq('id', paymentId);
      else {
        var store = loadStore();
        store.invoice_payments = (store.invoice_payments || []).filter(function (p) { return p.id !== paymentId; });
        saveStore(store);
      }
      await this._syncInvoicePaid(invoiceId);
    },

    async listLeads() {
      if (this.isLive) { var r = await window.sb.from('project_requests').select('*').order('created_at', { ascending: false }); return r.data || []; }
      return (loadStore().project_requests || []).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },

    async updateLeadStatus(id, status) {
      if (this.isLive) { await window.sb.from('project_requests').update({ status: status }).eq('id', id); return; }
      var store = loadStore();
      var lead = (store.project_requests || []).find(function (x) { return x.id === id; });
      if (lead) lead.status = status;
      saveStore(store);
    },

    async listAllUsers() {
      if (this.isLive) { var r = await window.sb.from('users').select('*'); return r.data || []; }
      return (loadStore().users || []);
    }
  };

  window.DB = DB;
})();
