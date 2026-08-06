import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/member/AuthForm";

export const metadata: Metadata = {
  title: "會員登入｜美強光廣告科技",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">MEMBER</p>
      <h1>會員登入</h1>
      <p>用手機號碼與密碼登入，就能查看自己的發稿紀錄與進度。</p>
      <Suspense fallback={<div style={{ height: 320 }} />}>
        <AuthForm mode="login" />
      </Suspense>
    </section>
  );
}
