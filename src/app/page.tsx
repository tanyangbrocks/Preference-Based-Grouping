"use client";

import { useRouter } from "next/navigation";
import { ActivityForm } from "@/components/activity-form";
import { api, hostKey, storage } from "@/lib/client";

export default function CreatePage() {
  const router = useRouter();

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
