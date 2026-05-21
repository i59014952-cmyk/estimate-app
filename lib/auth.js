// lib/auth.js — Supabase Auth (email+password) without the SDK.
// Holds the session in localStorage and exposes window.KHAuth. lib/supabase.js
// uses KHAuth.token() so authenticated REST calls carry the user's JWT, which
// lets RLS distinguish the logged-in operator (role: authenticated) from anon.

(function () {
  const URL_BASE = 'https://jvqogyyjlrwbjjotxvue.supabase.co';
  const ANON_KEY = 'sb_publishable_Yud_fsFEOxUAiPboEqVO1g_17BKYlDh';
  const STORE_KEY = 'kh_session';

  let session = null; // { access_token, refresh_token, expires_at }
  let refreshTimer = null;

  function load() {
    try { session = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
    catch { session = null; }
    scheduleRefresh();
  }

  function save(s) {
    session = s;
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
    scheduleRefresh();
  }

  function authHeaders(extra) {
    return Object.assign({ apikey: ANON_KEY, 'Content-Type': 'application/json' }, extra || {});
  }

  async function signIn(email, password) {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data.error_description || data.msg || data.error || `Ошибка входа (${r.status})`);
    }
    save({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
    });
    return true;
  }

  async function refresh() {
    if (!session || !session.refresh_token) return false;
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) { save(null); return false; }
    save({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
    });
    return true;
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (!session || !session.expires_at) return;
    const msUntil = session.expires_at * 1000 - Date.now() - 60_000; // 60s before expiry
    refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, Math.max(5_000, msUntil));
  }

  function isExpired() {
    return !session || !session.expires_at || session.expires_at * 1000 <= Date.now();
  }

  async function signOut() {
    const tok = session && session.access_token;
    save(null);
    if (tok) {
      fetch(`${URL_BASE}/auth/v1/logout`, {
        method: 'POST',
        headers: authHeaders({ Authorization: 'Bearer ' + tok }),
      }).catch(() => {});
    }
  }

  load();

  window.KHAuth = {
    isAuthed: () => !!session && !isExpired(),
    token: () => (session && !isExpired() ? session.access_token : null),
    anonKey: ANON_KEY,
    signIn,
    signOut,
    refresh,
  };
})();
