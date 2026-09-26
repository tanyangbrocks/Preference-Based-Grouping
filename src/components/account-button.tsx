"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";

/** 全站共用的右上角帳號按鈕：未登入顯示登入圖示，登入後顯示頭像 + 下拉登出。 */
export function AccountButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === "loading") return <div className="h-8 w-8 rounded-full bg-field" />;

  if (!session?.user) {
    return (
      <button type="button" onClick={() => signIn("google")}
        className="tap-bounce flex h-8 items-center gap-1.5 rounded-full border border-border bg-field px-3 text-xs text-muted hover:bg-accent-soft hover:text-accent"
        aria-label="使用 Google 登入">
        <UserIcon /> 登入
      </button>
    );
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="tap-bounce block h-8 w-8 overflow-hidden rounded-full border border-border"
        aria-label="帳號選單">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-accent-soft text-xs text-accent">
            {session.user.name?.[0] ?? "?"}
          </span>
        )}
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="關閉選單"
            onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-surface p-2 shadow-lg backdrop-blur-xl">
            <p className="truncate px-2 py-1 text-xs text-muted">{session.user.name ?? session.user.email}</p>
            <button type="button" onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent-soft">
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  );
}
