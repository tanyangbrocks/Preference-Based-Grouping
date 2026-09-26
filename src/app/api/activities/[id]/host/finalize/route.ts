import { auth } from "@/lib/auth";
import {
  errorResponse,
  finalizeByHost,
  hostDetail,
  hostSubmissions,
  HttpError,
  loadActivity,
  publicView,
  tokenMatches,
} from "@/lib/service";

export const dynamic = "force-dynamic";

// 主辦方手動執行分組。截止時間到了**不會**自動分組——什麼時候分組完全由主辦方決定；
// 截止前也可以提前執行（執行後組員就無法再修改志願）。只會成功執行一次。
// 驗證方式跟 /host 一樣：權杖或「登入帳號 = 建立者」擇一。
export async function POST(req: Request, ctx: RouteContext<"/api/activities/[id]/host/finalize">) {
  try {
    const { id } = await ctx.params;
    const a = await loadActivity(id);
    const session = await auth();
    const isOwner = !!session?.user?.id && session.user.id === a.ownerId;
    if (!isOwner && !tokenMatches(req.headers.get("x-host-token"), a.hostTokenHash))
      throw new HttpError(403, "主辦方權杖無效");

    // 不能在這裡只放行 open：卡住的 finalizing 鎖要靠 finalizeByHost → claimFinalize 接手（見 service.ts）
    const done = await finalizeByHost(a);
    return Response.json({
      ...(await publicView(done)),
      detail: await hostDetail(done),
      submissions: await hostSubmissions(done),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
