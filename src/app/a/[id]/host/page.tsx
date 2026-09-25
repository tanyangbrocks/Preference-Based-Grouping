"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityHeader, Loading, ResultView, RoleList, useActivity } from "@/components/activity";
import { ActivityForm } from "@/components/activity-form";
import { HostDetailView } from "@/components/host-detail";
import { api, ApiError, hostKey, storage, type HostDetail, type PublicActivity } from "@/lib/client";
import { RevealCard } from "@/components/motion";

const noopSubscribe = () => () => {};

export default function HostPage() {
  const { id } = useParams<{ id: string }>();
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

  if (token === undefined) return <Loading error={null} />;
  if (token === null) {
    return (
      <div className="card space-y-3 text-center">
        <p>這個瀏覽器沒有此活動的主辦方權限。</p>
        <Link className="btn btn-primary" href={`/a/${id}`}>前往組員頁面</Link>
      </div>
    );
  }
  return <HostDashboard id={id} token={token} />;
}

function HostDashboard({ id, token }: { id: string; token: string }) {
  const { data: a, error, remaining, reload } = useActivity(`/api/activities/${id}/host`, { "x-host-token": token });
  const [editing, setEditing] = useState(false);
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => location.origin,
    () => "",
  );

  if (!a) return <Loading error={error} />;
  const inviteUrl = `${origin}/a/${id}`;
  const hostUrl = `${origin}/a/${id}/host#t=${token}`;

  const open = a.status === "open" && (remaining ?? 1) > 0;
  const detail = (a as PublicActivity & { detail?: HostDetail | null }).detail;

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
      {a.status === "finalized" ? <ResultView a={a} /> : <Share inviteUrl={inviteUrl} title={a.title} />}
      {detail && <HostDetailView a={a} detail={detail} />}
      <RoleList a={a} />
      <RevealCard index={3} className="space-y-2 text-sm">
        <h2 className="font-semibold text-accent">主辦方後台連結</h2>
        <p className="text-muted">
          這個瀏覽器已經記住你的主辦方身分。如果要在其他裝置回到這個後台，請保存下面的連結，不要分享給組員。
        </p>
        <CopyField value={hostUrl} />
      </RevealCard>
      <p className="text-center text-xs text-muted">
        截止前主辦方只看得到填寫人數；結算後可看到每人分到第幾志願與該志願的押注。任何時候都無法修改或重新分配結果。
      </p>
    </div>
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
      headers: { "x-host-token": token },
      body: JSON.stringify({ ...values, resetSubmissions }),
    });

  return (
    <ActivityForm
      initial={{ title: a.title, description: a.description, deadline: a.deadline, roles: a.roles }}
      submitLabel="儲存修改"
      busyLabel="儲存中…"
      onCancel={onCancel}
      notice={a.submissionCount > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">
          已有 {a.submissionCount} 人填寫。修改名稱、說明、人數上限不影響已填的志願；
          <strong>新增或刪除職位</strong>會清除所有人的志願，大家需要重新填寫。
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
