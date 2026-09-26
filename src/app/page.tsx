"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { RevealCard } from "@/components/motion";
import { useViewport } from "@/lib/viewport";

// 手機／電腦模式分流點：目前兩邊都是同一個 LandingPageCore，長得一樣。
export default function LandingPage() {
  return useViewport() === "mobile" ? <MobileLandingPage /> : <DesktopLandingPage />;
}

function MobileLandingPage() {
  return <LandingPageCore />;
}

function DesktopLandingPage() {
  return <LandingPageCore />;
}

function LandingPageCore() {
  const { data: session, status } = useSession();
  const router = useRouter();

  function go(path: string) {
    if (!session) {
      // 未登入：先跑 Google 登入，成功後直接跳到目標頁面，不用回來再點一次
      signIn("google", { callbackUrl: path });
      return;
    }
    router.push(path);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight text-accent">志願分組</h1>
        <p className="mx-auto max-w-sm text-sm text-muted">
          依志願序與渴望度自動分配職位。組員不需要帳號就能填寫；主辦方登入 Google 帳號建立與管理活動，
          之後不管換到哪個裝置都找得回自己建立的活動。
        </p>
      </div>

      <RevealCard className="w-full max-w-sm space-y-3">
        {status === "loading" ? (
          <p className="text-sm text-muted">載入中…</p>
        ) : session ? (
          <p className="text-sm text-muted">
            以 <span className="font-medium text-foreground">{session.user.name ?? session.user.email}</span> 的身分登入中
          </p>
        ) : (
          <p className="text-sm text-muted">建立活動需要先用 Google 帳號登入</p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={() => go("/activities")} className="btn btn-ghost flex-1 py-3">
            查看已建立的活動
          </button>
          <button type="button" onClick={() => go("/create")} className="btn btn-primary flex-1 py-3">
            建立活動
          </button>
        </div>
      </RevealCard>
    </div>
  );
}
