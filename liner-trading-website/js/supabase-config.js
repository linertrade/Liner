/* ==========================================================================
   Supabase client config — loaded only on portal.html, after the Supabase JS
   CDN script and before portal.js.

   The URL and anon key below are PUBLIC by design: Supabase's real access
   control lives in the Row Level Security policies defined in
   supabase/schema.sql, not in keeping this key secret. This is different
   from the Airtable token, which genuinely must stay server-side — see
   netlify/functions/products.js for why.
   ========================================================================== */

window.LINER_SUPABASE = (function () {
  const SUPABASE_URL = 'https://bbfmpeavpqbvwigsdkiy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZm1wZWF2cHFidndpZ3Nka2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzMwNzMsImV4cCI6MjA5ODkwOTA3M30.ijxgarNCjWS41xtBxQ3GVSH1L6F1EbMcD6Vrre1UrcY';

  if (!window.supabase) {
    console.error('Supabase JS library not loaded — check the CDN <script> tag runs before this file.');
    return null;
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
