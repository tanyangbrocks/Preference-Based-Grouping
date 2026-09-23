"use client";

import { animate, motion, useMotionValue } from "framer-motion";
import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";

// 移植自作品集專案 src/components/overscroll-bounce.tsx：
// 滑到頁面頂端／底端再繼續拉，整頁會帶阻力地被拉動，放開後彈回。
// 參數的來由（Chrome 觸控板慣性、死區等）詳見原檔註解。
// 本專案的修改：從拖拉把手或輸入框開始的觸控手勢不觸發（避免拖曳志願排序時整頁跟著動）。
const MAX_PULL = 80;
const RESISTANCE = 0.4;
const WHEEL_IDLE_MS = 75;
const MAX_HOLD_MS = 400;
const COOLDOWN_MS = 800;
const BOUNDARY_TOLERANCE = 12;
const DEAD_ZONE = 10;

const IGNORE_SELECTOR = "[data-drag-handle], input, textarea, select, [data-no-bounce]";

export function OverscrollBounce({ children }: { children: React.ReactNode }) {
  const lenis = useLenis();
  const y = useMotionValue(0);
  const pullRef = useRef(0);
  const pullStartRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const atTop = () => (lenis?.scroll ?? window.scrollY) <= BOUNDARY_TOLERANCE;
    const atBottom = () => {
      const limit = lenis?.limit ?? document.documentElement.scrollHeight - window.innerHeight;
      return (lenis?.scroll ?? window.scrollY) >= limit - BOUNDARY_TOLERANCE;
    };
    const clampPull = (v: number) => Math.max(-MAX_PULL, Math.min(MAX_PULL, v));
    const visualPull = (raw: number) => Math.sign(raw) * Math.max(0, Math.abs(raw) - DEAD_ZONE);

    function release() {
      pullRef.current = 0;
      pullStartRef.current = 0;
      clearTimeout(idleTimerRef.current);
      animate(y, 0, { type: "spring", bounce: 0.35, duration: 0.5 });
    }

    function onWheel(e: WheelEvent) {
      const now = performance.now();
      if (now < suppressUntilRef.current) return;
      const pullingDown = e.deltaY < 0 && atTop();
      const pullingUp = e.deltaY > 0 && atBottom();
      if (!pullingDown && !pullingUp) return;

      e.preventDefault();
      if (pullStartRef.current === 0) pullStartRef.current = now;
      pullRef.current = clampPull(pullRef.current - e.deltaY * RESISTANCE);
      y.set(visualPull(pullRef.current));

      if (now - pullStartRef.current > MAX_HOLD_MS) {
        suppressUntilRef.current = now + COOLDOWN_MS;
        release();
      } else {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(release, WHEEL_IDLE_MS);
      }
    }

    let touchStartY = 0;
    let overscrolling = false;
    let ignored = false;

    function onTouchStart(e: TouchEvent) {
      touchStartY = e.touches[0].clientY;
      overscrolling = false;
      ignored = !!(e.target as Element | null)?.closest?.(IGNORE_SELECTOR);
    }

    function onTouchMove(e: TouchEvent) {
      if (ignored) return;
      const diff = e.touches[0].clientY - touchStartY;
      if (!overscrolling) {
        if (diff > 0 && atTop()) overscrolling = true;
        else if (diff < 0 && atBottom()) overscrolling = true;
        else return;
      }
      e.preventDefault();
      pullRef.current = clampPull(diff * RESISTANCE);
      y.set(visualPull(pullRef.current));
    }

    function onTouchEnd() {
      if (overscrolling) release();
      overscrolling = false;
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      clearTimeout(idleTimerRef.current);
    };
  }, [lenis, y]);

  return (
    <motion.div style={{ y }} className="flex flex-1 flex-col">
      {children}
    </motion.div>
  );
}
