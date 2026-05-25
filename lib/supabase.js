// lib/supabase.js — минимальный REST-клиент для Supabase (без SDK).
// Ключ publishable — публичный (можно держать в коде).

(function () {
  const URL_BASE = 'https://jvqogyyjlrwbjjotxvue.supabase.co';
  const KEY = 'sb_publishable_Yud_fsFEOxUAiPboEqVO1g_17BKYlDh';
  // apikey is always the publishable key (required by the gateway); the bearer
  // is the logged-in user's JWT when available, so RLS sees role=authenticated.
  const bearer = () => (window.KHAuth && window.KHAuth.token()) || KEY;
  const headers = (extra) => Object.assign({
    apikey: KEY,
    Authorization: 'Bearer ' + bearer(),
    'Content-Type': 'application/json',
  }, extra || {});

  async function selectAll(table, query) {
    const q = query ? '?' + query : '';
    const r = await fetch(`${URL_BASE}/rest/v1/${table}${q}`, { headers: headers() });
    if (!r.ok) throw new Error(`SB select ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function upsert(table, rows, onConflict) {
    const body = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
    const q = onConflict ? '?on_conflict=' + onConflict : '';
    const r = await fetch(`${URL_BASE}/rest/v1/${table}${q}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body,
    });
    if (!r.ok) throw new Error(`SB upsert ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function remove(table, query) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=representation' }),
    });
    if (!r.ok) throw new Error(`SB delete ${table}: ${r.status} ${await r.text()}`);
    return r.json().catch(() => null);
  }

  async function patch(table, query, body) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`SB patch ${table}: ${r.status} ${await r.text()}`);
    return r.json().catch(() => null);
  }

  window.SB = { url: URL_BASE, selectAll, upsert, remove, patch };
})();
