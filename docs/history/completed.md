# 已完成事項歷史紀錄

> 從「實作進度.md」自動歸檔出來的舊紀錄，最新的在最下面（跟主檔案同方向）。

| 功能 | 關鍵檔案 | 摘要 |
|------|---------|------|
| v0.1 — 建立活動、志願＋渴望度填寫、截止後自動分配 | `src/lib/assign.ts`（新）、`src/app/api/activities/**`、`src/app/a/[id]/**` | 逐輪志願＋可行性檢查的分配演算法（保證前 ⌈m/2⌉ 志願）、Neon Postgres／本機 JSON 雙資料層、QR code 邀請、懶結算（截止後第一個請求觸發，v0.7 起改為主辦方手動）。 |
| 渴望度總數改為 ⌈m×3÷2⌉、無解時只放寬最少人數、「最多 N 人」改稱人數上限 | `src/lib/assign.ts` | 原本 100 點固定預算改依職位數計算；無解時舊版全體放寬，改成用 seed 隨機挑出理論最小人數放寬。 |
| 套用作品集淺色配色與動畫特效 | `src/app/globals.css`、`src/components/motion.tsx`、`src/components/overscroll-bounce.tsx` | 從 `C:\Portfolio` 復刻暖色調配色（`#FBF3DC`/`#EFE5C8`/`#7E6725`）+ framer-motion 卡片淡入/按鈕彈跳/邊緣回彈效果。分頁圖示換成作品集提供的綿羊圖片。 |
| 主辦方可在截止前編輯活動、資料庫錯誤訊息明確化 | `src/lib/activity-input.ts`（新）、`src/app/api/activities/[id]/host/route.ts` | `PATCH` 支援修改名稱/敘述/截止時間/職位/人數上限；結構性變更需確認清空填寫。未連資料庫時回傳可讀訊息而非籠統的「伺服器錯誤」。 |
| 主辦方後台結算後顯示分組明細與分配過程紀錄 | `src/lib/service.ts`（`hostDetail`）、`src/components/host-detail.tsx`（新） | 每人分到第幾志願＋押注、抽籤（tie）／讓位（yield）／降低標準（relax）事件列表，不洩漏其他志願排序。 |
| 三種填寫模式＋主辦方手動分組、即時填寫名單、倒數緊急標籤 | `src/lib/assign.ts`（志願序廣義化成「順位」）、`src/lib/modes.ts`（新）、`src/lib/service.ts`（`finalizeNow`/`hostSubmissions`） | 新增三級渴望度／第一志願＋可接受兩種模式；移除自動結算，改成主辦方手動按「執行分組」；後台隨時看得到已填寫名單；截止時間 3 天/1 天/1 小時內紅色倒數標籤。 |
| 手機／電腦模式先分流（目前兩邊長得一樣） | `src/lib/viewport.ts`（新）、`src/app/page.tsx`／`a/[id]/page.tsx`／`a/[id]/host/page.tsx` | `useViewport()` 依 768px 斷點分流到 `Mobile*Page`/`Desktop*Page`，兩者目前都呼叫同一個 `*PageCore`，先建立分岔點供之後個別調整。 |
| code-review 抓到並修好 3 個真實 bug + 新增 preflight 腳本與複查清單 | `src/lib/assign.ts`、`src/lib/activity-input.ts`、`preflight-check.mjs`（新）、`docs/checklist-code-review.md`（新） | ① pick 模式多職位同順位的搶奪沒記錄成事件 ② 編輯活動時未修改的截止時間被誤擋 ③ 同順位多職位的隨機選擇其實是整場固定值不是每次重抽。三個都已修復並補回歸測試（26→30 案）。 |
