// lib/auth.js — operator login against the self-hosted FastAPI backend.
// Replaces Supabase Auth: /auth/login returns a JWT pair, stored in
// localStorage. lib/supabase.js sends the access token as a bearer so the
// backend authorizes operator data calls. window.KHAuth keeps its old shape.

(function () {
  const API_BASE = 'https://api.sme-ta.ru';
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

  async function signIn(email, password) {
    const r = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data.detail || data.message || `Ошибка входа (${r.status})`);
    }
    save({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + 3600),
    });
    return true;
  }

  async function refresh() {
    if (!session || !session.refresh_token) return false;
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) { save(null); return false; }
    save({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + 3600),
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

  // True when the token is gone, expired, or within 60s of expiring.
  function needsRefresh() {
    return !session || !session.expires_at || session.expires_at * 1000 - Date.now() <= 60_000;
  }

  // Returns a usable access token, refreshing first if it's expired/expiring.
  // Data calls await this so a stale token never produces a 401.
  let refreshing = null;
  async function ensureToken() {
    if (session && !needsRefresh()) return session.access_token;
    if (session && session.refresh_token) {
      if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
      await refreshing;
    }
    return session && !isExpired() ? session.access_token : null;
  }

  async function signOut() {
    const tok = session && session.access_token;
    save(null);
    if (tok) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok },
      }).catch(() => {});
    }
  }

  load();

  window.KHAuth = {
    isAuthed: () => !!session && !isExpired(),
    token: () => (session && !isExpired() ? session.access_token : null),
    ensureToken,
    signIn,
    signOut,
    refresh,
  };
})();
