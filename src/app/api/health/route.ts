import { databaseUrl, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 部署診斷：資料庫是否設定、連不連得上（不回傳任何連線字串）
export async function GET() {
  const configured = !!databaseUrl();
  if (!configured && process.env.VERCEL) {
    return Response.json(
      { ok: false, database: "missing", hint: "Vercel → Storage → 建立 Neon 資料庫並 Connect，然後 Redeploy" },
      { status: 503 },
    );
  }
  try {
    await getStore().ping();
    return Response.json({ ok: true, database: configured ? "postgres" : "local-file" });
  } catch (e) {
    return Response.json(
      { ok: false, database: "unreachable", error: String((e as Error)?.message ?? e).slice(0, 200) },
      { status: 503 },
    );
  }
}
