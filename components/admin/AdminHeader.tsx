"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/cases", label: "收稿案件" },
  { href: "/admin/users", label: "管理員帳號" },
];

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.replace("/admin/login");
  }

  return (
    <header style={{ background: "#1c1c1e", color: "#fff", padding: "0 20px", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", height: 56, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, marginRight: 12 }}>美強光廣告科技 · 收稿後台</span>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {NAV.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <a
                key={n.href}
                href={n.href}
                style={{
                  fontSize: 14,
                  padding: "7px 13px",
                  borderRadius: 8,
                  color: active ? "#fff" : "rgba(255,255,255,.66)",
                  background: active ? "rgba(255,255,255,.14)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  textDecoration: "none",
                }}
              >
                {n.label}
              </a>
            );
          })}
        </nav>
        <button
          onClick={logout}
          style={{ fontSize: 13, color: "rgba(255,255,255,.8)", background: "transparent", border: "1px solid rgba(255,255,255,.24)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
        >
          登出
        </button>
      </div>
    </header>
  );
}
