"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminAiAssistant from "@/components/admin/AdminAiAssistant";

const NAV = [
  { href: "/admin", label: "總覽", ic: "▦" },
  { href: "/admin/customers", label: "客戶知識庫", ic: "◉" },
  { href: "/admin/knowledge", label: "服務知識庫", ic: "⌕" },
  { href: "/admin/followups", label: "追蹤與回訪", ic: "✓" },
  { href: "/admin/cases", label: "收稿案件", ic: "▤" },
  { href: "/admin/orders", label: "所有工單", ic: "▥" },
  { href: "/admin/scan", label: "掃描站", ic: "▣" },
  { href: "/admin/site-images", label: "網站圖片", ic: "▧" },
  { href: "/admin/users", label: "管理員帳號", ic: "♙" },
];

// 後台外殼：桌機左側固定功能列；手機收成抽屜（頂端漢堡開關）。
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // 換頁自動關抽屜
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.replace("/admin/login");
  }

  const current = NAV.find((n) => (n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)));

  return (
    <div className="adm-shell">
      {/* 手機頂端列 */}
      <div className="adm-topbar no-print">
        <button className="adm-burger" onClick={() => setOpen(true)} aria-label="開啟選單">
          ☰
        </button>
        <span className="tt">{current?.label ?? "管理後台"}</span>
      </div>

      {/* 遮罩 */}
      <div className={`adm-overlay no-print${open ? " show" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      {/* 左側功能列 */}
      <aside className={`adm-side no-print${open ? " open" : ""}`}>
        <div className="adm-brand">
          美強光廣告科技
          <span>AI 數位系統 · 後台</span>
        </div>
        <nav className="adm-nav">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <a key={n.href} href={n.href} data-active={active ? "true" : "false"}>
                <span className="ic" aria-hidden="true">
                  {n.ic}
                </span>
                {n.label}
              </a>
            );
          })}
        </nav>
        <button className="adm-logout" onClick={logout}>
          登出
        </button>
      </aside>

      <div className="adm-main">{children}</div>
      <AdminAiAssistant />
    </div>
  );
}
