import { auth } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/service";
import { getStore } from "@/lib/store";

// 封存／取消封存：只有活動的建立者（目前登入帳號）能改。封存是可逆的（跟刪除不同）。
export async function PATCH(req: Request, ctx: RouteContext<"/api/activities/[id]/archive">) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new HttpError(401, "請先登入");

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { archived?: unknown } | null;
    if (typeof body?.archived !== "boolean") throw new HttpError(400, "格式錯誤");

    const ok = await getStore().setArchived(id, ownerId, body.archived);
    if (!ok) throw new HttpError(404, "找不到這個活動，或不是你建立的");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
