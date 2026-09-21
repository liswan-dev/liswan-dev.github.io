/*
 * Initializes the Supabase client if credentials are configured
 * (assets/js/supabase-config.js). Load order on every page that needs it:
 *   1. https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2  (defines window.supabase)
 *   2. supabase-config.js
 *   3. supabase-client.js   <- this file (redefines window.sb)
 *   4. dummy-data.js
 *   5. data-layer.js
 */
(function () {
  var hasCreds = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  var hasSdk = typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';
  window.sb = (hasCreds && hasSdk) ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
  window.isLiveBackend = !!window.sb;
})();
