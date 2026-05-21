// lib/supabase.js — data client for the self-hosted FastAPI backend.
// Keeps the historical window.SB interface (selectAll/upsert/remove/patch) and
// the PostgREST-style query strings; the backend (/db/<table>) parses the same
// eq/neq/in + select/order/on_conflict subset. The logged-in operator's JWT is
// sent as a bearer token so the backend can authorize the request.

(function () {
  const API_BASE = 'https://api.sme-ta.ru';
  // Await a fresh token (auto-refreshes if expired) so requests never carry a
  // stale JWT and 401 on it.
  async function headers(extra) {
    const tok = (window.KHAuth && await window.KHAuth.ensureToken()) || '';
    return Object.assign({
      Authorization: 'Bearer ' + tok,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  async function selectAll(table, query) {
    const q = query ? '?' + query : '';
    const r = await fetch(`${API_BASE}/db/${table}${q}`, { headers: await headers() });
    if (!r.ok) throw new Error(`DB select ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function upsert(table, rows, onConflict) {
    const body = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
    const q = onConflict ? '?on_conflict=' + onConflict : '';
    const r = await fetch(`${API_BASE}/db/${table}${q}`, {
      method: 'POST',
      headers: await headers(),
      body,
    });
    if (!r.ok) throw new Error(`DB upsert ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function remove(table, query) {
    const r = await fetch(`${API_BASE}/db/${table}?${query}`, {
      method: 'DELETE',
      headers: await headers(),
    });
    if (!r.ok) throw new Error(`DB delete ${table}: ${r.status} ${await r.text()}`);
    return r.json().catch(() => null);
  }

  async function patch(table, query, body) {
    const r = await fetch(`${API_BASE}/db/${table}?${query}`, {
      method: 'PATCH',
      headers: await headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`DB patch ${table}: ${r.status} ${await r.text()}`);
    return r.json().catch(() => null);
  }

  window.SB = { url: API_BASE, selectAll, upsert, remove, patch };
})();
