// 資料層：有 DATABASE_URL → Neon Postgres；沒有 → 本機 JSON 檔（只供開發用）
import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { promises as fs } from "fs";
import path from "path";
import type { AssignEvent, Assignment, Mode, Pref } from "./assign";

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  capacity: number;
  sortOrder: number;
}

export interface ActivityRow {
  id: string;
  title: string;
  description: string;
  deadline: string; // ISO UTC
  /** 活動模式；舊資料沒有此欄位時視為 bid */
  mode: Mode;
  hostTokenHash: string;
  seed: string;
  seedHash: string;
  status: "open" | "finalizing" | "finalized";
  finalizingAt: string | null;
  effectiveK: number | null;
  result: Assignment[] | null; // memberId = submission id
  /** 分配過程事件（抽籤、讓位、放寬）；舊資料為 null */
  events: AssignEvent[] | null;
  createdAt: string;
  /** 主辦方最後一次修改活動的時間（公開顯示，讓組員知道活動被改過） */
  editedAt: string | null;
  roles: RoleRow[];
}

export interface ActivityEdit {
  title: string;
  description: string;
  deadline: string;
  mode: Mode;
  roles: RoleRow[];
}

/** 資料庫未設定或連不上：回給使用者看得懂的訊息 */
export class StoreConfigError extends Error {}

export interface SubmissionRow {
  id: string;
  activityId: string;
  displayName: string;
  memberTokenHash: string;
  prefs: Pref[];
  /** 第一次送出的時間（之後修改志願不會變） */
  createdAt: string;
  /** 最後一次送出／修改的時間 */
  updatedAt: string;
}

export class NameTakenError extends Error {}

export interface Store {
  createActivity(a: ActivityRow): Promise<void>;
  getActivity(id: string): Promise<ActivityRow | null>;
  countSubmissions(activityId: string): Promise<number>;
  listSubmissions(activityId: string): Promise<SubmissionRow[]>;
  getSubmissionByToken(activityId: string, tokenHash: string): Promise<SubmissionRow | null>;
  insertSubmission(s: SubmissionRow): Promise<void>; // 重名丟 NameTakenError
  updateSubmissionPrefs(id: string, prefs: Pref[]): Promise<void>;
  /** open → finalizing（或搶回卡住超過 60 秒的 finalizing）。搶到回 true */
  claimFinalize(activityId: string): Promise<boolean>;
  saveResult(activityId: string, result: Assignment[], effectiveK: number, events: AssignEvent[]): Promise<void>;
  /** 只在 open 且未截止時成功；resetSubmissions 會一併刪除所有填寫。成功回 true */
  updateActivity(id: string, edit: ActivityEdit, resetSubmissions: boolean): Promise<boolean>;
  /** 健康檢查：確認連得上 */
  ping(): Promise<void>;
}

const STALE_MS = 60_000;

// ---------------- Postgres ----------------

class PgStore implements Store {
  private sql: NeonQueryFunction<false, false>;
  private ready: Promise<void> | null = null;

  constructor(url: string) {
    this.sql = neon(url);
  }

