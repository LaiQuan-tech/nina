import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "管理後台",
  robots: { index: false, follow: false },
};

// 無 chrome 容器；登入頁與各已登入頁共用（各頁自放 AdminHeader）。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>{children}</div>;
}
