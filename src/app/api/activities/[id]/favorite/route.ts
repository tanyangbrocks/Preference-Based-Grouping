import { auth } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/service";
import { getStore } from "@/lib/store";

// 切換我的最愛：只有活動的建立者（目前登入帳號）能改，不需要 host token。
export async function PATCH(req: Request, ctx: RouteContext<"/api/activities/[id]/favorite">) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new HttpError(401, "請先登入");

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { favorited?: unknown } | null;
    if (typeof body?.favorited !== "boolean") throw new HttpError(400, "格式錯誤");

    const ok = await getStore().setFavorited(id, ownerId, body.favorited);
    if (!ok) throw new HttpError(404, "找不到這個活動，或不是你建立的");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
