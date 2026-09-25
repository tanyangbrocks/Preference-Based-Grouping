import { errorResponse, finalizeNow, hostDetail, hostSubmissions, HttpError, loadActivity, publicView, tokenMatches } from "@/lib/service";

export const dynamic = "force-dynamic";

// 主辦方手動執行分組。截止時間到了**不會**自動分組——什麼時候分組完全由主辦方決定；
// 截止前也可以提前執行（執行後組員就無法再修改志願）。只會成功執行一次。
export async function POST(req: Request, ctx: RouteContext<"/api/activities/[id]/host/finalize">) {
  try {
    const { id } = await ctx.params;
    const a = await loadActivity(id);
    if (!tokenMatches(req.headers.get("x-host-token"), a.hostTokenHash))
      throw new HttpError(403, "主辦方權杖無效");
    if (a.status !== "open") throw new HttpError(409, "已經分組過了，或正在分組中");

    const done = await finalizeNow(a);
    return Response.json({
      ...(await publicView(done)),
      detail: await hostDetail(done),
      submissions: await hostSubmissions(done),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