  private ensure() {
    this.ready ??= (async () => {
      const sql = this.sql;
      await sql`CREATE TABLE IF NOT EXISTS activities (
        id text PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL,
        deadline timestamptz NOT NULL,
        host_token_hash text NOT NULL,
        seed text NOT NULL,
        seed_hash text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        finalizing_at timestamptz,
        effective_k int,
        result jsonb,
        roles jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS submissions (
        id text PRIMARY KEY,
        activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        display_name text NOT NULL,
        member_token_hash text NOT NULL,
        prefs jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (activity_id, display_name)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS submissions_token ON submissions(activity_id, member_token_hash)`;
      await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS edited_at timestamptz`;
      await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS events jsonb`;
      await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'bid'`;
      await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  async createActivity(a: ActivityRow) {
    await this.ensure();
    await this.sql`INSERT INTO activities
      (id, title, description, deadline, mode, host_token_hash, seed, seed_hash, status, roles, created_at)
      VALUES (${a.id}, ${a.title}, ${a.description}, ${a.deadline}, ${a.mode}, ${a.hostTokenHash}, ${a.seed},
              ${a.seedHash}, 'open', ${JSON.stringify(a.roles)}, ${a.createdAt})`;
  }

  async getActivity(id: string) {
    await this.ensure();
    const rows = await this.sql`SELECT * FROM activities WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      deadline: new Date(r.deadline).toISOString(),
      mode: r.mode ?? "bid",
      hostTokenHash: r.host_token_hash,
      seed: r.seed,
      seedHash: r.seed_hash,
      status: r.status,
      finalizingAt: r.finalizing_at ? new Date(r.finalizing_at).toISOString() : null,
      effectiveK: r.effective_k,
      result: r.result,
      events: r.events ?? null,
      createdAt: new Date(r.created_at).toISOString(),
      editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
      roles: r.roles,
    } as ActivityRow;
  }

  async countSubmissions(activityId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT count(*)::int AS n FROM submissions WHERE activity_id = ${activityId}`;
    return rows[0].n as number;
  }

  private toSub(r: Record<string, unknown>): SubmissionRow {
    return {
      id: r.id as string,
      activityId: r.activity_id as string,
      displayName: r.display_name as string,
      memberTokenHash: r.member_token_hash as string,
      prefs: r.prefs as Pref[],
      createdAt: new Date((r.created_at ?? r.updated_at) as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    };
  }

  async listSubmissions(activityId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT * FROM submissions WHERE activity_id = ${activityId}`;
    return rows.map((r) => this.toSub(r));
  }

  async getSubmissionByToken(activityId: string, tokenHash: string) {
    await this.ensure();
    const rows = await this.sql`SELECT * FROM submissions
      WHERE activity_id = ${activityId} AND member_token_hash = ${tokenHash}`;
    return rows.length ? this.toSub(rows[0]) : null;
  }

  async insertSubmission(s: SubmissionRow) {
    await this.ensure();
    try {
      await this.sql`INSERT INTO submissions (id, activity_id, display_name, member_token_hash, prefs, created_at, updated_at)
        VALUES (${s.id}, ${s.activityId}, ${s.displayName}, ${s.memberTokenHash}, ${JSON.stringify(s.prefs)},
                ${s.createdAt}, ${s.createdAt})`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new NameTakenError();
      throw e;
    }
  }

  async updateSubmissionPrefs(id: string, prefs: Pref[]) {
    await this.ensure();
    await this.sql`UPDATE submissions SET prefs = ${JSON.stringify(prefs)}, updated_at = now() WHERE id = ${id}`;
  }

  async claimFinalize(activityId: string) {
    await this.ensure();
    const stale = new Date(Date.now() - STALE_MS).toISOString();
    const rows = await this.sql`UPDATE activities SET status = 'finalizing', finalizing_at = now()
      WHERE id = ${activityId}
        AND (status = 'open' OR (status = 'finalizing' AND finalizing_at < ${stale}))
      RETURNING id`;
    return rows.length > 0;
  }

  async updateActivity(id: string, e: ActivityEdit, resetSubmissions: boolean) {
    await this.ensure();
    // 單一語句（data-modifying CTE）：活動仍可編輯才更新，且只有更新成功才清除填寫
    const rows = await this.sql`
      WITH upd AS (
        UPDATE activities SET title = ${e.title}, description = ${e.description},
          deadline = ${e.deadline}, mode = ${e.mode}, roles = ${JSON.stringify(e.roles)}, edited_at = now()
        WHERE id = ${id} AND status = 'open' AND deadline > now()
        RETURNING id
      ), del AS (
        DELETE FROM submissions WHERE ${resetSubmissions}::boolean AND activity_id IN (SELECT id FROM upd)
      )
      SELECT id FROM upd`;
    return rows.length > 0;
  }

  async ping() {
    await this.ensure();
    await this.sql`SELECT 1`;
  }

  async saveResult(activityId: string, result: Assignment[], effectiveK: number, events: AssignEvent[]) {
    await this.ensure();
    await this.sql`UPDATE activities SET status = 'finalized', result = ${JSON.stringify(result)},
      effective_k = ${effectiveK}, events = ${JSON.stringify(events)}
      WHERE id = ${activityId} AND status = 'finalizing'`;
  }
}

// ---------------- 本機 JSON 檔 ----------------

interface FileDb {
  activities: Record<string, ActivityRow>;
  submissions: SubmissionRow[];
}

class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "dev-db.json");
  private lock: Promise<unknown> = Promise.resolve();

  private async load(): Promise<FileDb> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {
      return { activities: {}, submissions: [] };
    }
  }

  /** 序列化所有讀寫，避免同程序內競爭 */
  private tx<T>(fn: (db: FileDb) => T | Promise<T>, write = false): Promise<T> {
    const run = this.lock.then(async () => {
      const db = await this.load();
      const out = await fn(db);
      if (write) {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(this.file, JSON.stringify(db, null, 2));
      }
      return out;
    });
    this.lock = run.catch(() => {});
    return run;
  }

  createActivity(a: ActivityRow) {
    return this.tx((db) => void (db.activities[a.id] = a), true);
  }
  getActivity(id: string) {
    return this.tx((db) => {
      const a = db.activities[id];
      return a ? { ...a, mode: a.mode ?? "bid" } : null;
    });
  }
  countSubmissions(activityId: string) {
    return this.tx((db) => db.submissions.filter((s) => s.activityId === activityId).length);
  }
  listSubmissions(activityId: string) {
    return this.tx((db) => db.submissions.filter((s) => s.activityId === activityId));
  }
  getSubmissionByToken(activityId: string, tokenHash: string) {
    return this.tx(
      (db) =>
        db.submissions.find((s) => s.activityId === activityId && s.memberTokenHash === tokenHash) ?? null,
    );
  }
  insertSubmission(s: SubmissionRow) {
    return this.tx((db) => {
      if (db.submissions.some((x) => x.activityId === s.activityId && x.displayName === s.displayName))
        throw new NameTakenError();
      db.submissions.push(s);
    }, true);
  }
  updateSubmissionPrefs(id: string, prefs: Pref[]) {
    return this.tx((db) => {
      const s = db.submissions.find((x) => x.id === id);
      if (s) {
        s.prefs = prefs;
        s.updatedAt = new Date().toISOString();
      }
    }, true);
  }
  claimFinalize(activityId: string) {
    return this.tx((db) => {
      const a = db.activities[activityId];
      if (!a) return false;
      const stale = a.status === "finalizing" && Date.now() - Date.parse(a.finalizingAt ?? "") > STALE_MS;
      if (a.status !== "open" && !stale) return false;
      a.status = "finalizing";
      a.finalizingAt = new Date().toISOString();
      return true;
    }, true);
  }
  updateActivity(id: string, e: ActivityEdit, resetSubmissions: boolean) {
    return this.tx((db) => {
      const a = db.activities[id];
      if (!a || a.status !== "open" || Date.parse(a.deadline) <= Date.now()) return false;
      Object.assign(a, e, { editedAt: new Date().toISOString() });
      if (resetSubmissions) db.submissions = db.submissions.filter((s) => s.activityId !== id);
      return true;
    }, true);
  }
  async ping() {}
  saveResult(activityId: string, result: Assignment[], effectiveK: number, events: AssignEvent[]) {
    return this.tx((db) => {
      const a = db.activities[activityId];
      if (a?.status !== "finalizing") return;
      a.status = "finalized";
      a.result = result;
      a.effectiveK = effectiveK;
      a.events = events;
    }, true);
  }
}

let instance: Store | null = null;

/** Vercel 接 Neon 時依設定的前綴不同，變數名稱可能是這幾種 */
export function databaseUrl(): string | undefined {
  const env = process.env;
  return (
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.STORAGE_URL ||
    Object.entries(env).find(([k, v]) => v && /_(DATABASE|POSTGRES)_URL$/.test(k))?.[1]
  );
}

export function getStore(): Store {
  if (instance) return instance;
  const url = databaseUrl();
  if (url) {
    instance = new PgStore(url);
  } else {
    if (process.env.VERCEL)
      throw new StoreConfigError(
        "網站尚未連接資料庫：請到 Vercel 專案的 Storage 分頁建立 Neon 資料庫並 Connect，然後 Redeploy",
      );
    instance = new FileStore();
  }
  return instance;
}
