import { getStore } from "@/lib/store";
import { errorResponse, HttpError, newId, newToken, sha256 } from "@/lib/service";
import { randomBytes } from "crypto";

interface CreateBody {
  title?: unknown;
  description?: unknown;
  deadline?: unknown;
  roles?: { name?: unknown; description?: unknown; capacity?: unknown }[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body) throw new HttpError(400, "格式錯誤");

    const title = str(body.title);
    const description = str(body.description);
    if (!title || title.length > 100) throw new HttpError(400, "活動名稱需 1～100 字");
    if (description.length > 2000) throw new HttpError(400, "敘述最多 2000 字");

    const deadlineMs = Date.parse(str(body.deadline));
    if (Number.isNaN(deadlineMs)) throw new HttpError(400, "截止時間格式錯誤");
    if (deadlineMs < Date.now() + 60_000) throw new HttpError(400, "截止時間必須在未來");
    if (deadlineMs > Date.now() + 366 * 86400_000) throw new HttpError(400, "截止時間不可超過一年");

    const rawRoles = Array.isArray(body.roles) ? body.roles : [];
    if (rawRoles.length < 2 || rawRoles.length > 20) throw new HttpError(400, "職位數量需 2～20 個");
    const names = new Set<string>();
    const roles = rawRoles.map((r, i) => {
      const name = str(r.name);
      const capacity = Number(r.capacity);
      if (!name || name.length > 40) throw new HttpError(400, `第 ${i + 1} 個職位名稱需 1～40 字`);
      if (names.has(name)) throw new HttpError(400, `職位名稱重複：${name}`);
      names.add(name);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)
        throw new HttpError(400, `「${name}」名額需為 1～100 的整數`);
      return { id: `r${i}`, name, description: str(r.description).slice(0, 200), capacity, sortOrder: i };
    });

    const id = newId();
    const hostToken = newToken();
    const seed = randomBytes(32).toString("hex");
    await getStore().createActivity({
      id,
      title,
      description,
      deadline: new Date(deadlineMs).toISOString(),
      hostTokenHash: sha256(hostToken),
      seed,
      seedHash: sha256(seed),
      status: "open",
      finalizingAt: null,
      effectiveK: null,
      result: null,
      createdAt: new Date().toISOString(),
      roles,
    });
    return Response.json({ id, hostToken }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
