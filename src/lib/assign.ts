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

export interface AssignResult {
  assignments: Assignment[];
  /** 原本的可接受範圍 ⌈m/2⌉ */
  k: number;
  /** 實際使用的範圍；> k 代表因志願衝突放寬 */
  effectiveK: number;
}

export const DESIRE_BUDGET = 100;

export function acceptableK(roleCount: number): number {
  return Math.ceil(roleCount / 2);
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

    for (const u of members) {
      if (!tryAug(u, new Set())) return null;
    }
    return assign;
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
  if (members.length === 0) return { assignments: [], k, effectiveK: k };

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
  const allowedFor = (kk: number) =>
    new Map(ids.map((id) => [id, byRank.get(id)!.slice(0, kk).map((p) => p.roleId)]));

  // 找最小可行 K′
  let effectiveK = k;
  let matcher = new Matcher(allowedFor(k));
  while (!matcher.match(ids, fullCap)) {
    effectiveK++;
    if (effectiveK > m) throw new Error("無法分配（名額不足）");
    matcher = new Matcher(allowedFor(effectiveK));
  }

  const remCap = new Map(fullCap);
  const remaining = new Set(ids);
  const result = new Map<string, string>();

  for (let round = 1; round <= effectiveK; round++) {
    const cands = [...remaining].sort((a, b) => {
      const da = byRank.get(a)![round - 1].desire;
      const db = byRank.get(b)![round - 1].desire;
      return db - da || tie.get(a)! - tie.get(b)!;
    });
    for (const u of cands) {
      const r = byRank.get(u)![round - 1].roleId;
      const cap = remCap.get(r)!;
      if (cap === 0) continue;
      remCap.set(r, cap - 1);
      remaining.delete(u);
      if (matcher.match([...remaining], remCap)) {
        result.set(u, r);
      } else {
        remCap.set(r, cap);
        remaining.add(u);
      }
    }
  }

  // 保底：理論上很少發生；invariant 保證一定匹配得到
  if (remaining.size > 0) {
    const rest = [...remaining].sort((a, b) => tie.get(a)! - tie.get(b)!);
    const fin = matcher.match(rest, remCap)!;
    for (const [u, r] of fin) result.set(u, r);
  }

  const assignments = ids.map((id) => {
    const roleId = result.get(id)!;
    const rank = byRank.get(id)!.find((p) => p.roleId === roleId)!.rank;
    return { memberId: id, roleId, rank };
  });
  return { assignments, k, effectiveK };
}

// ---------- 輸入驗證（前後端共用）----------

export function validatePrefs(prefs: Pref[], roleIds: string[]): string | null {
  if (prefs.length !== roleIds.length) return "必須排序所有職位";
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
    if (!Number.isInteger(p.desire) || p.desire < 0 || p.desire > DESIRE_BUDGET)
      return "渴望度必須是 0～100 的整數";
    sum += p.desire;
  }
  if (sum !== DESIRE_BUDGET) return `渴望度總和必須剛好 ${DESIRE_BUDGET}（目前 ${sum}）`;
  return null;
}
