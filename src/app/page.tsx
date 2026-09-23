"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RevealCard } from "@/components/motion";
import { api, hostKey, storage } from "@/lib/client";

interface RoleDraft {
  key: number;
  name: string;
  description: string;
  capacity: number;
}

function defaultDeadline() {
  const d = new Date(Date.now() + 3 * 86400_000);
  d.setHours(23, 59, 0, 0);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

let nextKey = 0;
const blankRole = (name = ""): RoleDraft => ({ key: nextKey++, name, description: "", capacity: 1 });

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [roles, setRoles] = useState<RoleDraft[]>(() => [blankRole(), blankRole(), blankRole()]);
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
      const res = await api<{ id: string; hostToken: string }>("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          deadline: new Date(deadline).toISOString(),
          roles: roles.map(({ name, description, capacity }) => ({ name, description, capacity })),
        }),
      });
      storage.set(hostKey(res.id), res.hostToken);
      router.push(`/a/${res.id}/host#t=${res.hostToken}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-accent">發起分組活動</h1>
        <p className="mt-1 text-sm text-muted">
          組員會排出各職位的志願序並分配渴望度，截止後系統自動分配。你看不到任何人的填寫內容，也無法更改結果。
        </p>
      </div>

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
          <p className="mt-1 text-xs text-muted">建立後無法修改</p>
        </div>
      </RevealCard>

      <RevealCard index={1} className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-accent">職位</h2>
          <span className="text-sm text-muted">總名額 {totalCap} 人</span>
        </div>
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
                <input className="input flex-1" required maxLength={40} value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  placeholder={`職位 ${i + 1}，例：美術`} aria-label={`職位 ${i + 1} 名稱`} />
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-sm text-muted">最多</span>
                  <input type="number" className="input w-16 px-1.5 text-center" min={1} max={100} required
                    value={r.capacity} aria-label={`職位 ${i + 1} 最多人數`}
                    onChange={(e) => update(r.key, { capacity: Number(e.target.value) })} />
                  <span className="text-sm text-muted">人</span>
                </div>
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
          {roles.length} 個職位 → 每人有 {Math.ceil((roles.length * 3) / 2)} 點渴望度；只要有任何可能，每個人都會分到自己的前 {k} 志願之一。
          同一職位可以多人擔任，「最多 N 人」就是該職位的上限；各職位上限加總就是可加入的人數上限。
        </p>
      </RevealCard>

      {error && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={busy}>
        {busy ? "建立中…" : "建立活動並取得邀請連結"}
      </button>
    </form>
  );
}
