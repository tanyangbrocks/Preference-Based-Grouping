import "server-only";
import { isMode, type Mode } from "./assign";
import type { RoleRow } from "./store";
import { HttpError } from "./service";

export interface ActivityInput {
  title?: unknown;
  description?: unknown;
  deadline?: unknown;
  mode?: unknown;
  roles?: { id?: unknown; name?: unknown; description?: unknown; capacity?: unknown }[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * 驗證建立／編輯活動的輸入。
 * existing：編輯時傳入目前的職位；帶著既有 id 的職位保留 id，其餘視為新增。
 * currentMode：沒傳 mode 時沿用（編輯時為活動目前的模式）。
 * currentDeadline：編輯時活動目前的截止時間；如果送出的截止時間跟這個完全一樣（代表主辦方
 * 沒有要改截止時間，只是在改別的欄位），就不重新檢查「至少 1 分鐘後」——不然截止時間快到時，
 * 光是填表單、按送出花掉的那幾十秒，就會讓一個完全沒碰截止時間的編輯被這條規則誤擋。
 * 如果截止時間真的已經過了，DB 層的 `deadline > now()` 檢查還是會擋下來，訊息才是準確的
 * 「已經截止，無法再修改」，不會漏掉這個保護。
 */
export function parseActivityInput(
  body: ActivityInput | null,
  existing: RoleRow[] = [],
  currentMode: Mode = "bid",
  currentDeadline?: string,
) {
  if (!body) throw new HttpError(400, "格式錯誤");

  const title = str(body.title);
  const description = str(body.description);
  if (!title || title.length > 100) throw new HttpError(400, "活動名稱需 1～100 字");
  if (description.length > 2000) throw new HttpError(400, "敘述最多 2000 字");

  const deadlineMs = Date.parse(str(body.deadline));
  if (Number.isNaN(deadlineMs)) throw new HttpError(400, "截止時間格式錯誤");
  const deadlineUnchanged = currentDeadline !== undefined && deadlineMs === Date.parse(currentDeadline);
  if (!deadlineUnchanged && deadlineMs < Date.now() + 60_000)
    throw new HttpError(400, "截止時間必須在至少 1 分鐘後");
  if (deadlineMs > Date.now() + 366 * 86400_000) throw new HttpError(400, "截止時間不可超過一年");

  const rawRoles = Array.isArray(body.roles) ? body.roles : [];
  if (rawRoles.length < 2 || rawRoles.length > 20) throw new HttpError(400, "職位數量需 2～20 個");

  const existingIds = new Set(existing.map((r) => r.id));
  let nextNum = Math.max(-1, ...existing.map((r) => Number(r.id.slice(1)) || 0)) + 1;
  const names = new Set<string>();
  const usedIds = new Set<string>();
  const roles: RoleRow[] = rawRoles.map((r, i) => {
    const name = str(r.name);
    const capacity = Number(r.capacity);
    if (!name || name.length > 40) throw new HttpError(400, `第 ${i + 1} 個職位名稱需 1～40 字`);
    if (names.has(name)) throw new HttpError(400, `職位名稱重複：${name}`);
    names.add(name);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)
      throw new HttpError(400, `「${name}」的人數上限需為 1～100 的整數`);
    const keepId = typeof r.id === "string" && existingIds.has(r.id) && !usedIds.has(r.id);
    const id = keepId ? (r.id as string) : `r${nextNum++}`;
    usedIds.add(id);
    return { id, name, description: str(r.description).slice(0, 200), capacity, sortOrder: i };
  });

  const mode = body.mode === undefined ? currentMode : body.mode;
  if (!isMode(mode)) throw new HttpError(400, "未知的活動模式");

  return { title, description, deadline: new Date(deadlineMs).toISOString(), mode, roles };
}
