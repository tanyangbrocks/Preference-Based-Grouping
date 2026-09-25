"use client";

import type { HostDetail, PublicActivity } from "@/lib/client";
import { RevealCard, RevealItem } from "./motion";

/** 主辦方後台：結算後的分組明細與分配過程紀錄 */
export function HostDetailView({ a, detail }: { a: PublicActivity; detail: HostDetail }) {
  const roleName = (id: string) => a.roles.find((r) => r.id === id)?.name ?? id;
  const byRank = new Map<number, number>();
  for (const r of detail.rows) byRank.set(r.rank, (byRank.get(r.rank) ?? 0) + 1);

  return (
    <>
      <RevealCard index={2} className="space-y-4">
        <div>
          <h2 className="font-semibold text-accent">分組明細</h2>
          <p className="mt-1 text-xs text-muted">
            僅主辦方可見。只顯示每人分到的職位是第幾志願、在該志願押了幾點；其他志願的排序不會顯示。
          </p>
        </div>

        {detail.rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[...byRank.entries()].sort(([x], [y]) => x - y).map(([rank, n]) => (
              <span key={rank}
                className={`rounded-full px-3 py-1 text-sm ${rank > detail.k ? "bg-warn-soft text-danger" : "bg-accent-soft"}`}>
                第 {rank} 志願 <strong className="tabular-nums">{n}</strong> 人
              </span>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border" data-no-bounce>
          <table className="w-full text-sm">
            <thead className="bg-field/70 text-left text-muted">
              <tr>
                <th className="px-2.5 py-2 font-medium">組員</th>
                <th className="px-2.5 py-2 font-medium">職位</th>
                <th className="px-2.5 py-2 font-medium">志願</th>
                <th className="px-2.5 py-2 text-right font-medium">押注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.rows.map((r) => (
                <tr key={r.name} className="bg-field/30">
                  <td className="px-2.5 py-2 font-medium">{r.name}</td>
                  <td className="px-2.5 py-2">{roleName(r.roleId)}</td>
                  <td className="px-2.5 py-2 tabular-nums">
                    <span className="whitespace-nowrap">第 {r.rank}</span>
                    {r.outsideK && (
                      <span className="mt-0.5 block w-fit whitespace-nowrap rounded bg-warn-soft px-1.5 py-0.5 text-xs text-danger">
                        降低標準
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                    {r.desire} <span className="text-muted">/ {detail.budget}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RevealCard>

      <RevealCard index={3} className="space-y-3">
        <h2 className="font-semibold text-accent">分配過程紀錄</h2>
        {!detail.hasEventLog ? (
          <p className="text-sm text-muted">這個活動在紀錄功能上線前就已結算，沒有過程紀錄。</p>
        ) : detail.events.length === 0 ? (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
            ✓ 沒有發生抽籤、讓位或降低標準的情況，全部依志願序與渴望度直接決定。
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.events.map((e, i) => (
              <RevealItem key={i} index={i} float={false}
                className="rounded-xl border border-border bg-field/60 px-3 py-2 text-sm">
                <EventLine e={e} roleName={roleName} k={detail.k} />
              </RevealItem>
            ))}
          </ul>
        )}
      </RevealCard>
    </>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "random" | "warn" | "info" }) {
  const cls = { random: "bg-accent-soft text-accent", warn: "bg-warn-soft text-danger", info: "bg-border text-muted" }[tone];
  return <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function EventLine({ e, roleName, k }: {
  e: HostDetail["events"][number];
  roleName: (id: string) => string;
  k: number;
}) {
  switch (e.type) {
    case "tie":
      return (
        <p>
          <Tag tone="random">🎲 同分抽籤</Tag>
          第 {e.round} 志願輪・<strong>{roleName(e.roleId)}</strong>：
          {[...e.winners, ...e.losers].join("、")} 都押了 {e.desire} 點，名額不足，
          由 <strong>{e.winners.join("、")}</strong> 抽中；{e.losers.join("、")} 改由後面的志願分配。
        </p>
      );
    case "yield":
      return (
        <p>
          <Tag tone="info">讓位</Tag>
          第 {e.round} 志願輪・<strong>{roleName(e.roleId)}</strong>：{e.memberId}（押 {e.desire} 點）本來排得上，
          但若這樣分配，會讓其他人落到前 {k} 志願之外，因此改由後面的志願分配。
        </p>
      );
    case "relax":
      return (
        <p>
          <Tag tone="warn">🎲 降低標準</Tag>
          大家的志願衝突到不可能讓所有人都在前 {k} 志願內，已把人數降到最少：
          <strong>{e.memberIds.join("、")}</strong>（依公開亂數隨機選出）可以被分到前 {k} 志願之外。
        </p>
      );
    case "fallback":
      return (
        <p>
          <Tag tone="info">保底安排</Tag>
          {e.memberIds.join("、")} 在逐輪分配後仍未分到，由系統在可接受範圍內直接安排。
        </p>
      );
  }
}
