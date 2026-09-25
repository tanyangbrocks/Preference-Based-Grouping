"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { ActivityHeader, Loading, ResultView, useActivity } from "@/components/activity";
import { desireBudget, type Pref } from "@/lib/assign";
import { Pop, RevealCard } from "@/components/motion";
import { api, memberKey, storage, type PublicActivity } from "@/lib/client";
import { MODE_INFO, rankLabel } from "@/lib/modes";
import { useViewport } from "@/lib/viewport";

interface MySubmission {
  submission: { displayName: string; prefs: Pref[]; updatedAt: string } | null;
  assignment?: { roleId: string; rank: number } | null;
}

// 手機／電腦模式分流點：目前兩邊都是同一個 MemberPageCore，長得一樣。
// 之後想讓某一邊長不同，就直接改對應的 MobileMemberPage / DesktopMemberPage。
export default function MemberPage() {
  return useViewport() === "mobile" ? <MobileMemberPage /> : <DesktopMemberPage />;
}

function MobileMemberPage() {
  return <MemberPageCore />;
}

function DesktopMemberPage() {
  return <MemberPageCore />;
}

function MemberPageCore() {
  const { id } = useParams<{ id: string }>();
  const { data: a, error, remaining, reload } = useActivity(`/api/activities/${id}`);
  const [fetched, setMine] = useState<MySubmission | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // 組員權杖存在 localStorage，必須在掛載後讀取
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(storage.get(memberKey(id)));
  }, [id]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api<MySubmission>(`/api/activities/${id}/submission`, { headers: { "x-member-token": token } })
      .then((d) => alive && setMine(d))
      .catch(() => alive && setMine({ submission: null }));
    return () => {
      alive = false;
    };
  }, [id, token, a?.status]);

  const mine: MySubmission | null = token === null ? { submission: null } : fetched;
  if (!a || !mine) return <Loading error={error} />;

  const open = a.status === "open" && (remaining ?? 1) > 0;
  const myName = mine.submission?.displayName;

  return (
    <div className="space-y-5">
      <ActivityHeader a={a} remaining={remaining} />
      {a.status === "finalized" ? (
        <>
          {mine.assignment && <MyResult a={a} assignment={mine.assignment} />}
          <ResultView a={a} myName={myName} />
        </>
      ) : open ? (
        <PrefForm
          a={a}
          token={token ?? null}
          initial={mine.submission}
          onSaved={(newToken, name, prefs) => {
            if (newToken) {
              storage.set(memberKey(id), newToken);
              setToken(newToken);
            }
            setMine({ submission: { displayName: name, prefs, updatedAt: new Date().toISOString() } });
            reload();
          }}
        />
      ) : (
        <p className="card text-center text-sm text-muted">
          已截止填寫，等待主辦方執行分組（不會自動進行，請耐心等候）。
        </p>
      )}
    </div>
  );
}

function MyResult({ a, assignment }: { a: PublicActivity; assignment: { roleId: string; rank: number } }) {
  const role = a.roles.find((r) => r.id === assignment.roleId);
  return (
    <Pop className="card border-accent bg-accent-soft text-center">
      <p className="text-sm text-muted">你被分配到</p>
      <p className="my-1 text-3xl font-semibold text-accent">{role?.name}</p>
      <p className="text-sm">你的{rankLabel(a.mode, assignment.rank)}</p>
    </Pop>
  );
}

// ---------------- 志願填寫 ----------------

