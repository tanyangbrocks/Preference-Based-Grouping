"use client";

import { useEffect } from "react";

/**
 * 點擊光環：全站任何地方點一下，點擊位置散開一圈淡淡的光（樣式在 globals.css 的 .click-halo）。
 * 參考 PBC 專案的點擊特效（中心閃光 + 擴散環），但只留柔和的核心光暈和兩圈擴散環，不做十字光芒——
 * 這個網站是給人填表單的，光環要淡，不能干擾閱讀。
 * 用 capture 階段監聽，這樣即使元素自己 stopPropagation（例如拖曳元件）也一樣看得到；
 * 鍵盤觸發的 click（detail === 0）不顯示；系統開啟「減少動態效果」時完全不建立元素。
 */
export function ClickHalo() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const el = document.createElement("span");
      el.className = "click-halo";
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
