"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        const next = params.get("next");
        router.replace(next && next.startsWith("/admin") ? next : "/admin");
      } else {
        setError(data.message || "登入失敗，請稍後再試。");
      }
    } catch {
      setError("連線出了點問題，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 8px 30px rgba(20,40,80,.1)" }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#1c1c1e", marginBottom: 4 }}>美強光廣告科技 · 管理後台</div>
        <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>請以管理員帳號登入。</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoFocus
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密碼"
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && (
          <div style={{ fontSize: 14, color: "#c0392b", background: "#fdecea", padding: "10px 14px", borderRadius: 10, marginBottom: 14 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading || !email || !password}
          style={{ width: "100%", border: "none", borderRadius: 12, padding: "12px 20px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", cursor: loading ? "default" : "pointer", opacity: loading || !email || !password ? 0.6 : 1 }}
        >
          {loading ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(0,0,0,.14)",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 15,
  outline: "none",
  marginBottom: 14,
  boxSizing: "border-box",
};

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
