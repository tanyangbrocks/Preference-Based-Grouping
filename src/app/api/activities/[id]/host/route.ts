import { errorResponse, HttpError, loadActivity, publicView, tokenMatches } from "@/lib/service";

export const dynamic = "force-dynamic";

// 主辦方驗證：只確認身分，回傳內容與公開資訊相同（主辦方看不到任何人的志願）
export async function GET(req: Request, ctx: RouteContext<"/api/activities/[id]/host">) {
  try {
    const { id } = await ctx.params;
    const a = await loadActivity(id);
    if (!tokenMatches(req.headers.get("x-host-token"), a.hostTokenHash))
      throw new HttpError(403, "主辦方權杖無效");
    return Response.json(await publicView(a));
  } catch (e) {
    return errorResponse(e);
  }
}
