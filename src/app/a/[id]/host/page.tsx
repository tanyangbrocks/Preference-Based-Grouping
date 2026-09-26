"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityHeader, Loading, ResultView, RoleList, useActivity } from "@/components/activity";
import { ActivityForm } from "@/components/activity-form";
import { HostDetailView } from "@/components/host-detail";
import { HostSubmissionsList } from "@/components/host-submissions";
import {
  api,
  ApiError,
  countdown,
  hostHeaders,
  hostKey,
  storage,
  type HostDetail,
  type HostSubmissions,
  type PublicActivity,
} from "@/lib/client";
import { RevealCard } from "@/components/motion";
import { useViewport } from "@/lib/viewport";

type HostView = PublicActivity & { detail: HostDetail | null; submissions: HostSubmissions };

const noopSubscribe = () => () => {};

// 手機／電腦模式分流點：目前兩邊都是同一個 HostPageCore，長得一樣。
// 之後想讓某一邊長不同，就直接改對應的 MobileHostPage / DesktopHostPage。
export default function HostPage() {
  return useViewport() === "mobile" ? <MobileHostPage /> : <DesktopHostPage />;
}

function MobileHostPage() {
  return <HostPageCore />;
}

function DesktopHostPage() {
  return <HostPageCore />;
}

function HostPageCore() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // 權杖只存在瀏覽器（URL fragment / localStorage），必須在掛載後讀取
  useEffect(() => {
    const m = /[#&]t=([\w-]+)/.exec(location.hash);
    if (m) {
      storage.set(hostKey(id), m[1]);
      history.replaceState(null, "", location.pathname);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(m ? m[1] : storage.get(hostKey(id)));
  }, [id]);

  if (token === undefined || session.status === "loading") return <Loading error={null} />;
  // 沒有權杖也沒登入：這個瀏覽器沒有權限。已登入（可能是活動的建立者，換了裝置／清過瀏覽器資料）
  // 就不用權杖直接試，伺服器會用登入帳號比對 ownerId，不是建立者會回 403 顯示在畫面上。
  if (token === null && session.status !== "authenticated") {
    return (
      <div className="card space-y-3 text-center">
        <p>這個瀏覽器沒有此活動的主辦方權限。</p>
        <p className="text-sm text-muted">如果這是你建立的活動，請用建立時的 Google 帳號登入（右上角）。</p>
        <Link className="btn btn-primary" href={`/a/${id}`}>前往組員頁面</Link>
      </div>
    );
  }
  return <HostDashboard id={id} token={token ?? ""} />;
}

/** token 是空字串代表沒有權杖、靠登入帳號驗證身分 */
function HostDashboard({ id, token }: { id: string; token: string }) {
  const { data: a, error, remaining, reload } = useActivity<HostView>(
    `/api/activities/${id}/host`,
    hostHeaders(token),
  );
  const [editing, setEditing] = useState(false);
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => location.origin,
    () => "",
  );

  if (!a) return <Loading error={error} />;
  const inviteUrl = `${origin}/a/${id}`;
  const hostUrl = token ? `${origin}/a/${id}/host#t=${token}` : `${origin}/a/${id}/host`;

  const passed = remaining !== null && remaining <= 0;
  const open = a.status === "open" && !passed;

  if (editing && open) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-accent">編輯活動</h1>
        <EditForm a={a} token={token} onDone={() => { setEditing(false); reload(); }}
          onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ActivityHeader a={a} remaining={remaining} />
      {open && (
        <button type="button" className="btn btn-ghost w-full" onClick={() => setEditing(true)}>
          ✎ 編輯活動（截止時間、職位、人數上限…）
        </button>
      )}
      {a.status === "finalized" ? (
        <ResultView a={a} />
      ) : (
        <>
          <Share inviteUrl={inviteUrl} title={a.title} />
          <FinalizeCard id={id} token={token} passed={passed} remaining={remaining}
            submissionCount={a.submissionCount} onDone={reload} />
          <HostSubmissionsList list={a.submissions} />
        </>
      )}
      {a.detail && <HostDetailView a={a} detail={a.detail} />}
      <RoleList a={a} />
      <RevealCard index={3} className="space-y-2 text-sm">
        <h2 className="font-semibold text-accent">主辦方後台連結</h2>
        <p className="text-muted">
          {token
            ? "這個瀏覽器已經記住你的主辦方身分。如果要在其他裝置回到這個後台，用建立活動的 Google 帳號登入，在「查看已建立的活動」裡就找得到；也可以保存下面帶權杖的連結（不要分享給組員）。"
            : "你是用登入的 Google 帳號進到這裡的。任何裝置只要用同一個帳號登入，都能在「查看已建立的活動」找到這個後台。"}
        </p>
        <CopyField value={hostUrl} />
      </RevealCard>
      <p className="text-center text-xs text-muted">
        分組前主辦方看得到誰填了、什麼時候填的，但看不到填寫內容；結算後可看到每人分到第幾志願與該志願的渴望度。
        任何時候都無法修改或重新分配結果。
      </p>
    </div>
  );
}

