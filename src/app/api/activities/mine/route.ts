import { auth } from "@/lib/auth";
import { errorResponse, HttpError, myActivitiesView } from "@/lib/service";

export const dynamic = "force-dynamic";

// 「我的活動」列表：只回傳目前登入帳號自己建立的活動（精簡視圖），不含志願內容。
export async function GET() {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new HttpError(401, "請先登入");
    return Response.json(await myActivitiesView(ownerId));
  } catch (e) {
    return errorResponse(e);
  }
}
