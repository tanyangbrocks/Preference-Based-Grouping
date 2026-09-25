import { validatePrefs, type Pref } from "@/lib/assign";
import { getStore, NameTakenError } from "@/lib/store";
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
      await store.updateSubmissionPrefs(existing.id, prefs);
      return Response.json({ ok: true });
    }

    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 30) throw new HttpError(400, "名字需 1～30 字");
    const capacity = a.roles.reduce((s, r) => s + r.capacity, 0);
    if ((await store.countSubmissions(id)) >= capacity)
      throw new HttpError(409, "名額已滿，無法再加入");

    const newTok = newToken();
    const now = new Date().toISOString();
    try {
      await store.insertSubmission({
        id: newId(),
        activityId: id,
        displayName,
        memberTokenHash: sha256(newTok),
        prefs,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      if (e instanceof NameTakenError) throw new HttpError(409, "這個名字已經有人使用，請換一個");
      throw e;
    }
    return Response.json({ ok: true, memberToken: newTok }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
