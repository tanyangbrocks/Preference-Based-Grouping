"use client";

import { useEffect, useState } from "react";
import type { HostDetail, HostSubmissions, MyActivities, PublicActivity } from "./service";

export type { HostDetail, HostSubmissions, MyActivities, PublicActivity };

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `錯誤 ${res.status}`, res.status, data);
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
/** 主辦方 API 的驗證標頭；沒有權杖（空字串）就不帶，改靠登入帳號比對建立者 */
export const hostHeaders = (token: string): Record<string, string> => (token ? { "x-host-token": token } : {});
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

const HOUR = 3600_000;
const DAY = 86400_000;

export interface Countdown {
  text: string;
  /** 3 天／1 天／1 小時內：紅色標籤 */
  urgent: boolean;
}

/** 倒數文字＋是否進入緊急範圍（3 天內顯示天數、1 天內顯示小時、1 小時內顯示分鐘，皆標紅） */
export function countdown(ms: number): Countdown {
  if (ms <= 0) return { text: "已截止", urgent: false };
  if (ms <= HOUR) return { text: `還剩 ${Math.ceil(ms / 60_000)} 分鐘`, urgent: true };
  if (ms <= DAY) return { text: `還剩 ${Math.ceil(ms / HOUR)} 小時`, urgent: true };
  if (ms <= 3 * DAY) return { text: `還剩 ${Math.ceil(ms / DAY)} 天`, urgent: true };
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return { text: `剩 ${d} 天 ${h} 小時`, urgent: false };
}
