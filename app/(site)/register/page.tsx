import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/member/AuthForm";

export const metadata: Metadata = {
  title: "會員註冊｜美強光廣告科技",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">MEMBER</p>
      <h1>建立會員帳號</h1>
      <p>設好密碼之後，換手機、換電腦都能登入查看自己的發稿紀錄。</p>
      <Suspense fallback={<div style={{ height: 420 }} />}>
        <AuthForm mode="register" />
      </Suspense>
    </section>
  );
}
