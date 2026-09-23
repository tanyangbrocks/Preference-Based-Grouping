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
import { DESIRE_BUDGET, type Pref } from "@/lib/assign";
import { api, memberKey, storage, type PublicActivity } from "@/lib/client";

interface MySubmission {
  submission: { displayName: string; prefs: Pref[]; updatedAt: string } | null;
  assignment?: { roleId: string; rank: number } | null;
}

export default function MemberPage() {
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
        <p className="card text-center text-sm text-muted">已截止，正在分配中…</p>
      )}
    </div>
  );
}

function MyResult({ a, assignment }: { a: PublicActivity; assignment: { roleId: string; rank: number } }) {
  const role = a.roles.find((r) => r.id === assignment.roleId);
  return (
    <section className="card border-accent bg-accent-soft text-center">
      <p className="text-sm text-muted">你被分配到</p>
      <p className="my-1 text-3xl font-semibold text-accent">{role?.name}</p>
      <p className="text-sm">你的第 {assignment.rank} 志願</p>
    </section>
  );
}

// ---------------- 志願填寫 ----------------

function evenSplit(n: number): number[] {
  const base = Math.floor(DESIRE_BUDGET / n);
  return Array.from({ length: n }, (_, i) => base + (i < DESIRE_BUDGET - base * n ? 1 : 0));
}

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
  const [name, setName] = useState(initial?.displayName ?? "");
  const [order, setOrder] = useState<string[]>(() =>
    initial
      ? [...initial.prefs].sort((x, y) => x.rank - y.rank).map((p) => p.roleId)
      : a.roles.map((r) => r.id),
  );
  const [desire, setDesire] = useState<Record<string, number>>(() => {
    if (initial) return Object.fromEntries(initial.prefs.map((p) => [p.roleId, p.desire]));
    const split = evenSplit(a.k);
    return Object.fromEntries(a.roles.map((r, i) => [r.id, split[i] ?? 0]));
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const used = order.reduce((s, rid) => s + (desire[rid] || 0), 0);
  const left = DESIRE_BUDGET - used;
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
    setDesire((d) => ({ ...d, [rid]: Math.max(0, Math.min(DESIRE_BUDGET, Math.round(v) || 0)) }));
    setMsg(null);
  };
  const splitTopK = () => {
    const split = evenSplit(a.k);
    setDesire(Object.fromEntries(order.map((rid, i) => [rid, split[i] ?? 0])));
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    const prefs: Pref[] = order.map((roleId, i) => ({ roleId, rank: i + 1, desire: desire[roleId] || 0 }));
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
    <section className="card space-y-5">
      <div>
        <h2 className="font-semibold">{initial ? "修改我的志願" : "填寫我的志願"}</h2>
        <p className="mt-1 text-sm text-muted">
          拖拉 ⠿ 或用箭頭排序（最上面 = 最想要）。每人有 {DESIRE_BUDGET} 點渴望度可以自由分配：
          同一輪志願搶同一職位時，點數高的人優先。保證分到你的前 {a.k} 志願之一。
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
                  desire={desire[rid] || 0}
                  onDesire={(v) => setD(rid, v)}
                  onUp={i > 0 ? () => move(i, i - 1) : undefined}
                  onDown={i < order.length - 1 ? () => move(i, i + 1) : undefined}
                />
              </Fragment>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            渴望度剩餘{" "}
            <span className={`font-semibold tabular-nums ${left === 0 ? "text-accent" : "text-danger"}`}>
              {left}
            </span>{" "}
            / {DESIRE_BUDGET}
          </span>
          <button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={splitTopK}>
            平均分給前 {a.k} 志願
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border">
          <div className={`h-full transition-all ${used > DESIRE_BUDGET ? "bg-danger" : "bg-accent"}`}
            style={{ width: `${Math.min(100, (used / DESIRE_BUDGET) * 100)}%` }} />
        </div>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <button type="button" className="btn btn-primary w-full py-3 text-base"
        disabled={busy || left !== 0 || (!initial && !name.trim())} onClick={save}>
        {busy ? "送出中…" : left !== 0 ? `渴望度還差 ${left} 點` : initial ? "更新志願" : "送出志願"}
      </button>
    </section>
  );
}

function PrefRow(props: {
  id: string;
  rank: number;
  name: string;
  dim: boolean;
  desire: number;
  onDesire: (v: number) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });
  return (
    <li ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-surface p-2 ${
        isDragging ? "relative z-10 border-accent shadow-lg" : "border-border"} ${props.dim ? "opacity-60" : ""}`}>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
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
      <div className="flex shrink-0 items-center gap-1">
        <input type="number" inputMode="numeric" min={0} max={DESIRE_BUDGET}
          className="input w-16 px-1.5 py-1 text-center tabular-nums"
          value={props.desire} onChange={(e) => props.onDesire(Number(e.target.value))}
          aria-label={`${props.name} 渴望度`} />
        <span className="text-xs text-muted">點</span>
      </div>
    </li>
  );
}
