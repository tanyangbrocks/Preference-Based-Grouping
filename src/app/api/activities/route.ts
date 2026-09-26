import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { parseActivityInput, type ActivityInput } from "@/lib/activity-input";
import { errorResponse, HttpError, newId, newToken, sha256 } from "@/lib/service";
import { getStore } from "@/lib/store";

// 建立活動要求登入（主辦方帳號系統，見 docs/plan-slots-and-accounts.md §二 S1）；
// 組員填寫志願完全不用登入，這條規則只影響「建立」這個動作。
export async function POST(req: Request) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new HttpError(401, "請先登入才能建立活動");

    const input = parseActivityInput((await req.json().catch(() => null)) as ActivityInput | null);
    const store = getStore();

    const id = newId();
    const hostToken = newToken();
    const seed = randomBytes(32).toString("hex");
    await store.createActivity({
      id,
      ...input,
      hostTokenHash: sha256(hostToken),
      seed,
      seedHash: sha256(seed),
      status: "open",
      finalizingAt: null,
      effectiveK: null,
      result: null,
      events: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      ownerId,
      favorited: false,
      archived: false,
    });
    return Response.json({ id, hostToken }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
