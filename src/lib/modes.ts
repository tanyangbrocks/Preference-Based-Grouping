import type { Mode } from "./assign";

export type { Mode };

// 活動模式的顯示文字（前後端共用）
export const MODE_INFO: Record<Mode, { label: string; short: string; desc: string }> = {
  bid: {
    label: "① 押注渴望度",
    short: "押注",
    desc: "排出所有職位的志願序，並把「職位數 × 3 ÷ 2」點渴望度自由押在各志願上。搶同一職位時押得多的人優先；保證分到前一半志願。",
  },
  tier: {
    label: "② 三級渴望度",
    short: "三級",
    desc: "排出所有職位的志願序，每個職位選 1、2、3 級渴望度（不用加總）。搶同一職位時級數高的人優先；保證分到前一半志願。",
  },
  pick: {
    label: "③ 第一志願＋可接受",
    short: "第一志願＋可接受",
    desc: "只選一個第一志願，其他職位勾選「也可以」。有勾的都算第二順位，系統盡量讓每個人都分到第一志願或有勾的職位；搶同一職位時抽籤。",
  },
};

/** 分到的順位 → 顯示文字 */
export function rankLabel(mode: Mode, rank: number): string {
  if (mode !== "pick") return `第 ${rank} 志願`;
  return rank === 1 ? "第一志願" : rank === 2 ? "有勾選（第二順位）" : "未勾選的職位";
}

/** 可接受範圍的說明 */
export function acceptableText(mode: Mode, k: number): string {
  return mode === "pick" ? "第一志願或有勾選的職位" : `前 ${k} 志願`;
}
