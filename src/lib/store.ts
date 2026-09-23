// 資料層：有 DATABASE_URL → Neon Postgres；沒有 → 本機 JSON 檔（只供開發用）
import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { promises as fs } from "fs";
import path from "path";
import type { Assignment, Pref } from "./assign";

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
  hostTokenHash: string;
  seed: string;
  seedHash: string;
  status: "open" | "finalizing" | "finalized";
  finalizingAt: string | null;
  effectiveK: number | null;
  result: Assignment[] | null; // memberId = submission id
  createdAt: string;
  roles: RoleRow[];
}

export interface SubmissionRow {
  id: string;
  activityId: string;
  displayName: string;
  memberTokenHash: string;
  prefs: Pref[];
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
  saveResult(activityId: string, result: Assignment[], effectiveK: number): Promise<void>;
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
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (activity_id, display_name)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS submissions_token ON submissions(activity_id, member_token_hash)`;
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  async createActivity(a: ActivityRow) {
    await this.ensure();
    await this.sql`INSERT INTO activities
      (id, title, description, deadline, host_token_hash, seed, seed_hash, status, roles, created_at)
      VALUES (${a.id}, ${a.title}, ${a.description}, ${a.deadline}, ${a.hostTokenHash}, ${a.seed},
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
      hostTokenHash: r.host_token_hash,
      seed: r.seed,
      seedHash: r.seed_hash,
      status: r.status,
      finalizingAt: r.finalizing_at ? new Date(r.finalizing_at).toISOString() : null,
      effectiveK: r.effective_k,
      result: r.result,
      createdAt: new Date(r.created_at).toISOString(),
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
      await this.sql`INSERT INTO submissions (id, activity_id, display_name, member_token_hash, prefs)
        VALUES (${s.id}, ${s.activityId}, ${s.displayName}, ${s.memberTokenHash}, ${JSON.stringify(s.prefs)})`;
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

  async saveResult(activityId: string, result: Assignment[], effectiveK: number) {
    await this.ensure();
    await this.sql`UPDATE activities SET status = 'finalized', result = ${JSON.stringify(result)},
      effective_k = ${effectiveK} WHERE id = ${activityId} AND status = 'finalizing'`;
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
    return this.tx((db) => db.activities[id] ?? null);
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
  saveResult(activityId: string, result: Assignment[], effectiveK: number) {
    return this.tx((db) => {
      const a = db.activities[activityId];
      if (a?.status !== "finalizing") return;
      a.status = "finalized";
      a.result = result;
      a.effectiveK = effectiveK;
    }, true);
  }
}

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (url) {
    instance = new PgStore(url);
  } else {
    if (process.env.VERCEL) throw new Error("未設定 DATABASE_URL");
    instance = new FileStore();
  }
  return instance;
}
