// 分配演算法：逐輪志願 + 可行性檢查（見 docs/plan-rolematch.md §三）
// 純函式，不碰 DB，方便單元測試與重現驗證。

export interface RoleSpec {
  id: string;
  capacity: number;
}

export interface Pref {
  roleId: string;
  rank: number; // 1 = 最想要
  desire: number; // 渴望度點數
}

export interface MemberSub {
  id: string;
  prefs: Pref[]; // 必須涵蓋全部職位
}

export interface Assignment {
  memberId: string;
  roleId: string;
  rank: number;
}

/** 分配過程中值得讓主辦方知道的事件 */
export type AssignEvent =
  /** 同一輪、同一職位、渴望度相同，名額不夠 → 依 seed 抽籤決定 */
  | { type: "tie"; round: number; roleId: string; desire: number; winners: string[]; losers: string[] }
  /** 本來搶得到這個志願，但給了他會讓別人落到可接受範圍之外 → 讓位 */
  | { type: "yield"; round: number; roleId: string; memberId: string; desire: number }
  /** 志願衝突無解：這些人（依 seed 隨機選出、人數已是最少）被放寬到前 K 志願之外 */
  | { type: "relax"; k: number; memberIds: string[] }
  /** 逐輪分配後仍未分到，由保底匹配安排（理論上極少發生） */
  | { type: "fallback"; memberIds: string[] };

export interface AssignResult {
  assignments: Assignment[];
  events: AssignEvent[];
  /** 原本的可接受範圍 ⌈m/2⌉ */
  k: number;
  /** 實際使用的範圍；> k 代表因志願衝突放寬 */
  effectiveK: number;
}

export function acceptableK(roleCount: number): number {
  return Math.ceil(roleCount / 2);
}

/** 渴望度總點數 = 職位數 × 3 ÷ 2（奇數時無條件進位） */
export function desireBudget(roleCount: number): number {
  return Math.ceil((roleCount * 3) / 2);
}

/** 只用前 kk 志願時，最多能同時安排幾個人（測試與診斷用） */
export function maxMatchWithin(roles: RoleSpec[], members: MemberSub[], kk: number): number {
  const allowed = new Map(
    members.map((mem) => [
      mem.id,
      [...mem.prefs].sort((a, b) => a.rank - b.rank).slice(0, kk).map((p) => p.roleId),
    ]),
  );
  const cap = new Map(roles.map((r) => [r.id, r.capacity]));
  return new Matcher(allowed).maxSize(members.map((x) => x.id), cap);
}

// ---------- seeded RNG（平手用，結果可重現）----------

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// ---------- 帶名額的二分匹配（Kuhn）----------

class Matcher {
  constructor(
    private allowed: Map<string, string[]>, // member → 可接受職位（依志願序）
  ) {}

  /** members 是否能全部排進 remCap（每人只能進自己的 allowed）。回傳匹配或 null */
  match(members: string[], remCap: Map<string, number>): Map<string, string> | null {
    const { assign, complete } = this.run(members, remCap, true);
    return complete ? assign : null;
  }

  /** 最大匹配人數 */
  maxSize(members: string[], remCap: Map<string, number>): number {
    return this.run(members, remCap, false).assign.size;
  }

  private run(members: string[], remCap: Map<string, number>, stopOnFail: boolean) {
    const assign = new Map<string, string>();
    const roleMembers = new Map<string, string[]>();
    for (const r of remCap.keys()) roleMembers.set(r, []);

    const tryAug = (u: string, visited: Set<string>): boolean => {
      for (const r of this.allowed.get(u) ?? []) {
        if (visited.has(r)) continue;
        visited.add(r);
        const list = roleMembers.get(r);
        if (!list) continue;
        if (list.length < (remCap.get(r) ?? 0)) {
          list.push(u);
          assign.set(u, r);
          return true;
        }
        for (let i = 0; i < list.length; i++) {
          if (tryAug(list[i], visited)) {
            list[i] = u;
            assign.set(u, r);
            return true;
          }
        }
      }
      return false;
    };

    let complete = true;
    for (const u of members) {
      if (!tryAug(u, new Set())) {
        complete = false;
        if (stopOnFail) break;
      }
    }
    return { assign, complete };
  }
}

// ---------- 主演算法 ----------

