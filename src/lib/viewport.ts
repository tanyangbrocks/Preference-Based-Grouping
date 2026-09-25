"use client";

import { useSyncExternalStore } from "react";

// 手機／電腦模式的分界線，對齊 Tailwind 的 md 斷點（768px）。
// 目前兩種模式長得完全一樣（各頁面的 Mobile*/Desktop* 版本都只是呼叫同一個共用元件）；
// 之後要讓某個模式長得不一樣，就直接改那個模式專屬的元件，不會影響另一邊。
const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): "mobile" | "desktop" {
  return window.matchMedia(QUERY).matches ? "desktop" : "mobile";
}

// 伺服器端不知道裝置寬度；用 useSyncExternalStore 的標準寫法（server snapshot 給預設值，
// 掛載後立刻用真正的 matchMedia 校正），這樣不會有 hydration mismatch 警告。
function getServerSnapshot(): "mobile" | "desktop" {
  return "desktop";
}

export function useViewport(): "mobile" | "desktop" {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
