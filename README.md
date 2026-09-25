# Preference-Based Grouping（志願分組）

依「志願序 + 渴望度」自動分配職位的線上工具。主辦方建立活動並分享連結／QR code，組員各自排好志願，截止後系統自動分配。

- 三種填寫模式任選：**押注渴望度**（自由分配點數）、**三級渴望度**（1～3 級）、**第一志願＋可接受**（單選第一志願＋自由勾選其他可接受的職位）
- 只要有任何可能，每個人都會分到自己的**前一半志願**（⌈職位數/2⌉，模式③則是第一志願或有勾選的職位）；真的無解時只放寬必要的最少人數（隨機決定是誰），並公開標示人數
- 每個職位可設定人數上限，同一職位可以多人擔任
- 截止前主辦方可在後台修改截止時間、模式、職位、人數上限（結構性變更會清除已填志願）
- **分組完全由主辦方手動觸發**（後台按「執行分組」）：截止時間到了不會自動分組，截止前也可以提前執行
- 主辦方後台**隨時**看得到已填寫名單（誰、何時填的），但看不到填寫內容；結算後可看到分組明細與抽籤／讓位紀錄，仍看不到其他志願的排序
- 活動截止時間在 3 天／1 天／1 小時內會顯示紅色倒數標籤（主辦方和組員都看得到）
- 平手用的亂數在建立活動時就公開 SHA-256，結算後才公開亂數本身，任何人都能驗證

設計細節見 [docs/plan-rolematch.md](docs/plan-rolematch.md)。

## 本機開發

```bash
npm install
npm run dev              # http://localhost:3000
npm test                 # 單元測試
npm run preflight        # 完整健檢：lint + 型別 + 測試 + build + 設定檔/repo 檢查（--skip-build 跳過最慢的 build）
npm run archive-progress # 「實作進度.md」的最新完成表格超過 8 筆時，把舊的搬進 docs/history/completed.md
```

沒有設定 `DATABASE_URL` 時，資料會存在 `.data/dev-db.json`（只供開發用）。

目前狀態、最新完成的功能、待辦事項都寫在 [實作進度.md](實作進度.md)（每次開工前先看這裡）。
commit / push 前建議跑一次 `npm run preflight`；另外有一份純靠讀程式碼、不用實際跑的人工複查清單
[docs/checklist-code-review.md](docs/checklist-code-review.md)，兩者互補。

## 部署到 Vercel

1. 在 Vercel 匯入這個 GitHub repo。`vercel.json` 已指定 Next.js 框架與新加坡機房（`sin1`），其他設定用預設值
2. 專案的 **Storage** 分頁 → **Create Database** → 選 **Neon (Postgres)**，區域選 **Singapore**（跟函式同區，延遲最低）→ Connect。這會自動設定 `DATABASE_URL` 環境變數
3. Redeploy。資料表會在第一次請求時自動建立，不需要另外跑 migration
4. 打開 `https://<你的網域>/api/health` 確認顯示 `"ok": true, "database": "postgres"`

## 專案結構

| 路徑 | 說明 |
|------|------|
| `src/lib/assign.ts` | 分配演算法（純函式）+ 輸入驗證 |
| `src/lib/store.ts` | 資料層：Postgres（Neon）／本機 JSON 檔 |
| `src/lib/service.ts` | 權杖、結算（截止後第一個請求觸發，只會執行一次）、公開資料的過濾 |
| `src/app/page.tsx` | 主辦方建立活動 |
| `src/app/a/[id]/host` | 主辦方後台（連結、QR、人數、結果） |
| `src/app/a/[id]` | 組員填寫志願／查看結果 |
| `src/app/api/...` | API |
