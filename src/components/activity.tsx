"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatDeadline, formatRemaining, useRemaining, type PublicActivity } from "@/lib/client";

/** 讀取活動；截止或結算中時自動重新整理 */
export function useActivity(url: string, headers?: Record<string, string>) {
  const [data, setData] = useState<PublicActivity | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const headerKey = JSON.stringify(headers ?? {});

  useEffect(() => {
    let alive = true;
    api<PublicActivity>(url, { headers: JSON.parse(headerKey) }).then(
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
  const due = remaining !== null && remaining <= 0 && data?.status !== "finalized";
  useEffect(() => {
    if (!due) return;
    const first = setTimeout(reload, 300);
    const t = setInterval(reload, 2500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [due, reload]);

  return { data, error, reload, remaining };
}

export function ActivityHeader({ a, remaining }: { a: PublicActivity; remaining: number | null }) {
  const open = a.status !== "finalized" && (remaining ?? 1) > 0;
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          open ? "bg-accent-soft text-accent" : "bg-border text-muted"}`}>
          {a.status === "finalized" ? "已分配" : open ? "填寫中" : "分配中…"}
        </span>
        {open && remaining !== null && (
          <span className="text-xs text-muted tabular-nums">{formatRemaining(remaining)}</span>
        )}
      </div>
      <h1 className="text-2xl font-semibold leading-tight">{a.title}</h1>
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
    </section>
  );
}

export function RoleList({ a }: { a: PublicActivity }) {
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">職位</h2>
      <ul className="divide-y divide-border">
        {a.roles.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
            <div>
              <div className="font-medium">{r.name}</div>
              {r.description && <div className="text-sm text-muted">{r.description}</div>}
            </div>
            <span className="shrink-0 text-sm text-muted tabular-nums">{r.capacity} 人</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ResultView({ a, myName }: { a: PublicActivity; myName?: string }) {
  if (!a.result) return null;
  const byRole = a.roles.map((r) => ({ ...r, members: a.result!.filter((x) => x.roleId === r.id) }));
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">分配結果</h2>
      {a.result.length === 0 && <p className="text-sm text-muted">沒有人填寫。</p>}
      {a.effectiveK !== null && a.effectiveK > a.k && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">
          因志願衝突無法讓所有人都落在前 {a.k} 志願，本次放寬至前 {a.effectiveK} 志願。
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {byRole.map((r) => (
          <div key={r.id} className="rounded-xl border border-border p-3">
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
          </div>
        ))}
      </div>
      <Fairness a={a} />
    </section>
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
