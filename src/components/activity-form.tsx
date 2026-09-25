"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { RevealCard } from "@/components/motion";
import { MODE_INFO, type Mode } from "@/lib/modes";

export interface ActivityFormValues {
  title: string;
  description: string;
  deadline: string; // ISO
  mode: Mode;
  roles: { id?: string; name: string; description: string; capacity: number }[];
}

interface RoleDraft {
  key: number;
  id?: string;
  name: string;
  description: string;
  capacity: number;
}

/** ISO → <input type="datetime-local"> 需要的本地時間字串 */
function toLocalInput(d: Date) {
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function defaultDeadline() {
  const d = new Date(Date.now() + 3 * 86400_000);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d);
}

let nextKey = 0;
const blankRole = (): RoleDraft => ({ key: nextKey++, name: "", description: "", capacity: 1 });

/** 建立活動與主辦方後台編輯共用的表單 */
export function ActivityForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  notice,
}: {
  initial?: ActivityFormValues;
  submitLabel: string;
  busyLabel: string;
  /** 丟出錯誤會顯示在表單下方 */
  onSubmit: (values: ActivityFormValues) => Promise<void>;
  onCancel?: () => void;
  notice?: React.ReactNode;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deadline, setDeadline] = useState(() =>
    initial ? toLocalInput(new Date(initial.deadline)) : defaultDeadline(),
  );
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "bid");
  const [roles, setRoles] = useState<RoleDraft[]>(() =>
    initial ? initial.roles.map((r) => ({ ...r, key: nextKey++ })) : [blankRole(), blankRole(), blankRole()],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalCap = roles.reduce((s, r) => s + (Number(r.capacity) || 0), 0);
  const k = Math.ceil(roles.length / 2);

  const update = (key: number, patch: Partial<RoleDraft>) =>
    setRoles((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        title,
        description,
        deadline: new Date(deadline).toISOString(),
        mode,
        roles: roles.map(({ id, name, description, capacity }) => ({ id, name, description, capacity })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <RevealCard className="space-y-4">
        <div>
          <label className="label" htmlFor="title">活動名稱</label>
          <input id="title" className="input" required maxLength={100} value={title}
            onChange={(e) => setTitle(e.target.value)} placeholder="例：期末專題分工" />
        </div>
        <div>
          <label className="label" htmlFor="desc">敘述</label>
          <textarea id="desc" className="input min-h-24" maxLength={2000} value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder="活動內容、各職位要做的事…" />
        </div>
        <div>
          <label className="label" htmlFor="deadline">填寫截止時間</label>
          <input id="deadline" type="datetime-local" className="input" required value={deadline}
            onChange={(e) => setDeadline(e.target.value)} />
          <p className="mt-1 text-xs text-muted">截止前可以在主辦方後台修改</p>
        </div>
      </RevealCard>

      <RevealCard index={1} className="space-y-3">
        <h2 className="font-semibold text-accent">填寫模式</h2>
        <div className="grid gap-2" role="radiogroup" aria-label="填寫模式">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <label key={m}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                mode === m ? "border-accent bg-accent-soft" : "border-border bg-field/60 hover:bg-accent-soft/50"}`}>
              <input type="radio" name="mode" value={m} checked={mode === m}
                onChange={() => setMode(m)} className="mt-1 accent-[var(--accent)]" />
              <span>
                <span className="block font-medium">{MODE_INFO[m].label}</span>
                <span className="block text-sm text-muted">{MODE_INFO[m].desc}</span>
              </span>
            </label>
          ))}
        </div>
      </RevealCard>

      <RevealCard index={2} className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-accent">職位</h2>
          <span className="text-sm text-muted">總名額 {totalCap} 人</span>
        </div>
        {notice}
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {roles.map((r, i) => (
              <motion.li key={r.key} layout
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                className="rounded-xl border border-border bg-field/60 p-3">
                <div className="flex gap-2">
                  <input className="input min-w-0 flex-1" required maxLength={40} value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    placeholder={`職位 ${i + 1}，例：美術`} aria-label={`職位 ${i + 1} 名稱`} />
                  <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                    人數上限
                    <input type="number" className="input w-16 px-1.5 text-center" min={1} max={100} required
                      value={r.capacity} aria-label={`職位 ${i + 1} 人數上限`}
                      onChange={(e) => update(r.key, { capacity: Number(e.target.value) })} />
                  </label>
                  <button type="button" className="btn btn-ghost px-3" disabled={roles.length <= 2}
                    onClick={() => setRoles((rs) => rs.filter((x) => x.key !== r.key))} aria-label="刪除職位">
                    ✕
                  </button>
                </div>
                <input className="input mt-2 text-sm" maxLength={200} value={r.description}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  placeholder="說明（選填）" aria-label={`職位 ${i + 1} 說明`} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <button type="button" className="btn btn-ghost w-full" disabled={roles.length >= 20}
          onClick={() => setRoles((rs) => [...rs, blankRole()])}>
          ＋ 新增職位
        </button>
        <p className="text-xs text-muted">
          {mode === "bid" && <>{roles.length} 個職位 → 每人有 {Math.ceil((roles.length * 3) / 2)} 點渴望度；只要有任何可能，每個人都會分到自己的前 {k} 志願之一。</>}
          {mode === "tier" && <>{roles.length} 個職位 → 每個職位選 1～3 級渴望度；只要有任何可能，每個人都會分到自己的前 {k} 志願之一。</>}
          {mode === "pick" && <>只要有任何可能，每個人都會分到自己的第一志願或有勾選的職位。</>}
          {" "}同一職位可以多人擔任；各職位人數上限加總就是可加入的人數上限。
        </p>
      </RevealCard>

      {error && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" className="btn btn-ghost flex-1 py-3 text-base" onClick={onCancel} disabled={busy}>
            取消
          </button>
        )}
        <button type="submit" className="btn btn-primary flex-[2] py-3 text-base" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
