"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityHeader, Loading, ResultView, RoleList, useActivity } from "@/components/activity";
import { hostKey, storage } from "@/lib/client";
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
  const { data: a, error, remaining } = useActivity(`/api/activities/${id}/host`, { "x-host-token": token });
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => location.origin,
    () => "",
  );

  if (!a) return <Loading error={error} />;
  const inviteUrl = `${origin}/a/${id}`;
  const hostUrl = `${origin}/a/${id}/host#t=${token}`;

  return (
    <div className="space-y-5">
      <ActivityHeader a={a} remaining={remaining} />
      {a.status === "finalized" ? <ResultView a={a} /> : <Share inviteUrl={inviteUrl} title={a.title} />}
      <RoleList a={a} />
      <RevealCard index={3} className="space-y-2 text-sm">
        <h2 className="font-semibold text-accent">主辦方後台連結</h2>
        <p className="text-muted">
          這個瀏覽器已經記住你的主辦方身分。如果要在其他裝置回到這個後台，請保存下面的連結，不要分享給組員。
        </p>
        <CopyField value={hostUrl} />
      </RevealCard>
      <p className="text-center text-xs text-muted">
        主辦方只看得到填寫人數，看不到任何人的志願，也無法修改或重新分配。
      </p>
    </div>
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