function evenSplit(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

const MODE_HELP: Record<PublicActivity["mode"], (a: PublicActivity, budget: number) => string> = {
  bid: (a, budget) =>
    `拖拉 ⠿ 或用箭頭排序（最上面 = 最想要）。每人有 ${budget} 點渴望度可以自由分配：同一輪志願搶同一職位時，點數高的人優先。只要有任何可能，系統都會讓每個人分到自己的前 ${a.k} 志願之一。`,
  tier: (a) =>
    `拖拉 ⠿ 或用箭頭排序（最上面 = 最想要），並為每個職位選 1～3 級渴望度（3 = 非常想要）。同一輪志願搶同一職位時，級數高的人優先。只要有任何可能，系統都會讓每個人分到自己的前 ${a.k} 志願之一。`,
  pick: () =>
    "選一個「第一志願」，再勾選其他「也可以」的職位（勾越多，越不容易被分到沒勾的職位）。系統會盡量讓每個人都分到第一志願或有勾的職位；搶同一職位時抽籤決定。",
};

function PrefForm({
  a,
  token,
  initial,
  onSaved,
}: {
  a: PublicActivity;
  token: string | null;
  initial: MySubmission["submission"];
  onSaved: (token: string | null, name: string, prefs: Pref[]) => void;
}) {
  const mode = a.mode;
  const budget = mode === "bid" ? desireBudget(a.roles.length) : 3;
  const [name, setName] = useState(initial?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 模式 ①②：排序 + 渴望度
  const [order, setOrder] = useState<string[]>(() =>
    initial && mode !== "pick"
      ? [...initial.prefs].sort((x, y) => x.rank - y.rank).map((p) => p.roleId)
      : a.roles.map((r) => r.id),
  );
  const [desire, setDesire] = useState<Record<string, number>>(() => {
    if (initial) return Object.fromEntries(initial.prefs.map((p) => [p.roleId, p.desire]));
    if (mode === "tier") return Object.fromEntries(a.roles.map((r) => [r.id, 2]));
    const split = evenSplit(budget, a.k);
    return Object.fromEntries(a.roles.map((r, i) => [r.id, split[i] ?? 0]));
  });
  // 模式 ③：第一志願 + 勾選「也可以」
  const [first, setFirst] = useState<string | null>(
    () => (mode === "pick" && initial?.prefs.find((p) => p.rank === 1)?.roleId) || null,
  );
  const [ok, setOk] = useState<Set<string>>(
    () => new Set(mode === "pick" && initial ? initial.prefs.filter((p) => p.rank === 2).map((p) => p.roleId) : []),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const used = order.reduce((s, rid) => s + (desire[rid] || 0), 0);
  const left = mode === "bid" ? budget - used : 0;
  const roleById = new Map(a.roles.map((r) => [r.id, r]));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    setOrder((o) => arrayMove(o, from, to));
    setMsg(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id)
      move(order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
  };
  const setD = (rid: string, v: number) => {
    const lo = mode === "tier" ? 1 : 0;
    setDesire((d) => ({ ...d, [rid]: Math.max(lo, Math.min(budget, Math.round(v) || lo)) }));
    setMsg(null);
  };
  const splitTopK = () => {
    const split = evenSplit(budget, a.k);
    setDesire(Object.fromEntries(order.map((rid, i) => [rid, split[i] ?? 0])));
  };
  const chooseFirst = (rid: string) => {
    setFirst(rid);
    setOk((s) => {
      const n = new Set(s);
      n.delete(rid);
      return n;
    });
    setMsg(null);
  };
  const toggleOk = (rid: string) => {
    setOk((s) => {
      const n = new Set(s);
      if (n.has(rid)) n.delete(rid);
      else n.add(rid);
      return n;
    });
    setMsg(null);
  };

  const buildPrefs = (): Pref[] =>
    mode === "pick"
      ? a.roles.map((r) => ({ roleId: r.id, rank: r.id === first ? 1 : ok.has(r.id) ? 2 : 3, desire: 0 }))
      : order.map((roleId, i) => ({ roleId, rank: i + 1, desire: desire[roleId] || 0 }));

  const blocker =
    !initial && !name.trim()
      ? "請先填名字"
      : mode === "bid" && left !== 0
        ? `渴望度還差 ${left} 點`
        : mode === "pick" && !first
          ? "請選一個第一志願"
          : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    const prefs = buildPrefs();
    try {
      const res = await api<{ memberToken?: string }>(`/api/activities/${a.id}/submission`, {
        method: "PUT",
        headers: token ? { "x-member-token": token } : {},
        body: JSON.stringify({ displayName: name, prefs }),
      });
      onSaved(res.memberToken ?? null, initial?.displayName ?? name.trim(), prefs);
      setMsg({ ok: true, text: "已送出！截止前都可以回來修改。" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RevealCard index={1} className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-accent">{initial ? "修改我的志願" : "填寫我的志願"}</h2>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{MODE_INFO[mode].short}模式</span>
        </div>
        <p className="mt-1 text-sm text-muted">{MODE_HELP[mode](a, budget)}</p>
        <p className="mt-1 text-xs text-muted">
          結算後，主辦方可以看到每個人分到第幾志願{mode === "pick" ? "" : "、在那個志願的渴望度"}，以及抽籤／讓位紀錄；看不到你其他志願的排序。
        </p>
      </div>

      {initial ? (
        <p className="text-sm">以 <span className="font-medium">{initial.displayName}</span> 的身分填寫</p>
      ) : (
        <div>
          <label className="label" htmlFor="name">你的名字</label>
          <input id="name" className="input" maxLength={30} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="讓大家認得出你的名字" />
        </div>
      )}

      {mode === "pick" ? (
        <ul className="space-y-2">
          {a.roles.map((r) => {
            const isFirst = first === r.id;
            const isOk = ok.has(r.id);
            return (
              <li key={r.id}
                className={`flex items-center gap-2 rounded-xl border p-2 pl-3 transition-colors ${
                  isFirst ? "border-accent bg-accent-soft" : isOk ? "border-accent/50 bg-field" : "border-border bg-field"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  {r.description && <span className="block truncate text-xs text-muted">{r.description}</span>}
                </span>
                <button type="button" aria-pressed={isFirst} onClick={() => chooseFirst(r.id)}
                  className={`btn shrink-0 px-3 py-1.5 ${isFirst ? "btn-primary" : "btn-ghost"}`}>
                  {isFirst ? "★ 第一志願" : "設為第一"}
                </button>
                <button type="button" aria-pressed={isOk} disabled={isFirst} onClick={() => toggleOk(r.id)}
                  className={`btn shrink-0 px-3 py-1.5 ${isOk ? "btn-primary" : "btn-ghost"}`}>
                  {isOk ? "✓ 也可以" : "也可以"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {order.map((rid, i) => (
                <Fragment key={rid}>
                  {i === a.k && (
                    <li className="flex items-center gap-2 py-1 text-xs text-muted" aria-hidden>
                      <span className="h-px flex-1 bg-border" />
                      以下原則上不會被分到
                      <span className="h-px flex-1 bg-border" />
                    </li>
                  )}
                  <PrefRow
                    id={rid}
                    rank={i + 1}
                    name={roleById.get(rid)?.name ?? rid}
                    dim={i >= a.k}
                    mode={mode}
                    desire={desire[rid] || 0}
                    budget={budget}
                    onDesire={(v) => setD(rid, v)}
                    onUp={i > 0 ? () => move(i, i - 1) : undefined}
                    onDown={i < order.length - 1 ? () => move(i, i + 1) : undefined}
                  />
                </Fragment>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {mode === "bid" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              渴望度剩餘{" "}
              <span className={`font-semibold tabular-nums ${left === 0 ? "text-accent" : "text-danger"}`}>
                {left}
              </span>{" "}
              / {budget}
            </span>
            <button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={splitTopK}>
              平均分給前 {a.k} 志願
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div className={`h-full transition-all ${used > budget ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} />
          </div>
        </div>
      )}
      {mode === "pick" && (
        <p className="text-sm text-muted">
          第一志願：<strong className="text-foreground">{first ? roleById.get(first)?.name : "尚未選擇"}</strong>
          ・也可以：<strong className="text-foreground">{ok.size}</strong> 個
          {first && ok.size === 0 && "（都沒勾的話，第一志願搶不到時可能被分到任何職位）"}
        </p>
      )}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <button type="button" className="btn btn-primary w-full py-3 text-base"
        disabled={busy || !!blocker} onClick={save}>
        {busy ? "送出中…" : blocker ?? (initial ? "更新志願" : "送出志願")}
      </button>
    </RevealCard>
  );
}

function PrefRow(props: {
  id: string;
  rank: number;
  name: string;
  dim: boolean;
  mode: PublicActivity["mode"];
  desire: number;
  budget: number;
  onDesire: (v: number) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });
  return (
    <li ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-field p-2 ${
        isDragging ? "relative z-10 border-accent shadow-lg" : "border-border"} ${props.dim ? "opacity-60" : ""}`}>
      <button ref={setActivatorNodeRef} type="button" data-drag-handle {...attributes} {...listeners}
        className="cursor-grab touch-none px-1 text-lg text-muted active:cursor-grabbing" aria-label={`拖拉排序 ${props.name}`}>
        ⠿
      </button>
      <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted tabular-nums">{props.rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{props.name}</span>
      <div className="flex shrink-0 flex-col">
        <button type="button" className="px-1 text-xs leading-none text-muted disabled:opacity-20"
          disabled={!props.onUp} onClick={props.onUp} aria-label="上移">▲</button>
        <button type="button" className="px-1 text-xs leading-none text-muted disabled:opacity-20"
          disabled={!props.onDown} onClick={props.onDown} aria-label="下移">▼</button>
      </div>
      {props.mode === "tier" ? (
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border" role="radiogroup"
          aria-label={`${props.name} 渴望度`}>
          {[1, 2, 3].map((lv) => (
            <button key={lv} type="button" role="radio" aria-checked={props.desire === lv}
              onClick={() => props.onDesire(lv)}
              className={`w-9 py-1 text-sm tabular-nums ${
                props.desire === lv ? "bg-accent text-accent-fg" : "bg-field text-muted hover:bg-accent-soft"}`}>
              {lv}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <input type="number" inputMode="numeric" min={0} max={props.budget}
            className="input w-16 px-1.5 py-1 text-center tabular-nums"
            value={props.desire} onChange={(e) => props.onDesire(Number(e.target.value))}
            aria-label={`${props.name} 渴望度`} />
          <span className="text-xs text-muted">點</span>
        </div>
      )}
    </li>
  );
}
