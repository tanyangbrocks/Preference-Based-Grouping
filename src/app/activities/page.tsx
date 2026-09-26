"use client";

import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading } from "@/components/activity";
import { CountUp, Tilt } from "@/components/fx";
import { RevealItem } from "@/components/motion";
import { api, ApiError, formatDeadline, type MyActivities } from "@/lib/client";
import { useViewport } from "@/lib/viewport";

type Tab = "all" | "favorites";
type Order = "new" | "old";

// 手機／電腦模式分流點：手機版標籤是上方橫排（畫面窄，直向側欄放不下），
// 電腦版標籤是左側直排（使用者指定的樣子）。這是目前唯一一個手機/電腦真的長不一樣的地方。
export default function MyActivitiesPage() {
  return useViewport() === "mobile" ? <MobileMyActivitiesPage /> : <DesktopMyActivitiesPage />;
}

function useMyActivitiesData() {
  const router = useRouter();
  const { status } = useSession();
  const [rows, setRows] = useState<MyActivities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [order, setOrder] = useState<Order>("new");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const reload = () => api<MyActivities>("/api/activities/mine").then(setRows, (e) => setError((e as Error).message));
  useEffect(() => {
    if (status === "authenticated") reload();
  }, [status]);

  const visible = (rows ?? [])
    .filter((a) => (tab === "favorites" ? a.favorited : true))
    .filter((a) => showArchived || !a.archived)
    .sort((a, b) => (order === "new" ? 1 : -1) * (Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  const ongoing = visible.filter((a) => a.status !== "finalized");
  const finished = visible.filter((a) => a.status === "finalized");
  const archivedCount = (rows ?? []).filter((a) => a.archived && (tab === "all" || a.favorited)).length;

  async function mutate(id: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      reload();
    } catch (e) {
      alert((e instanceof ApiError ? e.message : "操作失敗") + `（活動 ${id}）`);
    }
  }

  return {
    status, rows, error, tab, setTab, order, setOrder, showArchived, setShowArchived,
    ongoing, finished, archivedCount, mutate,
  };
}

function MobileMyActivitiesPage() {
  const s = useMyActivitiesData();
  if (s.status !== "authenticated" || !s.rows) return <Loading error={s.error} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-accent">我的活動</h1>
      <UnderlineTabs tab={s.tab} onChange={s.setTab} className="flex gap-6 border-b border-border" />
      <ListControls {...s} />
      <ActivityGroups {...s} />
    </div>
  );
}

function DesktopMyActivitiesPage() {
  const s = useMyActivitiesData();
  if (s.status !== "authenticated" || !s.rows) return <Loading error={s.error} />;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-5">
      <UnderlineTabs tab={s.tab} onChange={s.setTab} className="flex flex-col items-start gap-3 pt-2" />
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-accent">我的活動</h1>
        <ListControls {...s} />
        <ActivityGroups {...s} />
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "所有活動" },
  { id: "favorites", label: "★ 我的最愛" },
];

/**
 * 頁籤：沿用作品集右上角導覽列的底線設計（C:\Portfolio\src\components\site-header.tsx）——
 * 只有選中的頁籤底下有一條 2px 細線，切換時用 framer-motion 的 layoutId 共用版面動畫，
 * 讓線條以彈簧動畫滑到新頁籤底下，文字本身不加粗、不換底色。
 * 手機版橫排（外層加底線，細線疊在上面），電腦版直排在左側，排列方式由 className 決定。
 */
function UnderlineTabs({ tab, onChange, className }: { tab: Tab; onChange: (t: Tab) => void; className: string }) {
  return (
    <nav role="tablist" aria-label="活動分類" className={className}>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(t.id)}
            className={`tap-bounce relative pb-2 text-sm ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}>
            {t.label}
            {active && (
              <motion.span layoutId="tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function ListControls(s: ReturnType<typeof useMyActivitiesData>) {
  return (
    <div className="flex items-center justify-between text-sm">
      <label className="flex items-center gap-1.5 text-muted">
        <input type="checkbox" checked={s.showArchived} onChange={(e) => s.setShowArchived(e.target.checked)} />
        顯示已封存{s.archivedCount > 0 && `（${s.archivedCount}）`}
      </label>
      <select value={s.order} onChange={(e) => s.setOrder(e.target.value as Order)}
        className="input w-auto py-1 text-sm" aria-label="排序方式">
        <option value="new">建立時間：新到舊</option>
        <option value="old">建立時間：舊到新</option>
      </select>
    </div>
  );
}

function ActivityGroups(s: ReturnType<typeof useMyActivitiesData>) {
  if (s.ongoing.length === 0 && s.finished.length === 0) {
    return (
      <p className="card text-center text-sm text-muted">
        這裡還沒有活動。{s.archivedCount > 0 && !s.showArchived && `（有 ${s.archivedCount} 個已封存的活動被隱藏）`}
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {s.ongoing.length > 0 && <Section title="進行中" rows={s.ongoing} mutate={s.mutate} />}
      {s.finished.length > 0 && <Section title="已結束" rows={s.finished} mutate={s.mutate} />}
    </div>
  );
}

function Section({ title, rows, mutate }: {
  title: string;
  rows: MyActivities;
  mutate: (id: string, fn: () => Promise<unknown>) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted">{title}（{rows.length}）</h2>
      <ul className="space-y-2">
        {rows.map((a, i) => (
          <RevealItem key={a.id} index={i} float={false}>
            <Tilt max={3}>
              <ActivityRow a={a} mutate={mutate} />
            </Tilt>
          </RevealItem>
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ a, mutate }: { a: MyActivities[number]; mutate: (id: string, fn: () => Promise<unknown>) => void }) {
  const router = useRouter();
  return (
    <li className={`card flex items-center gap-3 py-3 ${a.archived ? "opacity-60" : ""}`}>
      <button type="button" onClick={() => router.push(`/a/${a.id}/host`)}
        className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{a.title}</span>
          {a.archived && <span className="shrink-0 rounded bg-border px-1.5 py-0.5 text-xs text-muted">已封存</span>}
        </div>
        <div className="text-xs text-muted">
          截止 {formatDeadline(a.deadline)} · 已填 <CountUp value={a.submissionCount} />/{a.capacity} 人
        </div>
      </button>
      <button type="button" aria-label="切換我的最愛"
        onClick={() => mutate(a.id, () => api(`/api/activities/${a.id}/favorite`, {
          method: "PATCH", body: JSON.stringify({ favorited: !a.favorited }) }))}
        className={`tap-bounce shrink-0 text-xl ${a.favorited ? "text-accent" : "text-border hover:text-muted"}`}>
        ★
      </button>
      <button type="button" className="btn btn-ghost shrink-0 px-2 text-xs"
        onClick={() => mutate(a.id, () => api(`/api/activities/${a.id}/archive`, {
          method: "PATCH", body: JSON.stringify({ archived: !a.archived }) }))}>
        {a.archived ? "取消封存" : "封存"}
      </button>
      <button type="button" className="btn btn-ghost shrink-0 px-2 text-xs text-danger"
        onClick={() => {
          if (!window.confirm(`確定要永久刪除「${a.title}」嗎？所有人的填寫紀錄也會一起刪掉，無法復原。`)) return;
          mutate(a.id, () => api(`/api/activities/${a.id}`, { method: "DELETE" }));
        }}>
        刪除
      </button>
    </li>
  );
}
