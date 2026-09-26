import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActivityRow } from "./store";

vi.mock("server-only", () => ({}));

// 用真正的 FileStore，但把資料檔導到暫存資料夾，不碰開發用的 .data/dev-db.json。
// FileStore 在第一次 getStore() 時才決定檔案路徑，所以必須先換掉 cwd 再動態 import。
const tmp = mkdtempSync(path.join(tmpdir(), "rolematch-test-"));
let getStore: typeof import("./store").getStore;
let finalizeByHost: typeof import("./service").finalizeByHost;
let HttpError: typeof import("./service").HttpError;
let sha256: typeof import("./service").sha256;

beforeAll(async () => {
  for (const k of Object.keys(process.env)) if (/DATABASE_URL|POSTGRES_URL|STORAGE_URL/.test(k)) delete process.env[k];
  delete process.env.VERCEL;
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  ({ getStore } = await import("./store"));
  ({ finalizeByHost, HttpError, sha256 } = await import("./service"));
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

let n = 0;
async function seed(over: Partial<ActivityRow>) {
  const store = getStore();
  const id = `t${++n}`;
  const a: ActivityRow = {
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
    roles: [
      { id: "r0", name: "美術", description: "", capacity: 1, sortOrder: 0 },
      { id: "r1", name: "程式", description: "", capacity: 1, sortOrder: 1 },
    ],
    ownerId: null,
    favorited: false,
    archived: false,
    ...over,
  };
  await store.createActivity(a);
  const now = new Date().toISOString();
  await store.insertSubmission({
    id: `${id}-a`, activityId: id, displayName: "甲", memberTokenHash: "x", createdAt: now, updatedAt: now,
    prefs: [{ roleId: "r0", rank: 1, desire: 2 }, { roleId: "r1", rank: 2, desire: 1 }],
  });
  await store.insertSubmission({
    id: `${id}-b`, activityId: id, displayName: "乙", memberTokenHash: "y", createdAt: now, updatedAt: now,
    prefs: [{ roleId: "r1", rank: 1, desire: 2 }, { roleId: "r0", rank: 2, desire: 1 }],
  });
  return (await store.getActivity(id))!;
}

describe("finalizeByHost：主辦方手動分組（含卡住的 finalizing 鎖，回歸測試）", () => {
  it("open → 分組成功，兩人各拿到自己的第一志願", async () => {
    const done = await finalizeByHost(await seed({}));
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
    expect((await getStore().getActivity(busy.id))!.status).toBe("finalizing");
  });

  it("已經 finalized → 409，不會重新分配", async () => {
    const done = await finalizeByHost(await seed({}));
    await expect(finalizeByHost(done)).rejects.toBeInstanceOf(HttpError);
    await expect(finalizeByHost(done)).rejects.toMatchObject({ status: 409 });
  });
});
