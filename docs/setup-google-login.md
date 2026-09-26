# 設定 Google 登入（主辦方帳號）

> 程式碼已經寫好（Auth.js / next-auth v5，見 `src/lib/auth.ts`）。這份文件是**你要自己去 Google 和 Vercel 後台做的事**——
> 需要你的帳號，我沒辦法代勞。做完之後打開 `/api/health`，看到 `"auth": "configured"` 就代表成功。

只有**主辦方**需要登入（建立活動、看「我的活動」）；**組員填寫志願完全不用登入**。

## 1. Google Cloud Console 建立 OAuth 用戶端

1. 打開 <https://console.cloud.google.com/> ，右上角選（或新建）一個專案
2. 左側選單 **API 和服務 → OAuth 同意畫面**
   - User Type 選 **外部**，填應用程式名稱（例如「志願分組」）、你的 email（支援電子郵件 + 開發人員聯絡資訊）
   - 範圍（Scopes）不用另外加，預設的 `openid` / `email` / `profile` 就夠
   - 發布狀態（Publishing status）：一開始是「測試中」，**只有你加進「測試使用者」名單的帳號能登入**。
     要讓任何人都能用 Google 登入，按「發布應用程式」→ 狀態變「正式版」（只用基本範圍不需要 Google 審查）
3. **API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**
   - 應用程式類型：**網頁應用程式**
   - **已授權的 JavaScript 來源**：
     - `https://你的正式網域`（Vercel 的 Production 網域，例如 `https://preference-based-grouping.vercel.app`）
     - `http://localhost:3000`（本機開發用，選填）
   - **已授權的重新導向 URI**（這一欄最容易填錯，一個字都不能差）：
     - `https://你的正式網域/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`（本機開發用，選填）
   - 建立後會得到 **用戶端 ID** 和 **用戶端密鑰**，先複製起來

## 2. Vercel 設定環境變數

專案 → **Settings → Environment Variables**，新增三個（Production、Preview 都勾）：

| 名稱 | 值 |
|------|----|
| `AUTH_SECRET` | 隨機字串。產生方式：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_GOOGLE_ID` | 上面的用戶端 ID |
| `AUTH_GOOGLE_SECRET` | 上面的用戶端密鑰 |

存好之後到 **Deployments** 分頁對最新一筆 **Redeploy**（環境變數要重新部署才會生效）。

## 3. 驗證

- 打開 `https://你的網域/api/health`，應該看到 `"auth": "configured"`（缺什麼會列在 `authMissing`）
- 打開首頁，點右上角「登入」→ 跳到 Google 登入畫面 → 登入後回到網站，右上角變成你的頭像

## 常見問題

- **`redirect_uri_mismatch`**：Google 後台的「已授權的重新導向 URI」跟實際網址不一致。網址要包含 `https://`、不能多斜線、網域要跟你實際打開的完全一樣
- **登入時 Google 說「應用程式尚未驗證」/ 只有我自己能登入**：OAuth 同意畫面還在「測試中」，把測試使用者加進名單，或按「發布應用程式」
- **登入後又被導回首頁、沒有變成登入狀態**：多半是 `AUTH_SECRET` 沒設或設了之後沒 Redeploy
- **組員打開連結被要求登入 Vercel**：跟這份無關，是 Vercel 的 Deployment Protection，到 Settings → Deployment Protection 把 Production 的保護關掉，並且分享正式網域而不是 Preview 網址
- Preview 部署（每次 push 產生的帶雜湊網址）的網域不在上面的授權清單裡，**在 Preview 網址上無法完成 Google 登入**，這是預期的；請用正式網域測試登入

## 本機開發

複製 `.env.example` 成 `.env.local` 並填入值（`.env.local` 已在 `.gitignore`，不會被 commit）。`AUTH_SECRET` 一定要有，
不然任何跟 session 有關的請求都會 500（`MissingSecret`）。沒填 Google 的 ID/密鑰時，網站其他部分照常運作，只是點登入會失敗。
