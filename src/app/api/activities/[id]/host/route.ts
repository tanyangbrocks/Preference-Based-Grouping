import { parseActivityInput, type ActivityInput } from "@/lib/activity-input";
import { errorResponse, HttpError, isPastDeadline, loadActivity, publicView, tokenMatches } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function authorize(req: Request, id: string) {
  const a = await loadActivity(id);
  if (!tokenMatches(req.headers.get("x-host-token"), a.hostTokenHash))
    throw new HttpError(403, "主辦方權杖無效");
  return a;
}

// 主辦方驗證：回傳內容與公開資訊相同（主辦方看不到任何人的志願）
export async function GET(req: Request, ctx: RouteContext<"/api/activities/[id]/host">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await publicView(await authorize(req, id)));
  } catch (e) {
    return errorResponse(e);
  }
}

// 主辦方修改活動（截止前才可以）。
// 名稱、敘述、截止時間、職位名稱／說明／人數上限可以直接改；
// 新增或刪除職位會讓已填的志願失效 → 必須帶 resetSubmissions: true，並清除所有人的填寫。
export async function PATCH(req: Request, ctx: RouteContext<"/api/activities/[id]/host">) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(req, id);
    if (a.status !== "open" || isPastDeadline(a)) throw new HttpError(409, "已經截止，無法再修改");

    const body = (await req.json().catch(() => null)) as (ActivityInput & { resetSubmissions?: unknown }) | null;
    const edit = parseActivityInput(body, a.roles);
    const reset = body?.resetSubmissions === true;

    const store = getStore();
    const count = await store.countSubmissions(id);
    const before = a.roles.map((r) => r.id).sort().join();
    const after = edit.roles.map((r) => r.id).sort().join();
    const structural = before !== after;

    if (structural && count > 0 && !reset) {
      return Response.json(
        {
          error: `已有 ${count} 人填寫。新增或刪除職位會清除所有人的志願，組員需要重新填寫。`,
          needsReset: true,
          submissionCount: count,
        },
        { status: 409 },
      );
    }
    const capacity = edit.roles.reduce((s, r) => s + r.capacity, 0);
    if (!reset && capacity < count)
      throw new HttpError(400, `已有 ${count} 人填寫，人數上限加總不可少於 ${count}`);

    if (!(await store.updateActivity(id, edit, reset && count > 0)))
      throw new HttpError(409, "已經截止，無法再修改");
    return Response.json(await publicView((await store.getActivity(id))!));
  } catch (e) {
    return errorResponse(e);
  }
}