function FinalizeCard({ id, token, passed, remaining, submissionCount, onDone }: {
  id: string;
  token: string;
  passed: boolean;
  remaining: number | null;
  submissionCount: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    const early = !passed && remaining !== null
      ? `現在還沒到截止時間（${countdown(remaining).text}），確定要提前執行分組嗎？執行後組員將無法再修改或新增志願。`
      : "確定要執行分組嗎？結果無法復原，組員也無法再修改志願。";
    if (!window.confirm(early)) return;
    setErr(null);
    setBusy(true);
    try {
      await api(`/api/activities/${id}/host/finalize`, { method: "POST", headers: hostHeaders(token) });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RevealCard index={1.5} className="space-y-2">
      <h2 className="font-semibold text-accent">執行分組</h2>
      <p className="text-sm text-muted">
        {passed
          ? "已經截止填寫。分組不會自動進行，按下面的按鈕才會執行——執行後結果無法復原。"
          : "截止時間還沒到，也可以提前執行分組；執行後組員就無法再修改志願了。"}
      </p>
      {err && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{err}</p>}
      <button type="button" onClick={run} disabled={busy || submissionCount === 0}
        className={`btn w-full py-3 text-base ${passed ? "btn-primary" : "btn-ghost"}`}>
        {busy ? "分組中…" : submissionCount === 0 ? "尚無人填寫" : passed ? "執行分組" : "提前執行分組"}
      </button>
    </RevealCard>
  );
}

function EditForm({ a, token, onDone, onCancel }: {
  a: PublicActivity;
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const save = (values: object, resetSubmissions = false) =>
    api(`/api/activities/${a.id}/host`, {
      method: "PATCH",
      headers: hostHeaders(token),
      body: JSON.stringify({ ...values, resetSubmissions }),
    });

  return (
    <ActivityForm
      initial={{ title: a.title, description: a.description, deadline: a.deadline, mode: a.mode, roles: a.roles }}
      submitLabel="儲存修改"
      busyLabel="儲存中…"
      onCancel={onCancel}
      notice={a.submissionCount > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">
          已有 {a.submissionCount} 人填寫。修改名稱、說明、人數上限不影響已填的志願；
          <strong>新增／刪除職位或更換模式</strong>會清除所有人的志願，大家需要重新填寫。
        </p>
      )}
      onSubmit={async (values) => {
        try {
          await save(values);
        } catch (e) {
          if (!(e instanceof ApiError) || !e.data.needsReset) throw e;
          if (!window.confirm(`${e.message}

確定要儲存並清除所有人的填寫嗎？`)) return;
          await save(values, true);
        }
        onDone();
      }}
    />
  );
}

function Share({ inviteUrl, title }: { inviteUrl: string; title: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!inviteUrl.startsWith("http")) return;
    QRCode.toDataURL(inviteUrl, { width: 512, margin: 2 }).then(setQr);
  }, [inviteUrl]);

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <RevealCard index={1} className="space-y-4">
      <h2 className="font-semibold text-accent">邀請組員</h2>
      <CopyField value={inviteUrl} />
      {qr && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="邀請連結 QR code" className="h-56 w-56 rounded-xl border border-border bg-white transition-transform duration-300 hover:scale-105" />
          <div className="flex gap-2">
            <a className="btn btn-ghost" href={qr} download={`${title}-QR.png`}>下載 QR code</a>
            {canShare && (
              <button className="btn btn-ghost" type="button"
                onClick={() => navigator.share({ title, url: inviteUrl }).catch(() => {})}>
                分享…
              </button>
            )}
          </div>
        </div>
      )}
    </RevealCard>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input min-w-0 flex-1 font-mono text-sm" readOnly value={value}
        onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-primary shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}>
        {copied ? "已複製" : "複製"}
      </button>
    </div>
  );
}
