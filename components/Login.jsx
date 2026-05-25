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
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <style>{LOGIN_CSS}</style>
      <div className="login-bg" aria-hidden="true">
        <span className="login-blob login-blob--1" />
        <span className="login-blob login-blob--2" />
        <span className="login-blob login-blob--3" />
      </div>
      <form onSubmit={submit} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="login-anim" style={{ display: "flex", justifyContent: "center", marginBottom: 18, animationDelay: "0s" }}>
          <div className="login-logo-float"><KubLogo size={104} animate /></div>
        </div>
        <input className="login-anim" style={{ ...field, animationDelay: ".12s" }} type="text" placeholder="Логин" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input className="login-anim" style={{ ...field, animationDelay: ".2s" }} type="password" placeholder="Пароль" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <div style={{ color: "#a44a3f", fontSize: 13 }}>{error}</div> : null}
        <button className="login-anim" type="submit" disabled={busy} style={{
          padding: "12px 14px", fontSize: 15, fontFamily: "inherit", fontWeight: 600,
          border: 0, borderRadius: 8, cursor: busy ? "default" : "pointer",
          background: "var(--ink, #1f1a15)", color: "var(--paper, #f4efe4)", opacity: busy ? 0.6 : 1,
          animationDelay: ".28s",
        }}>
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

const LOGIN_CSS = `
@keyframes login-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes kub-roof-draw { from { stroke-dashoffset: 120; } to { stroke-dashoffset: 0; } }
@keyframes kub-chimney-in { 0%, 35% { opacity: 0; transform: translateY(-4px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes login-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes login-drift-1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(40px, -30px) scale(1.08); } }
@keyframes login-drift-2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-50px, 30px) scale(1.1); } }
@keyframes login-drift-3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, 40px) scale(1.05); } }
.login-anim { opacity: 0; animation: login-fade-up .7s cubic-bezier(.21,.6,.35,1) both; }
.login-logo-float { animation: login-float 6s ease-in-out infinite; animation-delay: 1.1s; }
.kub-roof-draw { stroke-dasharray: 120; stroke-dashoffset: 120; animation: kub-roof-draw 1.1s cubic-bezier(.6,.05,.2,1) .15s forwards; }
.kub-chimney-in { transform-origin: center; transform-box: fill-box; animation: kub-chimney-in 1.2s ease both .15s; }
.login-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.login-blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .5; will-change: transform; }
.login-blob--1 { width: 420px; height: 420px; top: -80px; left: -60px; background: radial-gradient(circle at 30% 30%, var(--rust, #b9543f), transparent 70%); opacity: .14; animation: login-drift-1 18s ease-in-out infinite; }
.login-blob--2 { width: 500px; height: 500px; bottom: -120px; right: -80px; background: radial-gradient(circle at 60% 40%, var(--ink, #1f1a15), transparent 70%); opacity: .07; animation: login-drift-2 22s ease-in-out infinite; }
.login-blob--3 { width: 360px; height: 360px; top: 40%; left: 55%; background: radial-gradient(circle at 50% 50%, var(--rust, #b9543f), transparent 70%); opacity: .08; animation: login-drift-3 26s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .login-anim, .login-logo-float, .kub-roof-draw, .kub-chimney-in, .login-blob { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; }
}
`;
