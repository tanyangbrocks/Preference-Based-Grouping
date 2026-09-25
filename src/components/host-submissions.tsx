"use client";

import { formatDeadline, type HostSubmissions } from "@/lib/client";
import { RevealCard, RevealItem } from "./motion";

/** 主辦方專用：已填寫名單（誰填了、什麼時候填的）。不含志願內容，隨時可看。 */
export function HostSubmissionsList({ list }: { list: HostSubmissions }) {
  return (
    <RevealCard index={2} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-accent">已填寫名單</h2>
        <span className="text-sm text-muted tabular-nums">{list.length} 人</span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">還沒有人填寫。</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((s, i) => (
            <RevealItem key={s.name} index={i} float={false}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-field/60 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{s.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {formatDeadline(s.submittedAt)}
                {s.edited && <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-accent">已修改</span>}
              </span>
            </RevealItem>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        只看得到誰填了、什麼時候填的；每個人實際填了什麼，要等執行分組後才看得到分組明細。
      </p>
    </RevealCard>
  );
}
