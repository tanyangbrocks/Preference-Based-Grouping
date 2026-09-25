"use client";

import { useCallback, useEffect, useState } from "react";
import { api, countdown, formatDeadline, useRemaining, type PublicActivity } from "@/lib/client";
import { acceptableText, MODE_INFO } from "@/lib/modes";
import { RevealCard, RevealItem } from "./motion";

const POLL_MS = 15_000;

/**
 * 讀取活動。活動還在「填寫中」（status === open）時每 15 秒自動重新整理一次，
 * 讓主辦方看得到即時的填寫人數／名單，也能在主辦方按下「執行分組」後盡快看到結果——
 * 截止時間到了本身**不會**觸發任何事，分組完全要主辦方手動執行。
 */
export function useActivity<T extends PublicActivity = PublicActivity>(
  url: string,
  headers?: Record<string, string>,
) {
  const [data, setData] = useState<T | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const headerKey = JSON.stringify(headers ?? {});

  useEffect(() => {
    let alive = true;
    api<T>(url, { headers: JSON.parse(headerKey) }).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setOffset(Date.parse(d.serverNow) - Date.now());
        setError(null);
      },
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [url, headerKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const remaining = useRemaining(data?.deadline, offset);
  const polling = data?.status === "open";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [polling, reload]);

  return { data, error, reload, remaining };
}

export function ActivityHeader({ a, remaining }: { a: PublicActivity; remaining: number | null }) {
  const passed = remaining !== null && remaining <= 0;
  const open = a.status === "open" && !passed;
  const cd = remaining !== null ? countdown(remaining) : null;
  return (
    <RevealCard float className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          open ? "bg-accent-soft text-accent" : "bg-border text-muted"}`}>
          {a.status === "finalized" ? "已分配" : passed ? "已截止" : "填寫中"}
        </span>
        <span className="rounded-full bg-border/70 px-2.5 py-0.5 text-xs text-muted">{MODE_INFO[a.mode].short}模式</span>
        {open && cd && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
            cd.urgent ? "bg-danger/15 text-danger" : "text-muted"}`}>
            {cd.text}
          </span>
        )}
      </div>
      <h1 className="text-2xl font-semibold leading-tight text-accent">{a.title}</h1>
      {a.description && <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.description}</p>}
      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-muted">截止</dt>
          <dd className="tabular-nums">{formatDeadline(a.deadline)}</dd>
        </div>
        <div>
          <dt className="text-muted">已填寫</dt>
          <dd className="tabular-nums">{a.submissionCount} / {a.capacity} 人</dd>
        </div>
      </dl>
      {a.status === "open" && passed && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-danger">
          已截止填寫，正在等待主辦方執行分組（不會自動進行）。
        </p>
      )}
      {a.editedAt && a.status !== "finalized" && (
        <p className="text-xs text-muted">主辦方於 {formatDeadline(a.editedAt)} 修改過活動內容</p>
      )}
    </RevealCard>
  );
}

export function RoleList({ a }: { a: PublicActivity }) {
  return (
    <RevealCard index={2}>
      <h2 className="mb-3 font-semibold text-accent">職位</h2>
      <div className="space-y-2">
        {a.roles.map((r, i) => (
          <RevealItem key={r.id} index={i}
            className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-field/60 px-3 py-2">
            <div>
              <div className="font-medium">{r.name}</div>
              {r.description && <div className="text-sm text-muted">{r.description}</div>}
            </div>
            <span className="shrink-0 text-sm text-muted tabular-nums">人數上限 {r.capacity}</span>
          </RevealItem>
        ))}
      </div>
    </RevealCard>
  );
}

export function ResultView({ a, myName }: { a: PublicActivity; myName?: string }) {
  if (!a.result) return null;
  const byRole = a.roles.map((r) => ({ ...r, members: a.result!.filter((x) => x.roleId === r.id) }));
  return (
    <RevealCard index={1} className="space-y-4">
      <h2 className="font-semibold text-accent">分配結果</h2>
      {a.result.length === 0 && <p className="text-sm text-muted">沒有人填寫。</p>}
      {a.relaxedCount > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">
          大家的志願衝突到不可能讓所有人都落在{acceptableText(a.mode, a.k)}，系統已把放寬的人數降到最少：
          {a.relaxedCount} 人（隨機決定）分到{acceptableText(a.mode, a.k)}之外。
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {byRole.map((r, i) => (
          <RevealItem key={r.id} index={i} className="rounded-xl border border-border bg-field/60 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted tabular-nums">{r.members.length} / {r.capacity}</span>
            </div>
            {r.members.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {r.members.map((m) => (
                  <li key={m.name} className={`rounded-md px-2 py-0.5 text-sm ${
                    m.name === myName ? "bg-accent text-accent-fg" : "bg-accent-soft"}`}>
                    {m.name}
                  </li>
                ))}
              </ul>
            )}
          </RevealItem>
        ))}
      </div>
      <Fairness a={a} />
    </RevealCard>
  );
}

export function Fairness({ a }: { a: PublicActivity }) {
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none">公正性驗證</summary>
      <div className="mt-2 space-y-1 break-all font-mono">
        <p>平手用亂數的 SHA-256（建立活動時就已公開）：{a.seedHash}</p>
        {a.seed && <p>亂數本身（結算後公開）：{a.seed}</p>}
        <p className="font-sans">
          任何人都能計算亂數的 SHA-256，確認結果和建立時公開的一致，代表結算時沒有更換亂數來挑結果。
        </p>
      </div>
    </details>
  );
}

export function Loading({ error }: { error: string | null }) {
  return (
    <p className={`py-16 text-center text-sm ${error ? "text-danger" : "text-muted"}`}>
      {error ?? "載入中…"}
    </p>
  );
}
