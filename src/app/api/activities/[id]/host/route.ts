import { auth } from "@/lib/auth";
import { parseActivityInput, type ActivityInput } from "@/lib/activity-input";
import {
  errorResponse,
  hostDetail,
  hostSubmissions,
  HttpError,
  isPastDeadline,
  loadActivity,
  publicView,
  tokenMatches,
} from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 兩種方式都能通過驗證：① 帶 x-host-token（匿名建立時代代發的連結，或舊資料）
// ② 目前登入帳號就是這個活動的建立者（ownerId 相符）——兩者擇一即可，
// 不是「登入之後 token 就失效」，是為了讓舊連結繼續能用、也讓帳號可以在任何裝置直接進後台。
async function authorize(req: Request, id: string) {
  const a = await loadActivity(id);
  if (tokenMatches(req.headers.get("x-host-token"), a.hostTokenHash)) return a;
  const session = await auth();
  if (session?.user?.id && session.user.id === a.ownerId) return a;
  throw new HttpError(403, "主辦方權杖無效");
}

// 主辦方驗證：公開資訊 + 已填寫名單（誰填了、何時填的，隨時可看）
// + 結算後的分組明細（分到第幾志願、該志願押注、過程事件；不含其他志願排序）
export async function GET(req: Request, ctx: RouteContext<"/api/activities/[id]/host">) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(req, id);
    return Response.json({
      ...(await publicView(a)),
      detail: await hostDetail(a),
      submissions: await hostSubmissions(a),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 主辦方修改活動（截止前才可以）。
// 名稱、敘述、截止時間、職位名稱／說明／人數上限可以直接改；
// 新增／刪除職位或更換模式會讓已填的志願失效 → 必須帶 resetSubmissions: true，並清除所有人的填寫。
export async function PATCH(req: Request, ctx: RouteContext<"/api/activities/[id]/host">) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(req, id);
    if (a.status !== "open" || isPastDeadline(a)) throw new HttpError(409, "已經截止，無法再修改");

    const body = (await req.json().catch(() => null)) as (ActivityInput & { resetSubmissions?: unknown }) | null;
    const edit = parseActivityInput(body, a.roles, a.mode, a.deadline);
    const reset = body?.resetSubmissions === true;

    const store = getStore();
    const count = await store.countSubmissions(id);
    const before = a.roles.map((r) => r.id).sort().join();
    const after = edit.roles.map((r) => r.id).sort().join();
    const structural = before !== after || edit.mode !== a.mode;

    if (structural && count > 0 && !reset) {
      return Response.json(
        {
          error: `已有 ${count} 人填寫。新增／刪除職位或更換模式會清除所有人的志願，組員需要重新填寫。`,
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
