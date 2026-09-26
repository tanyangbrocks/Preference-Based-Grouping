"use client";

import { useSyncExternalStore } from "react";

// 動畫特效共用的裝置／偏好判斷。伺服器端一律回 false（不啟用），掛載後用真正的 matchMedia 校正。
function media(query: string) {
  return {
    subscribe(onChange: () => void) {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    get: () => window.matchMedia(query).matches,
  };
}

const FINE_POINTER = media("(hover: hover) and (pointer: fine)");
const REDUCED_MOTION = media("(prefers-reduced-motion: reduce)");
// 電腦版：有滑鼠（能 hover）而且寬度達 md 斷點。手機／平板就算轉橫向、寬度夠，也沒有游標，所以不算。
const DESKTOP_POINTER = media("(hover: hover) and (pointer: fine) and (min-width: 768px)");

const off = () => false;

/** 有滑鼠類的精確指標（手機觸控為 false）——磁性按鈕、卡片傾斜只在這種裝置啟用 */
export const useFinePointer = () => useSyncExternalStore(FINE_POINTER.subscribe, FINE_POINTER.get, off);
/** 系統開啟「減少動態效果」 */
export const useReducedMotion = () => useSyncExternalStore(REDUCED_MOTION.subscribe, REDUCED_MOTION.get, off);
/** 電腦版（游標聚光燈用） */
export const useDesktopPointer = () => useSyncExternalStore(DESKTOP_POINTER.subscribe, DESKTOP_POINTER.get, off);
