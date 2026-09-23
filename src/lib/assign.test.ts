import { describe, expect, it } from "vitest";
import { acceptableK, assign, validatePrefs, type MemberSub, type RoleSpec } from "./assign";

/** order: 志願序的職位 id；desires: 對應的渴望度 */
function mem(id: string, order: string[], desires?: number[]): MemberSub {
  const d = desires ?? order.map((_, i) => (i === 0 ? 100 : 0));
  return { id, prefs: order.map((roleId, i) => ({ roleId, rank: i + 1, desire: d[i] })) };
}

const roles = (spec: Record<string, number>): RoleSpec[] =>
  Object.entries(spec).map(([id, capacity]) => ({ id, capacity }));

const roleOf = (res: ReturnType<typeof assign>, id: string) =>
  res.assignments.find((a) => a.memberId === id)!.roleId;

describe("assign", () => {
  it("第一志願都不同 → 全部拿到第一志願", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1 }), [
      mem("x", ["A", "B", "C"]),
      mem("y", ["B", "A", "C"]),
      mem("z", ["C", "A", "B"]),
    ], "s");
    expect(res.assignments.every((a) => a.rank === 1)).toBe(true);
  });

  it("搶同一職位 → 渴望度高者得", () => {
    const res = assign(roles({ A: 1, B: 1 }), [
      mem("x", ["A", "B"], [60, 40]),
      mem("y", ["A", "B"], [90, 10]),
    ], "s");
    expect(roleOf(res, "y")).toBe("A");
    expect(roleOf(res, "x")).toBe("B");
  });

  it("渴望度平手 → 同 seed 結果固定", () => {
    const r = roles({ A: 1, B: 1 });
    const ms = [mem("x", ["A", "B"], [50, 50]), mem("y", ["A", "B"], [50, 50])];
    const a1 = assign(r, ms, "seed-1");
    const a2 = assign(r, [...ms].reverse(), "seed-1");
    expect(a1.assignments).toEqual(a2.assignments);
    const winners = new Set<string>();
    for (let i = 0; i < 30; i++) winners.add(roleOf(assign(r, ms, `s${i}`), "x"));
    expect(winners.size).toBe(2); // 不同 seed 兩人都有機會
  });

  it("貪心會讓某人掉到後半段 → 可行性檢查擋下", () => {
    // 4 職位 → K=2。x 渴望度最高想拿 A，但如果 x 拿 A，y 和 z 的前 2 志願就只剩 B
    // → 其中一人會掉到後半段，所以 x 必須讓出 A、改拿第 2 志願 C
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("x", ["A", "C", "B", "D"], [100, 0, 0, 0]),
      mem("y", ["B", "A", "C", "D"], [90, 10, 0, 0]),
      mem("z", ["A", "B", "C", "D"], [50, 50, 0, 0]),
      mem("w", ["C", "D", "A", "B"], [10, 90, 0, 0]),
    ], "s");
    expect(res.effectiveK).toBe(2);
    expect(res.assignments.every((a) => a.rank <= 2)).toBe(true);
    expect(roleOf(res, "x")).toBe("C");
    expect(roleOf(res, "y")).toBe("B");
    expect(roleOf(res, "z")).toBe("A");
    expect(roleOf(res, "w")).toBe("D");
  });

  it("無解 → 放寬 K 並標示", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("a", ["A", "B", "C", "D"]),
      mem("b", ["A", "B", "C", "D"]),
      mem("c", ["B", "A", "C", "D"]),
      mem("d", ["B", "A", "D", "C"]),
    ], "s");
    expect(res.k).toBe(2);
    expect(res.effectiveK).toBe(3);
    expect(res.assignments.every((a) => a.rank <= 3)).toBe(true);
  });

  it("人數超過總名額 → 丟錯", () => {
    expect(() => assign(roles({ A: 1 }), [mem("a", ["A"]), mem("b", ["A"])], "s")).toThrow();
  });

  it("property：隨機 1000 組都合法", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 1000; t++) {
      const m = 2 + Math.floor(rnd() * 6);
      const spec: Record<string, number> = {};
      for (let i = 0; i < m; i++) spec[`r${i}`] = 1 + Math.floor(rnd() * 3);
      const rs = roles(spec);
      const total = rs.reduce((s, r) => s + r.capacity, 0);
      const n = 1 + Math.floor(rnd() * total);
      const ms: MemberSub[] = [];
      for (let i = 0; i < n; i++) {
        const order = rs.map((r) => r.id).sort(() => rnd() - 0.5);
        const d = order.map(() => 0);
        let left = 100;
        for (let j = 0; j < m - 1; j++) { const v = Math.floor(rnd() * (left + 1)); d[j] = v; left -= v; }
        d[m - 1] += left;
        ms.push(mem(`m${i}`, order, d));
      }
      const res = assign(rs, ms, `t${t}`);
      expect(res.assignments.length).toBe(n);
      const used = new Map<string, number>();
      for (const a of res.assignments) {
        used.set(a.roleId, (used.get(a.roleId) ?? 0) + 1);
        expect(a.rank).toBeLessThanOrEqual(res.effectiveK);
      }
      for (const r of rs) expect(used.get(r.id) ?? 0).toBeLessThanOrEqual(r.capacity);
      expect(res.effectiveK).toBeGreaterThanOrEqual(acceptableK(m));
    }
  });
});

describe("validatePrefs", () => {
  const ids = ["A", "B"];
  it("合法", () => expect(validatePrefs(mem("x", ids, [70, 30]).prefs, ids)).toBeNull());
  it("總和不是 100", () => expect(validatePrefs(mem("x", ids, [70, 20]).prefs, ids)).toMatch(/100/));
  it("少排職位", () => expect(validatePrefs(mem("x", ["A"], [100]).prefs, ids)).not.toBeNull());
});
