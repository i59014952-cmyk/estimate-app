// Login.jsx — gate screen shown until a Supabase session exists.
function Login({ onSuccess }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await window.KHAuth.signIn(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(String(err && err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const field = {
    width: "100%", padding: "12px 14px", fontSize: 15, fontFamily: "inherit",
    border: "1px solid var(--rule, #d9cdb6)", borderRadius: 8, background: "var(--paper, #fff)",
    color: "var(--ink, #1f1a15)", outline: "none", boxSizing: "border-box",
  };

  return (
    <div className="kh-login">
      <div className="kh-login__bg" aria-hidden="true" />
      <div className="kh-login__grid" aria-hidden="true" />
      <form onSubmit={submit} className="kh-login__card" style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="kh-login__logo" style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <KubLogo size={150} draw />
        </div>
        <input style={field} className="kh-login__in" type="text" placeholder="Логин" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input style={field} className="kh-login__in" type="password" placeholder="Пароль" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <div style={{ color: "#a44a3f", fontSize: 13 }}>{error}</div> : null}
        <button type="submit" disabled={busy} className="kh-login__in" style={{
          padding: "12px 14px", fontSize: 15, fontFamily: "inherit", fontWeight: 600,
          border: 0, borderRadius: 8, cursor: busy ? "default" : "pointer",
          background: "var(--ink, #1f1a15)", color: "var(--paper, #f4efe4)", opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
