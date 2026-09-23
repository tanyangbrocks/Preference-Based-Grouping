# Preference-Based Grouping（志願分組）

依「志願序 + 渴望度」自動分配職位的線上工具。主辦方建立活動並分享連結／QR code，組員各自排好志願，截止後系統自動分配。

- 同一輪志願搶同一職位時，**渴望度高者優先**（每人 100 點自由分配）
- 保證每個人都分到自己的**前一半志願**（⌈職位數/2⌉）；如果志願衝突到無解，才會放寬並公開標示
- 主辦方**看不到**任何人的填寫內容，也**無法修改或重新分配**結果
- 平手用的亂數在建立活動時就公開 SHA-256，結算後才公開亂數本身，任何人都能驗證

設計細節見 [docs/plan-rolematch.md](docs/plan-rolematch.md)。

## 本機開發

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 分配演算法單元測試
```

沒有設定 `DATABASE_URL` 時，資料會存在 `.data/dev-db.json`（只供開發用）。

## 部署到 Vercel

1. 在 Vercel 匯入這個 GitHub repo（Framework：Next.js，其他設定用預設值）
2. 專案的 **Storage** 分頁 → **Create Database** → 選 **Neon (Postgres)** → Connect。這會自動設定 `DATABASE_URL` 環境變數
3. Redeploy。資料表會在第一次請求時自動建立，不需要另外跑 migration

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
