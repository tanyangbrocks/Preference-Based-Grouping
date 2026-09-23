"use client";

import { useEffect, useState } from "react";
import type { PublicActivity } from "./service";

export type { PublicActivity };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `錯誤 ${res.status}`);
  return data as T;
}

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

export const hostKey = (id: string) => `host:${id}`;
export const memberKey = (id: string) => `member:${id}`;

export function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 以伺服器時間校正的倒數（毫秒）；offset = 伺服器時間 − 本機時間 */
export function useRemaining(deadline: string | undefined, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  return Date.parse(deadline) - (now + offset);
}

export function formatRemaining(ms: number) {
  if (ms <= 0) return "已截止";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `剩 ${d} 天 ${h} 小時`;
  if (h > 0) return `剩 ${h} 小時 ${m} 分`;
  return `剩 ${m} 分 ${sec.toString().padStart(2, "0")} 秒`;
}
