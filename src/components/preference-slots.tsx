"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Fragment, useState } from "react";
import type { Mode } from "@/lib/modes";

interface CardProps {
  name: string;
  mode: Mode;
  desire: number;
  budget: number;
  onDesire: (v: number) => void;
  onUp?: () => void;
  onDown?: () => void;
}

interface Props {
  /** 志願序：陣列索引 = 插槽編號（第 index+1 志願），值 = 職位 id */
  order: string[];
  roleName: (id: string) => string;
  /** 前 k 個插槽是可接受範圍，之後出現「以下原則上不會被分到」分界線 */
  k: number;
  mode: Mode;
  desire: Record<string, number>;
  budget: number;
  onSwap: (from: number, to: number) => void;
  onDesire: (roleId: string, v: number) => void;
}

// 先看指標實際在哪個插槽裡，指標在插槽之間的縫隙時才退回最近中心，拖曳手感比較「吸」
const detect: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length ? hit : closestCenter(args);
};

/**
 * 志願插槽：固定編號的插槽，把職位卡片拖進去。
 * 拖到已有卡片的插槽時，兩張卡片互換位置（其他插槽不動）。
 * 拖曳中，指標所在的插槽會發光放大（磁吸預覽）；放開時卡片用帶回彈的曲線吸進插槽。
 */
export function PreferenceSlots({ order, roleName, k, mode, desire, budget, onSwap, onDesire }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false); // 有拖過之後，換過插槽的卡片才播放「吸入」動畫

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const swap = (a: number, b: number) => {
    setSettled(true);
    onSwap(a, b);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over && String(e.over.id);
    if (!over?.startsWith("slot-")) return;
    const from = order.indexOf(String(e.active.id));
    const to = Number(over.slice(5));
    if (from !== to) swap(from, to);
  };

  const cardProps = (rid: string, i: number): CardProps => ({
    name: roleName(rid),
    mode,
    desire: desire[rid] || 0,
    budget,
    onDesire: (v) => onDesire(rid, v),
    onUp: i > 0 ? () => swap(i, i - 1) : undefined,
    onDown: i < order.length - 1 ? () => swap(i, i + 1) : undefined,
  });

  return (
    <DndContext sensors={sensors} collisionDetection={detect} onDragStart={onDragStart}
      onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <ol className="space-y-2">
        {order.map((rid, i) => (
          <Fragment key={i}>
            {i === k && (
              <li className="flex items-center gap-2 py-1 text-xs text-muted" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                以下原則上不會被分到
                <span className="h-px flex-1 bg-border" />
              </li>
            )}
            <Slot index={i} dim={i >= k} activeId={activeId}>
              <RoleCard key={`${rid}@${i}`} id={rid} pop={settled} dragging={activeId === rid} {...cardProps(rid, i)} />
            </Slot>
          </Fragment>
        ))}
      </ol>
      <DragOverlay dropAnimation={{ duration: 380, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
        {activeId ? (
          <div className="rotate-1 scale-[1.03] rounded-xl shadow-2xl ring-2 ring-accent">
            <CardBody {...cardProps(activeId, order.indexOf(activeId))} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Slot({ index, dim, activeId, children }: {
  index: number;
  dim: boolean;
  activeId: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}` });
  const lit = isOver && activeId !== null;
  return (
    <li ref={setNodeRef}
      className={`flex items-center gap-2 rounded-2xl border-2 p-1.5 transition-all duration-200 ${
        lit
          ? "scale-[1.02] border-solid border-accent bg-accent-soft shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_20%,transparent)]"
          : "border-dashed border-border"} ${dim && !lit ? "opacity-60" : ""}`}>
      <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted tabular-nums">{index + 1}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function RoleCard({ id, pop, dragging, ...p }: CardProps & { id: string; pop: boolean; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id });
  return (
    <div ref={setNodeRef} className={pop ? "slot-pop" : ""}>
      <CardBody {...p} dragging={dragging} handle={{ ref: setActivatorNodeRef, attributes, listeners }} />
    </div>
  );
}

function CardBody({ name, mode, desire, budget, onDesire, onUp, onDown, dragging, handle }: CardProps & {
  dragging?: boolean;
  handle?: {
    ref: (el: HTMLElement | null) => void;
    attributes: object;
    listeners?: object;
  };
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border bg-field p-2 transition-opacity ${
      dragging ? "border-dashed border-border opacity-30" : "border-border"}`}>
      <button ref={handle?.ref} type="button" data-drag-handle {...handle?.attributes} {...handle?.listeners}
        className="cursor-grab touch-none px-1 text-lg text-muted active:cursor-grabbing"
        aria-label={`拖曳 ${name} 到其他志願插槽`}>
        ⠿
      </button>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <div className="flex shrink-0 flex-col">
        <button type="button" className="px-1 text-xs leading-none text-muted disabled:opacity-20"
          disabled={!onUp} onClick={onUp} aria-label="上移">▲</button>
        <button type="button" className="px-1 text-xs leading-none text-muted disabled:opacity-20"
          disabled={!onDown} onClick={onDown} aria-label="下移">▼</button>
      </div>
      {mode === "tier" ? (
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border" role="radiogroup"
          aria-label={`${name} 渴望度`}>
          {[1, 2, 3].map((lv) => (
            <button key={lv} type="button" role="radio" aria-checked={desire === lv} onClick={() => onDesire(lv)}
              className={`w-9 py-1 text-sm tabular-nums ${
                desire === lv ? "bg-accent text-accent-fg" : "bg-field text-muted hover:bg-accent-soft"}`}>
              {lv}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <input type="number" inputMode="numeric" min={0} max={budget}
            className="input w-16 px-1.5 py-1 text-center tabular-nums"
            value={desire} onChange={(e) => onDesire(Number(e.target.value))} aria-label={`${name} 渴望度`} />
          <span className="text-xs text-muted">點</span>
        </div>
      )}
    </div>
  );
}
