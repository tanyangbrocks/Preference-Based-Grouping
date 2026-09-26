import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActivityRow, SubmissionRow } from "./store";

vi.mock("server-only", () => ({}));

// 用真正的 FileStore，但把資料檔導到暫存資料夾，不碰開發用的 .data/dev-db.json。
// FileStore 在第一次 getStore() 時才決定檔案路徑，所以必須先換掉 cwd 再動態 import。
const tmp = mkdtempSync(path.join(tmpdir(), "rolematch-test-"));
let store: import("./store").Store;
let S: typeof import("./store");
let finalizeByHost: typeof import("./service").finalizeByHost;
let HttpError: typeof import("./service").HttpError;
let sha256: typeof import("./service").sha256;

beforeAll(async () => {
  for (const k of Object.keys(process.env)) if (/DATABASE_URL|POSTGRES_URL|STORAGE_URL/.test(k)) delete process.env[k];
  delete process.env.VERCEL;
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  S = await import("./store");
  store = S.getStore();
  ({ finalizeByHost, HttpError, sha256 } = await import("./service"));
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

let n = 0;
const roles = [
  { id: "r0", name: "美術", description: "", capacity: 1, sortOrder: 0 },
  { id: "r1", name: "程式", description: "", capacity: 1, sortOrder: 1 },
];
const prefsA = [{ roleId: "r0", rank: 1, desire: 2 }, { roleId: "r1", rank: 2, desire: 1 }];
const prefsB = [{ roleId: "r1", rank: 1, desire: 2 }, { roleId: "r0", rank: 2, desire: 1 }];

const sub = (activityId: string, name: string, prefs = prefsA): SubmissionRow => {
  const now = new Date().toISOString();
  return { id: `${activityId}-${name}`, activityId, displayName: name, memberTokenHash: name, prefs, createdAt: now, updatedAt: now };
};

/**
 * 建立活動。填寫一律在 open 狀態下寫入（跟真實流程一樣，資料庫護欄不允許在非 open 時寫入），
 * 最後才把狀態改成要測的狀態（FileStore 的 createActivity 是整列覆蓋，填寫紀錄不受影響）。
 */
async function seed(over: Partial<ActivityRow> = {}, withSubs = true) {
  const id = `t${++n}`;
  const base: ActivityRow = {
    id,
    title: "測試",
    description: "",
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    mode: "bid",
    hostTokenHash: sha256("tok"),
    seed: "seed",
    seedHash: sha256("seed"),
    status: "open",
    finalizingAt: null,
    effectiveK: null,
    result: null,
    events: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    roles,
    ownerId: null,
    favorited: false,
    archived: false,
  };
  await store.createActivity(base);
  if (withSubs) {
    await store.insertSubmission(sub(id, "甲", prefsA));
    await store.insertSubmission(sub(id, "乙", prefsB));
  }
  if (over.status && over.status !== "open") await store.createActivity({ ...base, ...over });
  return (await store.getActivity(id))!;
}

describe("finalizeByHost：主辦方手動分組（含卡住的 finalizing 鎖，回歸測試）", () => {
  it("open → 分組成功，兩人各拿到自己的第一志願", async () => {
    const done = await finalizeByHost(await seed());
    expect(done.status).toBe("finalized");
    expect(done.result).toHaveLength(2);
  });

  it("finalizing 鎖已過期（上一次分組被中斷超過 60 秒）→ 接手完成，不能永遠卡住", async () => {
    const stuck = await seed({ status: "finalizing", finalizingAt: new Date(Date.now() - 120_000).toISOString() });
    const done = await finalizeByHost(stuck);
    expect(done.status).toBe("finalized");
    expect(done.result).toHaveLength(2);
  });

  it("finalizing 鎖還新（別的請求正在分組）→ 409，狀態不動", async () => {
    const busy = await seed({ status: "finalizing", finalizingAt: new Date().toISOString() });
    await expect(finalizeByHost(busy)).rejects.toMatchObject({ status: 409 });
    expect((await store.getActivity(busy.id))!.status).toBe("finalizing");
  });

  it("已經 finalized → 409，不會重新分配", async () => {
    const done = await finalizeByHost(await seed());
    await expect(finalizeByHost(done)).rejects.toBeInstanceOf(HttpError);
    await expect(finalizeByHost(done)).rejects.toMatchObject({ status: 409 });
  });
});

// 對應 docs/sql/harden-submissions.sql 的 trigger：FileStore 在同一個序列化交易內做同樣的檢查，
// 兩種資料庫行為必須一致（checklist B）。Postgres 那份的 SQL 另外用 PGlite 驗證過。
describe("儲存志願的資料庫層護欄：活動不是 open／名額已滿時一律擋下", () => {
  it("執行分組後，新增志願 → SubmissionClosedError，而且沒有寫進去", async () => {
    const a = await finalizeByHost(await seed({}, false));
    await expect(store.insertSubmission(sub(a.id, "遲到者"))).rejects.toBeInstanceOf(S.SubmissionClosedError);
    expect(await store.countSubmissions(a.id)).toBe(0);
  });

  it("執行分組後，修改既有志願 → SubmissionClosedError，內容不變", async () => {
    const a = await seed();
    await finalizeByHost(a);
    await expect(store.updateSubmissionPrefs(`${a.id}-甲`, prefsB)).rejects.toBeInstanceOf(S.SubmissionClosedError);
    const mine = (await store.listSubmissions(a.id)).find((s) => s.displayName === "甲")!;
    expect(mine.prefs).toEqual(prefsA);
  });

  it("正在分組（finalizing）中也擋：不能在搶到鎖之後、讀志願之前塞進新志願", async () => {
    const a = await seed({ status: "finalizing", finalizingAt: new Date().toISOString() }, false);
    await expect(store.insertSubmission(sub(a.id, "搶時間"))).rejects.toBeInstanceOf(S.SubmissionClosedError);
    await expect(store.updateSubmissionPrefs("nope", prefsA)).resolves.toBeUndefined(); // 不存在的填寫：沒事可做，不誤報
  });

  it("名額已滿（2 個職位各 1 人）：第 3 人 → ActivityFullError；已在名單裡的人仍可修改自己的志願", async () => {
    const a = await seed(); // 已有 甲、乙 = 2 人 = 名額上限
    await expect(store.insertSubmission(sub(a.id, "丙"))).rejects.toBeInstanceOf(S.ActivityFullError);
    await expect(store.updateSubmissionPrefs(`${a.id}-甲`, prefsB)).resolves.toBeUndefined();
    expect(await store.countSubmissions(a.id)).toBe(2);
  });

  it("重名仍然是 NameTakenError（名額未滿時）", async () => {
    const a = await seed({}, false);
    await store.insertSubmission(sub(a.id, "甲"));
    await expect(store.insertSubmission(sub(a.id, "甲"))).rejects.toBeInstanceOf(S.NameTakenError);
  });
});
