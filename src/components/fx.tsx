"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useFinePointer, useReducedMotion } from "@/lib/media";

// 改寫自 C:\wp-tool\動畫特效 的純 JS 版本（02 數字計數、04 卡片傾斜、05 逐字浮現、07 文字亂碼），
// 全部遵守：手機沒有游標的效果（傾斜）不啟用；系統開啟「減少動態效果」時直接顯示最終狀態。
// 09 游標聚光燈是全站的，見 cursor-spotlight.tsx。

// ---------------------------------------------------------------- 05 逐字浮現

/** 標題一個字一個字浮現（純 CSS 動畫，樣式在 globals.css 的 .stagger-char）。螢幕閱讀器讀的是完整文字。 */
export function StaggerText({ text, stagger = 80, className }: { text: string; stagger?: number; className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-block">
        {Array.from(text).map((c, i) => (
          <span key={i} className="stagger-char" style={{ animationDelay: `${i * stagger}ms` }}>
            {c === " " ? "\u00a0" : c}
          </span>
        ))}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- 07 文字亂碼解密

const SYMBOLS = "!<>-_\\/[]{}—=+*^?#";
// 中文字用中文字亂碼（寬度跟真字一樣，不會左右晃）；英數字用符號亂碼
const CJK_POOL = "志願分組職位渴望榜登龍鳳雲山水火風雷電光影夢星月日天地人心力金木土書畫琴棋詩酒茶花";
const isWide = (ch: string) => /[\u2E80-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch);
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
const garble = (ch: string) => (ch === " " ? ch : pick(isWide(ch) ? CJK_POOL : SYMBOLS));

/**
 * 文字先亂碼跳動、由左到右逐字「解密」成真正文字。公布結果那一刻用。
 * autoPlay 為 true 時掛載後（等 delay 毫秒，讓外層的彈出動畫先跑一下）自動播放一次；點一下可以再播放。
 * 亂碼期間螢幕閱讀器讀到的仍是最終文字。
 */
export function ScrambleText({
  text,
  autoPlay = true,
  delay = 350,
  className,
}: {
  text: string;
  autoPlay?: boolean;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const willPlay = autoPlay && !reduced;
  // 要自動播放時，一開始就顯示亂碼（不要先閃一下最終文字）；這個元件只在資料載入後才渲染，不經過伺服器端渲染
  const [shown, setShown] = useState(() => (willPlay ? Array.from(text).map(garble).join("") : text));
  const raf = useRef(0);

  const play = useCallback(() => {
    if (reduced) return;
    cancelAnimationFrame(raf.current);
    const chars = Array.from(text);
    const total = Math.min(1800, 600 + chars.length * 160);
    const start = performance.now();
    let lastFlip = 0;
    const tick = (now: number) => {
      const t = now - start;
      if (t >= total) {
        setShown(text);
        return;
      }
      // 亂碼字元每 50ms 換一次（每幀都換會太閃）
      if (now - lastFlip >= 50) {
        lastFlip = now;
        // 前 25% 的時間全是亂碼，之後才開始由左到右解出真字
        const revealed = Math.floor(Math.max(0, (t / total - 0.25) / 0.75) * chars.length);
        setShown(chars.map((c, i) => (i < revealed ? c : garble(c))).join(""));
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [text, reduced]);

  useEffect(() => {
    if (!willPlay) return;
    const t = setTimeout(play, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf.current);
    };
  }, [willPlay, delay, play]);

  return (
    <button type="button" onClick={play} title="點一下再看一次" className={`cursor-pointer ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden suppressHydrationWarning>
        {reduced ? text : shown}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- 02 數字計數

/**
 * 數字滾動到目標值。第一次要等元素進入畫面才開始（從 0 數上來）；之後數值變動（例如輪詢到新的填寫人數）
 * 從目前顯示的數字接續滾動到新值，沒變就不動。
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const seen = useRef(false);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    if (reduced || !node) return;
    let raf = 0;
    let io: IntersectionObserver | undefined;

    const animate = () => {
      const from = shownRef.current;
      if (from === value) return;
      const start = performance.now();
      const dur = Math.min(1400, 350 + Math.abs(value - from) * 60);
      const step = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out
        const v = p < 1 ? Math.round(from + (value - from) * eased) : value;
        shownRef.current = v;
        setShown(v);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    if (seen.current) {
      animate();
    } else {
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          seen.current = true;
          io?.disconnect();
          animate();
        },
        { threshold: 0.5 },
      );
      io.observe(node);
    }
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [value, reduced]);

  return (
    <span ref={el} className={`tabular-nums ${className ?? ""}`}>
      {reduced ? value : shown}
    </span>
  );
}

// ---------------------------------------------------------------- 04 卡片傾斜

/**
 * 滑鼠移到卡片上時，卡片朝游標方向微幅 3D 傾斜。只在有滑鼠的裝置啟用。
 * 只包在「點進去」或「純顯示」的卡片上；含輸入框、拖曳區域的表單卡片不要用（3D 變形會讓拖曳判定偏移）。
 */
export function Tilt({ children, max = 7, className }: { children: ReactNode; max?: number; className?: string }) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  function onMove(e: ReactPointerEvent) {
    const o = outer.current;
    const i = inner.current;
    if (!enabled || !o || !i || e.pointerType !== "mouse") return;
    const r = o.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 ~ 0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    i.style.transition = "transform 120ms ease-out";
    i.style.transform = `rotateX(${(-py * 2 * max).toFixed(2)}deg) rotateY(${(px * 2 * max).toFixed(2)}deg)`;
  }

  function onLeave() {
    const i = inner.current;
    if (!i) return;
    i.style.transition = "transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1)"; // 離開時彈回原位
    i.style.transform = "";
  }

  return (
    <div ref={outer} className={`tilt ${className ?? ""}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div ref={inner} className="tilt-inner">
        {children}
      </div>
    </div>
  );
}