export function assign(roles: RoleSpec[], members: MemberSub[], seed: string): AssignResult {
  const m = roles.length;
  const k = acceptableK(m);
  const totalCap = roles.reduce((s, r) => s + r.capacity, 0);
  if (members.length > totalCap) {
    throw new Error(`人數 ${members.length} 超過總名額 ${totalCap}`);
  }
  if (members.length === 0) return { assignments: [], events: [], k, effectiveK: k };

  const byRank = new Map<string, Pref[]>(); // member → prefs sorted by rank
  for (const mem of members) {
    byRank.set(mem.id, [...mem.prefs].sort((a, b) => a.rank - b.rank));
  }

  // 平手順序：先依 id 排序確保與輸入順序無關，再用 seed 洗牌
  const rng = sfc32(...cyrb128(seed));
  const ids = members.map((x) => x.id).sort();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const tie = new Map(ids.map((id, i) => [id, i]));

  const fullCap = new Map(roles.map((r) => [r.id, r.capacity]));

  // 每人的可接受範圍（前 level[u] 志願）。預設全部 K；無解時只放寬「必要的最少人數」
  const level = new Map(ids.map((id) => [id, k]));
  const allowed = new Map<string, string[]>();
  const setLevel = (u: string, lv: number) => {
    level.set(u, lv);
    allowed.set(u, byRank.get(u)!.slice(0, lv).map((p) => p.roleId));
  };
  for (const u of ids) setLevel(u, k);
  const matcher = new Matcher(allowed);

  if (!matcher.match(ids, fullCap)) {
    // 階段 A：依 seed 隨機順序，逐一嘗試把人收緊到前 K，收不進的先放到不限。
    // 「能同時落在前 K 的人」構成 transversal matroid，貪心可得最大人數 → 放寬人數最少。
    for (const u of ids) setLevel(u, m);
    const relaxed: string[] = [];
    for (const u of ids) {
      setLevel(u, k);
      if (!matcher.match(ids, fullCap)) {
        setLevel(u, m);
        relaxed.push(u);
      }
    }
    // 階段 B：被放寬的人也盡量收緊（K+1、K+2…）
    for (const u of relaxed) {
      for (let lv = k + 1; lv < m; lv++) {
        setLevel(u, lv);
        if (matcher.match(ids, fullCap)) break;
        setLevel(u, m);
      }
    }
  }
  const effectiveK = Math.max(...level.values());
  const events: AssignEvent[] = [];
  const relaxedIds = ids.filter((u) => level.get(u)! > k);
  if (relaxedIds.length) events.push({ type: "relax", k, memberIds: relaxedIds });

  const remCap = new Map(fullCap);
  const remaining = new Set(ids);
  const result = new Map<string, string>();

  for (let round = 1; round <= effectiveK; round++) {
    const cands = [...remaining].filter((u) => round <= level.get(u)!).sort((a, b) => {
      const da = byRank.get(a)![round - 1].desire;
      const db = byRank.get(b)![round - 1].desire;
      return db - da || tie.get(a)! - tie.get(b)!;
    });
    const won = new Map<string, { u: string; d: number }[]>(); // 本輪各職位得主
    const full: { u: string; r: string; d: number }[] = []; // 本輪因名額已滿落選
    for (const u of cands) {
      const { roleId: r, desire: d } = byRank.get(u)![round - 1];
      const cap = remCap.get(r)!;
      if (cap === 0) {
        full.push({ u, r, d });
        continue;
      }
      remCap.set(r, cap - 1);
      remaining.delete(u);
      if (matcher.match([...remaining], remCap)) {
        result.set(u, r);
        won.set(r, [...(won.get(r) ?? []), { u, d }]);
      } else {
        remCap.set(r, cap);
        remaining.add(u);
        events.push({ type: "yield", round, roleId: r, memberId: u, desire: d });
      }
    }
    // 抽籤：落選者和本輪某位得主押了相同點數
    const ties = new Map<string, { roleId: string; desire: number; winners: string[]; losers: string[] }>();
    for (const { u, r, d } of full) {
      const same = (won.get(r) ?? []).filter((w) => w.d === d);
      if (!same.length) continue;
      const key = `${r}|${d}`;
      const t = ties.get(key) ?? { roleId: r, desire: d, winners: same.map((w) => w.u), losers: [] };
      t.losers.push(u);
      ties.set(key, t);
    }
    for (const t of ties.values()) events.push({ type: "tie", round, ...t });
  }

  // 保底：理論上很少發生；invariant 保證一定匹配得到
  if (remaining.size > 0) {
    const rest = [...remaining].sort((a, b) => tie.get(a)! - tie.get(b)!);
    const fin = matcher.match(rest, remCap)!;
    for (const [u, r] of fin) result.set(u, r);
    events.push({ type: "fallback", memberIds: rest });
  }

  const assignments = ids.map((id) => {
    const roleId = result.get(id)!;
    const rank = byRank.get(id)!.find((p) => p.roleId === roleId)!.rank;
    return { memberId: id, roleId, rank };
  });
  return { assignments, events, k, effectiveK };
}

// ---------- 輸入驗證（前後端共用）----------

export function validatePrefs(prefs: Pref[], roleIds: string[]): string | null {
  if (prefs.length !== roleIds.length) return "必須排序所有職位";
  const budget = desireBudget(roleIds.length);
  const seenRole = new Set<string>();
  const seenRank = new Set<number>();
  let sum = 0;
  for (const p of prefs) {
    if (!roleIds.includes(p.roleId)) return "未知的職位";
    if (seenRole.has(p.roleId)) return "職位重複";
    seenRole.add(p.roleId);
    if (!Number.isInteger(p.rank) || p.rank < 1 || p.rank > roleIds.length || seenRank.has(p.rank))
      return "志願序不正確";
    seenRank.add(p.rank);
    if (!Number.isInteger(p.desire) || p.desire < 0 || p.desire > budget)
      return `渴望度必須是 0～${budget} 的整數`;
    sum += p.desire;
  }
  if (sum !== budget) return `渴望度總和必須剛好 ${budget}（目前 ${sum}）`;
  return null;
}
