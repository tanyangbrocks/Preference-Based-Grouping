"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ActivityForm } from "@/components/activity-form";
import { Loading } from "@/components/activity";
import { api, hostKey, storage } from "@/lib/client";
import { useViewport } from "@/lib/viewport";

// 手機／電腦模式分流點：目前兩邊都是同一個 CreatePageCore，長得一樣。
// 之後想讓某一邊長不同，就直接改對應的 MobileCreatePage / DesktopCreatePage。
export default function CreatePage() {
  return useViewport() === "mobile" ? <MobileCreatePage /> : <DesktopCreatePage />;
}

function MobileCreatePage() {
  return <CreatePageCore />;
}

function DesktopCreatePage() {
  return <CreatePageCore />;
}

function CreatePageCore() {
  const router = useRouter();
  const { status } = useSession();

  // 建立活動要求登入（見 docs/plan-slots-and-accounts.md §二 S1）；沒登入就是被直接連結
  // 打開這個網址，導回首頁讓他從「建立活動」按鈕走一次登入流程。
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  if (status !== "authenticated") return <Loading error={null} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-accent">發起分組活動</h1>
        <p className="mt-1 text-sm text-muted">
          組員會排出各職位的志願序並分配渴望度，截止後系統自動分配。截止前你看不到任何人的填寫內容；結算後可在後台看到每人分到第幾志願與押注。分配結果無法更改。
        </p>
      </div>
      <ActivityForm
        submitLabel="建立活動並取得邀請連結"
        busyLabel="建立中…"
        onSubmit={async (values) => {
          const res = await api<{ id: string; hostToken: string }>("/api/activities", {
            method: "POST",
            body: JSON.stringify(values),
          });
          storage.set(hostKey(res.id), res.hostToken);
          router.push(`/a/${res.id}/host#t=${res.hostToken}`);
        }}
      />
    </div>
  );
}
