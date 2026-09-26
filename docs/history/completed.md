# 已完成事項歷史紀錄

> 從「實作進度.md」自動歸檔出來的舊紀錄，最新的在最下面（跟主檔案同方向）。

| 功能 | 關鍵檔案 | 摘要 |
|------|---------|------|
| v0.1 — 建立活動、志願＋渴望度填寫、截止後自動分配 | `src/lib/assign.ts`（新）、`src/app/api/activities/**`、`src/app/a/[id]/**` | 逐輪志願＋可行性檢查的分配演算法（保證前 ⌈m/2⌉ 志願）、Neon Postgres／本機 JSON 雙資料層、QR code 邀請、懶結算（截止後第一個請求觸發，v0.7 起改為主辦方手動）。 |
| 渴望度總數改為 ⌈m×3÷2⌉、無解時只放寬最少人數、「最多 N 人」改稱人數上限 | `src/lib/assign.ts` | 原本 100 點固定預算改依職位數計算；無解時舊版全體放寬，改成用 seed 隨機挑出理論最小人數放寬。 |
| 套用作品集淺色配色與動畫特效 | `src/app/globals.css`、`src/components/motion.tsx`、`src/components/overscroll-bounce.tsx` | 從 `C:\Portfolio` 復刻暖色調配色（`#FBF3DC`/`#EFE5C8`/`#7E6725`）+ framer-motion 卡片淡入/按鈕彈跳/邊緣回彈效果。分頁圖示換成作品集提供的綿羊圖片。 |
| 主辦方可在截止前編輯活動、資料庫錯誤訊息明確化 | `src/lib/activity-input.ts`（新）、`src/app/api/activities/[id]/host/route.ts` | `PATCH` 支援修改名稱/敘述/截止時間/職位/人數上限；結構性變更需確認清空填寫。未連資料庫時回傳可讀訊息而非籠統的「伺服器錯誤」。 |
