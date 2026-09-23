import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { customAlphabet } from "nanoid";
import { acceptableK, assign } from "./assign";
import { getStore, type ActivityRow } from "./store";

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
  console.error(e);
  return Response.json({ error: "伺服器錯誤" }, { status: 500 });
}

export const isPastDeadline = (a: ActivityRow) => Date.now() >= Date.parse(a.deadline);

/** 截止後第一個請求觸發結算；只會成功執行一次 */
export async function finalizeIfDue(a: ActivityRow): Promise<ActivityRow> {
  if (a.status === "finalized" || !isPastDeadline(a)) return a;
  const store = getStore();
  if (await store.claimFinalize(a.id)) {
    const subs = await store.listSubmissions(a.id);
    const res = assign(
      a.roles.map((r) => ({ id: r.id, capacity: r.capacity })),
      subs.map((s) => ({ id: s.id, prefs: s.prefs })),
      a.seed,
    );
    await store.saveResult(a.id, res.assignments, res.effectiveK);
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
    k: acceptableK(a.roles.length),
    capacity,
    submissionCount: await store.countSubmissions(a.id),
    status: a.status,
    seedHash: a.seedHash,
    seed: finalized ? a.seed : null,
    effectiveK: finalized ? a.effectiveK : null,
    result,
  };
}

export type PublicActivity = Awaited<ReturnType<typeof publicView>>;

export async function loadActivity(id: string): Promise<ActivityRow> {
  const a = await getStore().getActivity(id);
  if (!a) throw new HttpError(404, "找不到這個活動");
  return finalizeIfDue(a);
}
