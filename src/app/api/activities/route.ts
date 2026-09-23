import { randomBytes } from "crypto";
import { parseActivityInput, type ActivityInput } from "@/lib/activity-input";
import { errorResponse, newId, newToken, sha256 } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  try {
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
      createdAt: new Date().toISOString(),
      editedAt: null,
    });
    return Response.json({ id, hostToken }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
