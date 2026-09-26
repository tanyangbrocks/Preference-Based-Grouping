import { auth } from "@/lib/auth";
import { errorResponse, HttpError, loadActivity, publicView } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/activities/[id]">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await publicView(await loadActivity(id)));
  } catch (e) {
    return errorResponse(e);
  }
}

// 永久刪除活動（含所有填寫紀錄）：只有活動的建立者（目前登入帳號）能刪，不需要 host token
// ——避免「知道 hostToken 的人可以刪掉活動」這種比原本編輯權限更危險的能力。
export async function DELETE(_req: Request, ctx: RouteContext<"/api/activities/[id]">) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new HttpError(401, "請先登入");

    const { id } = await ctx.params;
    const ok = await getStore().deleteActivity(id, ownerId);
    if (!ok) throw new HttpError(404, "找不到這個活動，或不是你建立的");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
