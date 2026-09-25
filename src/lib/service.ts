import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { customAlphabet } from "nanoid";
import { acceptableTier, assign, desireBudget } from "./assign";
import { getStore, StoreConfigError, type ActivityRow } from "./store";

export const newId = customAlphabet("23456789abcdefghijkmnpqrstuvwxyz", 10);
export const newToken = () => randomBytes(24).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function tokenMatches(token: string | null, hash: string): boolean {
  if (!token) return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof StoreConfigError) return Response.json({ error: e.message }, { status: 503 });
  console.error(e);
  const name = (e as Error)?.name ?? "";
  if (/Neon|Postgres|fetch/i.test(name) || /database|connect|ECONN|fetch failed/i.test(String((e as Error)?.message)))
    return Response.json({ error: "資料庫連線失敗，請稍後再試（主辦方可到 /api/health 檢查設定）" }, { status: 503 });
  return Response.json({ error: "伺服器錯誤" }, { status: 500 });
}

export const isPastDeadline = (a: ActivityRow) => Date.now() >= Date.parse(a.deadline);

/**
 * 執行分組：只能由主辦方觸發（見 /api/activities/[id]/host/finalize），
 * 截止時間到了**不會**自動執行——是否分組、什麼時候分組完全由主辦方決定，
 * 截止前也可以提前執行。只會成功執行一次（用 claimFinalize 搶鎖）。
 */
export async function finalizeNow(a: ActivityRow): Promise<ActivityRow> {
  if (a.status === "finalized") return a;
  const store = getStore();
  if (await store.claimFinalize(a.id)) {
    const subs = await store.listSubmissions(a.id);
    const res = assign(
      a.roles.map((r) => ({ id: r.id, capacity: r.capacity })),
      subs.map((s) => ({ id: s.id, prefs: s.prefs })),
      a.seed,
      { k: acceptableTier(a.mode, a.roles.length) },
    );
    await store.saveResult(a.id, res.assignments, res.effectiveK, res.events);
  }
  return (await store.getActivity(a.id))!;
}

/** 對外公開的活動資訊：不含任何人的志願內容、不含 seed（結算前） */
export async function publicView(a: ActivityRow) {
  const store = getStore();
  const finalized = a.status === "finalized";
  let result: { name: string; roleId: string }[] | null = null;
  if (finalized && a.result) {
    const names = new Map((await store.listSubmissions(a.id)).map((s) => [s.id, s.displayName]));
    result = a.result
      .map((r) => ({ name: names.get(r.memberId) ?? "?", roleId: r.roleId }))
      .sort((x, y) => x.name.localeCompare(y.name, "zh-Hant"));
  }
  const capacity = a.roles.reduce((s, r) => s + r.capacity, 0);
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline,
    serverNow: new Date().toISOString(),
    roles: [...a.roles]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(({ id, name, description, capacity }) => ({ id, name, description, capacity })),
    mode: a.mode,
    k: acceptableTier(a.mode, a.roles.length),
    capacity,
    submissionCount: await store.countSubmissions(a.id),
    status: a.status,
    seedHash: a.seedHash,
    seed: finalized ? a.seed : null,
    editedAt: a.editedAt ?? null,
    effectiveK: finalized ? a.effectiveK : null,
    /** 因志願衝突無解而落在前 k 志願之外的人數（不公開是誰） */
    relaxedCount: finalized && a.result
      ? a.result.filter((r) => r.rank > acceptableTier(a.mode, a.roles.length)).length
      : 0,
    result,
  };
}

export type PublicActivity = Awaited<ReturnType<typeof publicView>>;

export async function loadActivity(id: string): Promise<ActivityRow> {
  const a = await getStore().getActivity(id);
  if (!a) throw new HttpError(404, "找不到這個活動");
  return a;
}

/**
 * 主辦方專用的分組明細（只在結算後提供）：
 * 每人分到第幾志願、在該志願押了幾點，以及抽籤／讓位／放寬事件。
 * 不含任何人其他志願的排序。
 */
export async function hostDetail(a: ActivityRow) {
  if (a.status !== "finalized" || !a.result) return null;
  const subs = await getStore().listSubmissions(a.id);
  const byId = new Map(subs.map((s) => [s.id, s]));
  const name = (id: string) => byId.get(id)?.displayName ?? "?";
  const k = acceptableTier(a.mode, a.roles.length);
  const relaxed = new Set(a.events?.flatMap((e) => (e.type === "relax" ? e.memberIds : [])) ?? []);

  const rows = a.result
    .map((r) => ({
      name: name(r.memberId),
      roleId: r.roleId,
      rank: r.rank,
      desire: byId.get(r.memberId)?.prefs.find((p) => p.roleId === r.roleId)?.desire ?? 0,
      outsideK: r.rank > k,
      relaxed: relaxed.has(r.memberId),
    }))
    .sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name, "zh-Hant"));

  const events = (a.events ?? []).map((e) => {
    switch (e.type) {
      case "tie":
        return { ...e, winners: e.winners.map(name), losers: e.losers.map(name) };
      case "yield":
        return { ...e, memberId: name(e.memberId) };
      case "relax":
      case "fallback":
        return { ...e, memberIds: e.memberIds.map(name) };
    }
  });

  return {
    mode: a.mode,
    budget: a.mode === "bid" ? desireBudget(a.roles.length) : a.mode === "tier" ? 3 : 0,
    k,
    rows,
    events,
    hasEventLog: a.events !== null,
  };
}

export type HostDetail = NonNullable<Awaited<ReturnType<typeof hostDetail>>>;

/**
 * 主辦方專用：已填寫名單與時間（誰填了、第一次填寫時間、最後修改時間）。
 * 不含志願內容，截止前後、結算前後都可以看。
 */
export async function hostSubmissions(a: ActivityRow) {
  const subs = await getStore().listSubmissions(a.id);
  return subs
    .map((s) => ({
      name: s.displayName,
      submittedAt: s.createdAt,
      updatedAt: s.updatedAt,
      edited: s.updatedAt !== s.createdAt,
    }))
    .sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
}

export type HostSubmissions = Awaited<ReturnType<typeof hostSubmissions>>;
