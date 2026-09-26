"use client";

import { useEffect, useRef } from "react";
import { useDesktopPointer, useReducedMotion } from "@/lib/media";

/**
 * 游標聚光燈：柔光跟著滑鼠移動（參考 C:\wp-tool\動畫特效\09_游標聚光燈）。只在電腦版（有滑鼠、寬度 ≥ 768px）
 * 建立元素；手機、平板、「減少動態效果」都完全不渲染。光放在內容後面、背景光暈前面（z-index: -1、排在
 * .theme-mesh 之後），所以深色模式的玻璃卡片也會把它的光透出來。樣式在 globals.css 的 .cursor-spotlight。
 * 用 translate3d 移動固定大小的元素（不重繪漸層），並以逐幀插值做出「慢半拍跟上來」的手感。
 */
export function CursorSpotlight() {
  const desktop = useDesktopPointer();
  const reduced = useReducedMotion();
  const on = desktop && !reduced;
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!on || !node) return;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let seen = false;

    const loop = () => {
      cx += (tx - cx) * 0.16;
      cy += (ty - cy) * 0.16;
      node.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      raf = Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) {
        seen = true;
        cx = tx;
        cy = ty;
        node.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeave = () => {
      seen = false;
      node.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [on]);

  return on ? <div ref={el} className="cursor-spotlight" aria-hidden /> : null;
}
