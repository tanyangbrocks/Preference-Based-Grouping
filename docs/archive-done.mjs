#!/usr/bin/env node
// 復刻 C:\Portfolio\docs\archive-done.ps1 的機制（Node 版，跟本專案其他工具腳本一致）。
// 把「實作進度.md」的「最新完成」表格裁到只留最新 N 筆，較舊的搬進 docs/history/completed.md。
//
// 用法：node docs/archive-done.mjs [--trigger 8] [--keep 5]
// 超過 trigger 筆才動手歸檔，歸檔後留最新 keep 筆（兩個數字分開，不是同一個參數）。
//
// 表格的列順序是「舊→新」（新完成的功能加在表格最後一行，不是插在最前面），
// 所以「保留最新 N 筆」= 保留**最後** N 列，把**前面**的列搬去歷史檔——
// 這跟 archive-done.ps1 原始版本的方向剛好相反；那份 PowerShell 版本假設「新→舊」
// （keep = 前 N 列），但實際檔案內容是舊在上新在下，兩份原始檔案（Portfolio 跟
// SkillCreatorUE5）在這件事上都跟自己檔案的實際列序不一致。這裡照 RoleMatch 實際
// 使用的方向（舊在上、新在下）寫，是正確版本，不是原始版本的逐字翻譯。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const argNum = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const trigger = argNum("--trigger", 8);
const keep = argNum("--keep", 5);

const progressFile = path.join(root, "實作進度.md");
const historyFile = path.join(root, "docs/history/completed.md");

const lines = readFileSync(progressFile, "utf8").split(/\r?\n/);

// 找「最新完成」表格的分隔線（|---|---|---| 那一行），這個檔案的第一個表格就是它
const sepIdx = lines.findIndex((l) => /^\|[-| ]+\|$/.test(l.trim()));
if (sepIdx < 0) {
  console.error("[archive-done] 找不到表格分隔線，檢查「實作進度.md」格式是否被改動過");
  process.exit(1);
}
const headerIdx = sepIdx - 1;
const dataStart = sepIdx + 1;
let dataEnd = dataStart - 1;
for (let i = dataStart; i < lines.length; i++) {
  if (lines[i].startsWith("|")) dataEnd = i;
  else break;
}
const dataRows = lines.slice(dataStart, dataEnd + 1).filter((l) => l.startsWith("|"));

if (dataRows.length <= trigger) {
  console.log(`[archive-done] 表格目前 ${dataRows.length} 列（門檻 ${trigger}），不需要歸檔。`);
  process.exit(0);
}

// 舊在前、新在後：保留最後 keep 列，把前面搬去歷史檔
const toArchive = dataRows.slice(0, dataRows.length - keep);
const toKeep = dataRows.slice(dataRows.length - keep);

const before = lines.slice(0, dataStart);
const after = lines.slice(dataEnd + 1);
writeFileSync(progressFile, [...before, ...toKeep, ...after].join("\n"), "utf8");

mkdirSync(path.dirname(historyFile), { recursive: true });
const historyHeader = existsSync(historyFile)
  ? ""
  : `# 已完成事項歷史紀錄\n\n> 從「實作進度.md」自動歸檔出來的舊紀錄，最新的在最下面（跟主檔案同方向）。\n\n${lines[headerIdx]}\n${lines[sepIdx]}\n`;
const historyBody = toArchive.join("\n") + "\n";
writeFileSync(historyFile, (existsSync(historyFile) ? readFileSync(historyFile, "utf8") : historyHeader) + historyBody, "utf8");

console.log(`[archive-done] 歸檔了 ${toArchive.length} 列到 docs/history/completed.md，「實作進度.md」保留最新 ${toKeep.length} 列。`);
