import { validatePrefs, type Pref } from "@/lib/assign";
import { ActivityFullError, getStore, NameTakenError, SubmissionClosedError } from "@/lib/store";
import {
  errorResponse,
  HttpError,
  isPastDeadline,
  loadActivity,
  newId,
  newToken,
  sha256,
} from "@/lib/service";

export const dynamic = "force-dynamic";

// 資料庫層（Postgres trigger／FileStore 的同一個交易）擋下的情況：路由前面的檢查是「先讀再寫」，
// 兩者之間如果主辦方剛好按了分組或有人搶走最後名額，會在這裡被擋下，回給使用者看得懂的訊息
function storeRefusal(e: unknown): never {
  if (e instanceof SubmissionClosedError) throw new HttpError(409, "主辦方已經執行分組，無法再修改");
  if (e instanceof ActivityFullError) throw new HttpError(409, "名額已滿，無法再加入");
  if (e instanceof NameTakenError) throw new HttpError(409, "這個名字已經有人使用，請換一個");
  throw e;
}

// 讀取自己的填寫（與結算後自己的分配結果）
export async function GET(req: Request, ctx: RouteContext<"/api/activities/[id]/submission">) {
  try {
    const { id } = await ctx.params;
    const a = await loadActivity(id);
    const token = req.headers.get("x-member-token");
    const sub = token ? await getStore().getSubmissionByToken(id, sha256(token)) : null;
    if (!sub) return Response.json({ submission: null });
    const mine = a.result?.find((r) => r.memberId === sub.id) ?? null;
    return Response.json({
      submission: { displayName: sub.displayName, prefs: sub.prefs, updatedAt: sub.updatedAt },
      assignment: mine ? { roleId: mine.roleId, rank: mine.rank } : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 新增或更新自己的填寫
export async function PUT(req: Request, ctx: RouteContext<"/api/activities/[id]/submission">) {
  try {
    const { id } = await ctx.params;
    const a = await loadActivity(id);
    if (a.status !== "open") throw new HttpError(409, "主辦方已經執行分組，無法再修改");
    if (isPastDeadline(a)) throw new HttpError(409, "已經截止填寫，無法再修改");

    const body = (await req.json().catch(() => null)) as { displayName?: unknown; prefs?: Pref[] } | null;
    const prefs = Array.isArray(body?.prefs)
      ? body.prefs.map((p) => ({ roleId: String(p.roleId), rank: Number(p.rank), desire: Number(p.desire) }))
      : [];
    const err = validatePrefs(a.mode, prefs, a.roles.map((r) => r.id));
    if (err) throw new HttpError(400, err);

    const store = getStore();
    const token = req.headers.get("x-member-token");
    const existing = token ? await store.getSubmissionByToken(id, sha256(token)) : null;
    if (existing) {
      await store.updateSubmissionPrefs(existing.id, prefs).catch(storeRefusal);
      return Response.json({ ok: true });
    }

    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 30) throw new HttpError(400, "名字需 1～30 字");
    const capacity = a.roles.reduce((s, r) => s + r.capacity, 0);
    if ((await store.countSubmissions(id)) >= capacity)
      throw new HttpError(409, "名額已滿，無法再加入");

    const newTok = newToken();
    const now = new Date().toISOString();
    await store
      .insertSubmission({
        id: newId(),
        activityId: id,
        displayName,
        memberTokenHash: sha256(newTok),
        prefs,
        createdAt: now,
        updatedAt: now,
      })
      .catch(storeRefusal);
    return Response.json({ ok: true, memberToken: newTok }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
