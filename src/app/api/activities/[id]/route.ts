import { errorResponse, loadActivity, publicView } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/activities/[id]">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await publicView(await loadActivity(id)));
  } catch (e) {
    return errorResponse(e);
  }
}
