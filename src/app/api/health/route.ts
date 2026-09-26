import { databaseUrl, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 主辦方登入（Google）需要的環境變數是否都設了——只回報「有沒有」，不回傳任何值
function authStatus() {
  const env = process.env;
  const missing = [
    !(env.AUTH_SECRET || env.NEXTAUTH_SECRET) && "AUTH_SECRET",
    !(env.AUTH_GOOGLE_ID || env.GOOGLE_CLIENT_ID) && "AUTH_GOOGLE_ID",
    !(env.AUTH_GOOGLE_SECRET || env.GOOGLE_CLIENT_SECRET) && "AUTH_GOOGLE_SECRET",
  ].filter(Boolean);
  return missing.length === 0 ? { auth: "configured" } : { auth: "incomplete", authMissing: missing };
}

// 部署診斷：資料庫是否設定、連不連得上、登入設定齊不齊（不回傳任何連線字串或密鑰）
export async function GET() {
  const configured = !!databaseUrl();
  const auth = authStatus();
  if (!configured && process.env.VERCEL) {
    return Response.json(
      { ok: false, database: "missing", ...auth, hint: "Vercel → Storage → 建立 Neon 資料庫並 Connect，然後 Redeploy" },
      { status: 503 },
    );
  }
  try {
    const store = getStore();
    await store.ping();
    // 資料庫層防護（選用）：沒裝也能運作，只是少一層保險，見 docs/sql/harden-submissions.sql
    const guard = await store.guardInstalled();
    return Response.json({
      ok: auth.auth === "configured" || !process.env.VERCEL,
      database: configured ? "postgres" : "local-file",
      ...auth,
      submissionGuard: guard === null ? "not-applicable" : guard ? "installed" : "missing",
      ...(guard === false && { submissionGuardHint: "選用：到 Neon SQL Editor 執行 docs/sql/harden-submissions.sql" }),
    });
  } catch (e) {
    return Response.json(
      { ok: false, database: "unreachable", ...auth, error: String((e as Error)?.message ?? e).slice(0, 200) },
      { status: 503 },
    );
  }
}
