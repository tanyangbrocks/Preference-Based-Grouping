# 資料庫手動 SQL

只有 Postgres（Neon）需要；本機開發用的 `.data/dev-db.json` 不用管。這些都是**選用**的，沒執行網站照常運作。

## harden-submissions.sql — 填寫志願的資料庫層防護

| | |
|---|---|
| 解決 | ① 組員按儲存的同一瞬間主辦方按「執行分組」→ 志願存進去了、結果卻沒算到　② 兩人同時搶最後一個名額 → 多出一人 |
| 做法 | `submissions` 表加一個 trigger，寫入前鎖住活動那一列、檢查「還在填寫中」與「名額未滿」 |
| 檔案 | `harden-submissions.sql`（安裝）、`harden-submissions.rollback.sql`（還原） |
| 特性 | 可重複執行；不改任何資料、不改表結構；不裝也不會壞 |

### 在哪裡輸入

1. **先讓資料表存在**：部署後打開一次 `https://你的網址/api/health`（會自動建表）。
2. 打開 **Neon Console**（https://console.neon.tech）→ 選你的專案。  
   從 Vercel 進去也可以：Vercel 專案 → **Storage** → 點那個 Neon 資料庫 → **Open in Neon**。
3. 左側選單點 **SQL Editor**。
4. 上方確認 **Branch**（預設 `production` 或 `main`）與 **Database**（預設 `neondb`）是網站實際在用的那個。
5. 把 `harden-submissions.sql` 的**全部內容**貼進編輯器 → 按 **Run**。看到執行成功（沒有紅色錯誤）即可。
6. 回到 `https://你的網址/api/health`，應該看到 `"submissionGuard": "installed"`。

### 出問題時

- 貼上後報 `relation "submissions" does not exist` → 步驟 1 還沒做，先開一次 `/api/health` 再貼。
- 想還原 → 同樣的方式貼 `harden-submissions.rollback.sql` 執行，`/api/health` 會回到 `"missing"`。
- 錯誤碼（程式已處理，會轉成 409 友善訊息）：`RM001` = 活動已不接受填寫、`RM002` = 名額已滿。
