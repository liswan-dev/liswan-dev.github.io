/*
 * Realistic demo dataset — shaped exactly like the tables in database/schema.sql
 * so it can be swapped for live Supabase rows with no code changes elsewhere.
 * Used only when window.isLiveBackend is false (see supabase-client.js).
 */
window.DUMMY_DB = {
  demoAccounts: {
    client: { email: 'client@ptabc.co.id', password: 'client123', userId: 'u-client-1' },
    admin: { email: 'admin@liswan.dev', password: 'admin123', userId: 'u-admin-1' }
  },

  users: [
    { id: 'u-admin-1', client_id: null, full_name: 'Liswan Susanto', email: 'admin@liswan.dev', role: 'admin', avatar_url: '', phone: '+62 812-0000-0001' },
    { id: 'u-client-1', client_id: 'c-1', full_name: 'Budi Hartono', email: 'client@ptabc.co.id', role: 'client', avatar_url: '', phone: '+62 812-3456-7890' },
    { id: 'u-client-2', client_id: 'c-2', full_name: 'Sari Wijaya', email: 'sari@majuterus.co.id', role: 'client', avatar_url: '', phone: '+62 813-1122-3344' },
    { id: 'u-client-3', client_id: 'c-3', full_name: 'Rudi Setiawan', email: 'rudi@sinarlogistik.co.id', role: 'client', avatar_url: '', phone: '+62 815-9988-7766' }
  ],

  clients: [
    { id: 'c-1', company_name: 'PT ABC Indonesia', contact_person: 'Budi Hartono', email: 'client@ptabc.co.id', whatsapp: '+62 812-3456-7890', address: 'Surabaya, Jawa Timur' },
    { id: 'c-2', company_name: 'CV Maju Terus', contact_person: 'Sari Wijaya', email: 'sari@majuterus.co.id', whatsapp: '+62 813-1122-3344', address: 'Sidoarjo, Jawa Timur' },
    { id: 'c-3', company_name: 'PT Sinar Logistik', contact_person: 'Rudi Setiawan', email: 'rudi@sinarlogistik.co.id', whatsapp: '+62 815-9988-7766', address: 'Gresik, Jawa Timur' }
  ],

  projects: [
    {
      id: 'p-1', client_id: 'c-1', name: 'Website Company Profile', description: 'Company profile website with CMS-driven pages and contact lead capture.',
      status: 'development', progress: 72, project_manager: 'u-admin-1', start_date: '2026-08-15', target_date: '2026-09-20', budget_range: 'Rp 5.000.000 - Rp 10.000.000',
      case_study_slug: null
    },
    {
      id: 'p-2', client_id: 'c-1', name: 'Internal Approval System', description: 'Purchase and leave approval workflow for internal staff.',
      status: 'planning', progress: 10, project_manager: 'u-admin-1', start_date: '2026-09-01', target_date: '2026-11-01', budget_range: 'Rp 10.000.000 - Rp 20.000.000',
      case_study_slug: null
    },
    {
      id: 'p-3', client_id: 'c-2', name: 'Smart Master Asset', description: 'Asset Management Platform', status: 'maintenance', progress: 100,
      project_manager: 'u-admin-1', start_date: '2025-11-03', target_date: '2026-02-10', budget_range: 'Rp 20.000.000 - Rp 35.000.000',
      case_study_slug: 'smart-master-asset'
    },
    {
      id: 'p-4', client_id: 'c-3', name: 'Sales Force Automation', description: 'Sales Operational Platform', status: 'completed', progress: 100,
      project_manager: 'u-admin-1', start_date: '2025-08-01', target_date: '2025-12-15', budget_range: 'Rp 25.000.000 - Rp 40.000.000',
      case_study_slug: 'sales-force-automation'
    },
    {
      id: 'p-5', client_id: 'c-3', name: 'Inventory Management System', description: 'Inventory Management System', status: 'testing', progress: 88,
      project_manager: 'u-admin-1', start_date: '2026-04-10', target_date: '2026-09-01', budget_range: 'Rp 20.000.000 - Rp 35.000.000',
      case_study_slug: 'inventory-management-system'
    }
  ],

  project_updates: [
    { id: 'up-1', project_id: 'p-1', title: 'Dashboard revision uploaded', description: 'Version 2 of the dashboard UI uploaded for review.', created_at: '2026-08-23T14:20:00' },
    { id: 'up-2', project_id: 'p-1', title: 'Inventory module reference reviewed', description: 'Reviewed a similar inventory module as a UI reference for the reporting page.', created_at: '2026-08-22T11:05:00' },
    { id: 'up-3', project_id: 'p-1', title: 'Client approved homepage design', description: 'Homepage-v2 approved without revision.', created_at: '2026-08-20T09:40:00' },
    { id: 'up-4', project_id: 'p-1', title: 'Homepage design uploaded', description: 'First homepage design draft uploaded for review.', created_at: '2026-08-18T16:15:00' },
    { id: 'up-5', project_id: 'p-1', title: 'Project started', description: 'Requirement gathering session completed, project kicked off.', created_at: '2026-08-15T10:00:00' }
  ],

  project_stages: {
    'p-1': [
      { label: 'Requirement', state: 'done' },
      { label: 'UI/UX Design', state: 'done' },
      { label: 'Frontend', state: 'done' },
      { label: 'Backend Development', state: 'current' },
      { label: 'Testing', state: 'pending' },
      { label: 'Deployment', state: 'pending' }
    ],
    'p-2': [
      { label: 'Requirement', state: 'done' },
      { label: 'UI/UX Design', state: 'current' },
      { label: 'Frontend', state: 'pending' },
      { label: 'Backend Development', state: 'pending' },
      { label: 'Testing', state: 'pending' },
      { label: 'Deployment', state: 'pending' }
    ],
    'p-5': [
      { label: 'Requirement', state: 'done' },
      { label: 'UI/UX Design', state: 'done' },
      { label: 'Frontend', state: 'done' },
      { label: 'Backend Development', state: 'done' },
      { label: 'Testing', state: 'current' },
      { label: 'Deployment', state: 'pending' }
    ]
  },

  project_files: [
    { id: 'f-1', project_id: 'p-1', category: 'design', file_name: 'Homepage-v1.png', file_size_kb: 842, uploaded_by: 'u-admin-1', created_at: '2026-08-18T16:15:00' },
    { id: 'f-2', project_id: 'p-1', category: 'design', file_name: 'Homepage-v2.png', file_size_kb: 910, uploaded_by: 'u-admin-1', created_at: '2026-08-20T09:10:00' },
    { id: 'f-3', project_id: 'p-1', category: 'design', file_name: 'Dashboard-v3.png', file_size_kb: 1240, uploaded_by: 'u-admin-1', created_at: '2026-08-23T14:20:00' },
    { id: 'f-4', project_id: 'p-1', category: 'documents', file_name: 'Proposal.pdf', file_size_kb: 320, uploaded_by: 'u-admin-1', created_at: '2026-08-14T10:00:00' },
    { id: 'f-5', project_id: 'p-1', category: 'documents', file_name: 'Requirement.pdf', file_size_kb: 210, uploaded_by: 'u-client-1', created_at: '2026-08-15T10:30:00' },
    { id: 'f-6', project_id: 'p-1', category: 'documents', file_name: 'Invoice.pdf', file_size_kb: 96, uploaded_by: 'u-admin-1', created_at: '2026-08-16T09:00:00' },
    { id: 'f-7', project_id: 'p-1', category: 'delivery', file_name: 'Source-Code.zip', file_size_kb: 15400, uploaded_by: 'u-admin-1', created_at: '2026-08-23T15:00:00' },
    { id: 'f-8', project_id: 'p-1', category: 'delivery', file_name: 'Documentation.pdf', file_size_kb: 540, uploaded_by: 'u-admin-1', created_at: '2026-08-23T15:00:00' }
  ],

  project_messages: [
    { id: 'm-1', project_id: 'p-1', sender_role: 'client', sender_name: 'Budi Hartono', message: 'Grafiknya bisa dibuat berdasarkan area?', created_at: '2026-08-21T13:00:00' },
    { id: 'm-2', project_id: 'p-1', sender_role: 'admin', sender_name: 'Liswan Susanto', message: 'Bisa. Saya tambahkan filter area pada revision berikutnya.', created_at: '2026-08-21T13:22:00' },
    { id: 'm-3', project_id: 'p-1', sender_role: 'client', sender_name: 'Budi Hartono', message: 'Oke, ditunggu ya. Terima kasih.', created_at: '2026-08-21T13:25:00' }
  ],

  project_revisions: [
    { id: 'r-1', project_id: 'p-1', module: 'Dashboard UI', description: 'Tambahkan filter area pada grafik penjualan.', priority: 'normal', status: 'in_progress', submitted_by: 'u-client-1', created_at: '2026-08-21T13:22:00' },
    { id: 'r-2', project_id: 'p-1', module: 'Homepage', description: 'Perbesar ukuran logo di header.', priority: 'low', status: 'completed', submitted_by: 'u-client-1', created_at: '2026-08-19T08:00:00' },
    { id: 'r-3', project_id: 'p-1', module: 'Contact Form', description: 'Tambahkan validasi nomor WhatsApp.', priority: 'high', status: 'approved', submitted_by: 'u-client-1', created_at: '2026-08-17T11:00:00' }
  ],

  project_approvals: [
    { id: 'a-1', project_id: 'p-1', title: 'Dashboard UI — Version 2', preview_url: '', status: 'pending', submitted_at: '2026-08-22T10:00:00' },
    { id: 'a-2', project_id: 'p-1', title: 'Homepage Design — Version 2', preview_url: '', status: 'approved', submitted_at: '2026-08-19T09:00:00', decided_at: '2026-08-20T09:40:00' },
    { id: 'a-3', project_id: 'p-1', title: 'Homepage Design — Version 1', preview_url: '', status: 'revision_requested', submitted_at: '2026-08-18T16:15:00', decided_at: '2026-08-19T08:05:00' }
  ],

  invoices: [
    { id: 'inv-1', project_id: 'p-1', invoice_number: 'INV-2026-081', total_amount: 8500000, paid_amount: 4250000, status: 'partial', due_date: '2026-08-30', created_at: '2026-08-15T10:00:00' },
    { id: 'inv-2', project_id: 'p-4', invoice_number: 'INV-2025-140', total_amount: 32000000, paid_amount: 32000000, status: 'paid', due_date: '2025-12-20', created_at: '2025-12-01T10:00:00' },
    { id: 'inv-3', project_id: 'p-5', invoice_number: 'INV-2026-070', total_amount: 27500000, paid_amount: 0, status: 'unpaid', due_date: '2026-09-05', created_at: '2026-08-20T10:00:00' }
  ],

  invoice_items: [
    { id: 'ii-1', invoice_id: 'inv-1', description: 'Website Company Profile — Development (60% milestone)', qty: 1, unit_price: 8500000 }
  ],

  invoice_payments: [
    { id: 'pay-1', invoice_id: 'inv-1', amount: 4250000, paid_at: '2026-08-18', method: 'Transfer Bank', note: 'DP 50%', created_at: '2026-08-18T10:00:00' },
    { id: 'pay-2', invoice_id: 'inv-2', amount: 32000000, paid_at: '2025-12-15', method: 'Transfer Bank', note: 'Pelunasan', created_at: '2025-12-15T10:00:00' }
  ],

  notifications: [
    { id: 'n-1', user_id: 'u-client-1', title: 'Approval needed', body: 'Dashboard UI — Version 2 is waiting for your approval.', is_read: false, link: '/client/approvals/', created_at: '2026-08-23T14:20:00' },
    { id: 'n-2', user_id: 'u-client-1', title: 'File uploaded', body: 'Dashboard-v3.png was added to your project files.', is_read: false, link: '/client/files/', created_at: '2026-08-23T14:20:00' },
    { id: 'n-3', user_id: 'u-client-1', title: 'Revision in progress', body: 'Your revision on Dashboard UI is now in progress.', is_read: true, link: '/client/revisions/', created_at: '2026-08-21T13:22:00' }
  ],

  project_requests: [
    { id: 'req-1', client_id: null, project_type: 'Internal System', complexity: 'Medium', features: ['Login', 'Dashboard', 'Reporting'], company_name: 'UD Bintang Sejahtera', contact_person: 'Hendra Kusuma', email: 'hendra@bintangsejahtera.id', whatsapp: '+62 811-2233-4455', description: 'Butuh sistem approval pembelian barang internal.', target_date: '2026-11-01', budget_range: 'Rp 15.000.000 - Rp 25.000.000', status: 'new', created_at: '2026-08-19T09:00:00' },
    { id: 'req-2', client_id: null, project_type: 'Company Website', complexity: 'Simple', features: ['Dashboard'], company_name: 'Toko Elektronik Jaya', contact_person: 'Lina Marlina', email: 'lina@elektronikjaya.co.id', whatsapp: '+62 817-6655-4433', description: 'Website company profile sederhana untuk toko elektronik.', target_date: '2026-10-01', budget_range: 'Rp 5.000.000 - Rp 10.000.000', status: 'contacted', created_at: '2026-08-16T15:30:00' }
  ],

  activity_logs: [
    { id: 'log-1', actor_id: 'u-admin-1', project_id: 'p-1', action: 'Uploaded Dashboard-v3.png', created_at: '2026-08-23T14:20:00' },
    { id: 'log-2', actor_id: 'u-client-1', project_id: 'p-1', action: 'Approved Homepage Design v2', created_at: '2026-08-20T09:40:00' }
  ]
};
