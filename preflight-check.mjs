#!/usr/bin/env node
// RoleMatch preflight check — 復刻 C:\SkillCreatorUE5\preflight-check.ps1 的風格
// Run: node preflight-check.mjs [--skip-build]
//
// 分類跟 SkillCreatorUE5 那份一樣三層：
//   Tier 1（PASS/FAIL）— 這裡壞了就是真的壞了：build/lint/type/test、資料庫連線、設定檔正確性
//   Tier 2（WARN）     — 不會讓網站壞，但值得注意：本機測試資料太多、git 有未提交的變更
//   Tier 3（SKIP）     — 明確跳過，並說明原因（例如沒有 DATABASE_URL 就不測 Postgres 連線）
//
// 注意：這支腳本只能抓「跑得動、程式碼結構正確」的問題，無法確認「畫面看起來對不對」、
// 「使用者體感順不順」——這些仍需要人親自打開瀏覽器測；本機也另外準備了一份
// docs/checklist-code-review.md，列出「讀程式碼就能找到、但這支腳本抓不到」的檢查項目。

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const skipBuild = process.argv.includes("--skip-build");

let pass = 0, fail = 0, warn = 0, skip = 0;
const c = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", gray: "\x1b[90m", cyan: "\x1b[36m", reset: "\x1b[0m" };
const Pass = (msg) => { console.log(`  ${c.green}OK ${c.reset} ${msg}`); pass++; };
const Fail = (msg) => { console.log(`  ${c.red}NG ${c.reset} ${msg}`); fail++; };
const Warn = (msg) => { console.log(`  ${c.yellow}WW ${c.reset} ${msg}`); warn++; };
const Skip = (msg) => { console.log(`  ${c.gray}-- ${c.reset} ${msg}`); skip++; };
const Head = (msg) => console.log(`\n${c.cyan}-- ${msg} --${c.reset}`);

// 所有呼叫端傳進來的 cmd/args 都是寫死的常數（不是使用者輸入），這裡組字串執行是安全的；
// 用 execSync + 字串（而不是 execFileSync + args 陣列 + shell:true）是為了避開 Node 的
// DEP0190 棄用警告——那個警告是針對「陣列參數 + shell:true」這個組合，不是真的偵測到風險。
function run(cmd, args) {
  const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  try {
    const out = execSync([cmd, ...quoted].join(" "), { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Tier 1: 靜態檢查

Head("Tier 1 — 靜態檢查（build / lint / type / test）");

{
  const r = run("npx", ["eslint"]);
  r.ok ? Pass("eslint 無錯誤") : Fail(`eslint 有錯誤：\n${r.out.split("\n").slice(0, 15).join("\n")}`);
}
{
  const r = run("npx", ["tsc", "--noEmit"]);
  r.ok ? Pass("tsc --noEmit 通過") : Fail(`型別錯誤：\n${r.out.split("\n").slice(0, 15).join("\n")}`);
}
{
  const r = run("npx", ["vitest", "run"]);
  const m = r.out.match(/Tests\s+(\d+) passed(?: \| (\d+) failed)?/);
  if (r.ok && m) Pass(`vitest：${m[1]} passed`);
  else Fail(`vitest 失敗：\n${r.out.split("\n").slice(-25).join("\n")}`);
}
if (skipBuild) {
  Skip("next build（傳了 --skip-build，跳過；平常 push 前建議至少跑一次完整版）");
} else {
  const r = run("npm", ["run", "build"]);
  r.ok ? Pass("next build 成功") : Fail(`next build 失敗：\n${r.out.split("\n").slice(-30).join("\n")}`);
}

// ---------------------------------------------------------------- Tier 1: 設定檔正確性

Head("Tier 1 — 設定檔正確性");

{
  const pkg = readJson(path.join(root, "package.json"));
  if (!pkg) Fail("package.json 讀不到或不是合法 JSON");
  else {
    if (pkg.name === "scaffold") Fail("package.json 的 name 還是 create-next-app 預設值 'scaffold'（應為 preference-based-grouping）");
    else Pass(`package.json name = ${pkg.name}`);
    for (const script of ["build", "lint", "dev"]) {
      if (pkg.scripts?.[script]) Pass(`package.json 有 ${script} script`);
      else Fail(`package.json 缺少 ${script} script`);
    }
  }
}
{
  const vercel = readJson(path.join(root, "vercel.json"));
  if (!vercel) Fail("vercel.json 不存在或不是合法 JSON（Vercel 匯入時可能選錯框架）");
  else if (vercel.framework !== "nextjs") Fail(`vercel.json 的 framework 是 '${vercel.framework}'，應為 'nextjs'`);
  else Pass("vercel.json framework = nextjs");
}
{
  const iconExists = existsSync(path.join(root, "src/app/icon.png"));
  iconExists ? Pass("src/app/icon.png 存在（分頁圖示）") : Warn("src/app/icon.png 不存在，會用 Next.js 預設圖示");
}
{
  // 三個活動模式的名稱要跟 assign.ts 的 MODES 對齊，避免文件/UI 悄悄漏掉一個模式
  const assignSrc = readFileSync(path.join(root, "src/lib/assign.ts"), "utf8");
  const modesSrc = readFileSync(path.join(root, "src/lib/modes.ts"), "utf8");
  const declared = [...assignSrc.matchAll(/"(bid|tier|pick)"/g)].map((m) => m[1]);
  const modesCovered = ["bid", "tier", "pick"].every((m) => modesSrc.includes(`${m}:`));
  new Set(declared).size >= 3 && modesCovered
    ? Pass("assign.ts 的三種模式都有對應到 modes.ts 的 MODE_INFO")
    : Fail("assign.ts 的 Mode 跟 modes.ts 的 MODE_INFO 對不齊，檢查是否漏了一個模式");
}

// ---------------------------------------------------------------- Tier 2: repo 衛生

Head("Tier 2 — repo 衛生檢查");

{
  const r = run("git", ["status", "--short"]);
  if (!r.ok) Skip("不在 git 儲存庫裡，跳過 git 相關檢查");
  else if (r.out.trim() === "") Pass("git 工作目錄乾淨（沒有未提交的變更）");
  else Warn(`有未提交的變更（${r.out.trim().split("\n").length} 個檔案），preflight 建議在 commit 前跑一次`);
}
{
  const r = run("git", ["ls-files", ".data"]);
  if (r.ok && r.out.trim() === "") Pass(".data/（本機開發資料庫）沒有被 git 追蹤");
  else if (r.ok) Fail(`.data/ 底下有檔案被 git 追蹤到了，應該只在 .gitignore：\n${r.out}`);
  else Skip("不在 git 儲存庫裡，跳過");
}
{
  const dbPath = path.join(root, ".data/dev-db.json");
  if (!existsSync(dbPath)) Skip("本機沒有 .data/dev-db.json（還沒跑過本機開發資料）");
  else {
    const db = readJson(dbPath);
    const n = db ? Object.keys(db.activities ?? {}).length : 0;
    if (n === 0) Pass("本機開發資料庫沒有活動");
    else if (n <= 5) Pass(`本機開發資料庫有 ${n} 個活動（數量正常）`);
    else Warn(`本機開發資料庫有 ${n} 個活動，多半是測試時累積的殘留資料，考慮刪掉 .data/dev-db.json 重來`);
  }
}
{
  // 檢查有沒有把資料庫連線字串或 token 之類的東西寫死進追蹤中的原始碼
  const r = run("git", ["grep", "-nIE", "postgres(ql)?://[^\"'` ]*:[^\"'` ]*@"]);
  if (r.ok && r.out.trim()) Fail(`原始碼裡疑似寫死了資料庫連線字串（含帳密）：\n${r.out}`);
  else Pass("沒有在追蹤中的原始碼發現寫死的資料庫連線字串");
}

// ---------------------------------------------------------------- Tier 3: 明確跳過（本腳本方法論查不到）

Head("Tier 3 — 明確跳過（不計分，只列出原因，避免誤會成「檢查過沒事」）");

Skip("實際打開瀏覽器測 UI／動畫／手機版排版：這支腳本不會啟動瀏覽器");
Skip("Vercel 正式環境的 DATABASE_URL 是否真的連得上 Neon：本機無法代測，部署後開 /api/health 確認");
Skip("Postgres 資料表 schema 是否跟最新的 CREATE/ALTER TABLE 語句一致：只有實際連線才能確認，見下方");
{
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    Skip("沒有設定 DATABASE_URL／POSTGRES_URL，跳過 Postgres 連線測試（本機開發本來就用 .data/ 檔案）");
  } else {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(url);
      await sql`SELECT 1`;
      Pass("Postgres 連線成功（DATABASE_URL / POSTGRES_URL 有效）");
    } catch (e) {
      Fail(`Postgres 連線失敗：${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------- 總結

console.log(`\n${c.cyan}====================================${c.reset}`);
console.log(`  PASS ${pass}   FAIL ${fail}   WARN ${warn}   SKIP ${skip}`);
console.log(`${c.cyan}====================================${c.reset}`);
if (fail > 0) {
  console.log(`${c.red}有 ${fail} 項 FAIL，修好再 commit/push。${c.reset}`);
  process.exit(1);
}
console.log(warn > 0 ? `${c.yellow}沒有 FAIL，但有 ${warn} 項 WARN，看一下要不要處理。${c.reset}` : `${c.green}全部通過。${c.reset}`);
