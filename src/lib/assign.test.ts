import { describe, expect, it } from "vitest";
import { acceptableK, assign, desireBudget, maxMatchWithin, validatePrefs, type MemberSub, type Pref, type RoleSpec } from "./assign";

/** order: 志願序的職位 id；desires: 對應的渴望度 */
function mem(id: string, order: string[], desires?: number[]): MemberSub {
  const d = desires ?? order.map((_, i) => (i === 0 ? desireBudget(order.length) : 0));
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

  it("無解 → 只放寬必要的最少人數", () => {
    // a、b、c、d 的前 2 志願都是 A/B，但 A、B 各只有 1 個名額 → 必定有 2 人要放寬
    const ms = [
      mem("a", ["A", "B", "C", "D"]),
      mem("b", ["A", "B", "C", "D"]),
      mem("c", ["B", "A", "C", "D"]),
      mem("d", ["B", "A", "D", "C"]),
    ];
    const rs = roles({ A: 1, B: 1, C: 1, D: 1 });
    const res = assign(rs, ms, "s");
    expect(res.k).toBe(2);
    expect(res.assignments.filter((a) => a.rank > 2).length).toBe(2);
    expect(res.assignments.every((a) => a.rank <= 3)).toBe(true);
  });

  it("無解時只有 1 人需要放寬 → 其他人都不受影響", () => {
    // 6 職位 → K=3。a/b/c/d 的前 3 志願都是 A/B/C（各 1 名額）→ 只有 1 人放寬
    // e/f 的前 3 志願是 D/E/F，完全不受影響
    const rs = roles({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 });
    const ms = [
      mem("a", ["A", "B", "C", "D", "E", "F"]),
      mem("b", ["B", "C", "A", "E", "D", "F"]),
      mem("c", ["C", "A", "B", "F", "E", "D"]),
      mem("d", ["A", "C", "B", "D", "F", "E"]),
      mem("e", ["D", "E", "F", "A", "B", "C"]),
      mem("f", ["E", "D", "F", "A", "B", "C"]),
    ];
    for (let t = 0; t < 20; t++) {
      const res = assign(rs, ms, `seed${t}`);
      const out = res.assignments.filter((a) => a.rank > 3);
      expect(out.length).toBe(1);
      expect(["a", "b", "c", "d"]).toContain(out[0].memberId);
      expect(out[0].rank).toBe(4); // 放寬也只放寬到第 4 志願
    }
  });

  it("多人職位：名額 2 → 渴望度前 2 高的人拿到", () => {
    const res = assign(roles({ A: 2, B: 1, C: 1 }), [
      mem("x", ["A", "B", "C"], [4, 1, 0]),
      mem("y", ["A", "C", "B"], [3, 2, 0]),
      mem("z", ["A", "B", "C"], [2, 3, 0]),
      mem("w", ["A", "C", "B"], [1, 4, 0]),
    ], "s");
    expect(roleOf(res, "x")).toBe("A");
    expect(roleOf(res, "y")).toBe("A");
    expect(roleOf(res, "z")).toBe("B");
    expect(roleOf(res, "w")).toBe("C");
  });

  it("多人職位：名額不會超過上限，且人數少於總名額也能分", () => {
    const res = assign(roles({ A: 3, B: 2 }), [
      mem("a", ["A", "B"]), mem("b", ["A", "B"]), mem("c", ["A", "B"]), mem("d", ["A", "B"]),
    ], "s");
    expect(res.assignments.filter((a) => a.roleId === "A").length).toBe(3);
    expect(res.assignments.filter((a) => a.roleId === "B").length).toBe(1);
  });

  it("事件：同分抽籤", () => {
    const res = assign(roles({ A: 1, B: 1 }), [
      mem("x", ["A", "B"], [2, 1]),
      mem("y", ["A", "B"], [2, 1]),
    ], "s");
    const tie = res.events.find((e) => e.type === "tie");
    expect(tie).toMatchObject({ type: "tie", round: 1, roleId: "A", desire: 2 });
    if (tie?.type === "tie") expect([...tie.winners, ...tie.losers].sort()).toEqual(["x", "y"]);
  });

  it("事件：渴望度不同 → 不算抽籤", () => {
    // 4 職位 → K=2；x 押 4 點拿 A，y 第 2 志願拿 B，沒有抽籤也沒有放寬
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("x", ["A", "B", "C", "D"], [4, 2, 0, 0]),
      mem("y", ["A", "B", "C", "D"], [3, 3, 0, 0]),
    ], "s");
    expect(roleOf(res, "x")).toBe("A");
    expect(res.events).toEqual([]);
  });

  it("事件：讓位", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("x", ["A", "C", "B", "D"], [6, 0, 0, 0]),
      mem("y", ["B", "A", "C", "D"], [5, 1, 0, 0]),
      mem("z", ["A", "B", "C", "D"], [3, 3, 0, 0]),
      mem("w", ["C", "D", "A", "B"], [1, 5, 0, 0]),
    ], "s");
    expect(res.events).toContainEqual({ type: "yield", round: 1, roleId: "A", memberId: "x", desire: 6 });
    expect(res.events.some((e) => e.type === "relax")).toBe(false);
  });

  it("事件：降低標準（放寬）列出被放寬的人", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("a", ["A", "B", "C", "D"]), mem("b", ["A", "B", "C", "D"]),
      mem("c", ["B", "A", "C", "D"]), mem("d", ["B", "A", "D", "C"]),
    ], "s");
    const relax = res.events.find((e) => e.type === "relax");
    expect(relax?.type === "relax" && relax.memberIds.length).toBe(2);
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
        let left = desireBudget(m);
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
      // 只要存在讓所有人都在前 K 的分法，就一定做到；否則放寬人數 = 理論最小值
      const k = acceptableK(m);
      const outside = res.assignments.filter((a) => a.rank > k).length;
      expect(outside).toBe(n - maxMatchWithin(rs, ms, k));
    }
  });
});

describe("validatePrefs", () => {
  const ids = ["A", "B", "C", "D"]; // 4 職位 → 渴望度總數 6
  it("總數 = 職位數 × 3 ÷ 2", () => {
    expect(desireBudget(4)).toBe(6);
    expect(desireBudget(5)).toBe(8); // 7.5 無條件進位
  });
  it("合法", () => expect(validatePrefs("bid", mem("x", ids, [4, 2, 0, 0]).prefs, ids)).toBeNull());
  it("總和不對", () => expect(validatePrefs("bid", mem("x", ids, [4, 1, 0, 0]).prefs, ids)).toMatch(/6/));
  it("少排職位", () => expect(validatePrefs("bid", mem("x", ["A"], [6]).prefs, ids)).not.toBeNull());
});

/** 模式 ③：first = 第一志願；ok = 勾選「也可以」；其餘為順位 3 */
function pick(id: string, all: string[], first: string, ok: string[] = []): MemberSub {
  return {
    id,
    prefs: all.map((roleId) => ({ roleId, rank: roleId === first ? 1 : ok.includes(roleId) ? 2 : 3, desire: 0 })),
  };
}

describe("模式 ② 三級渴望度", () => {
  it("同一志願搶同一職位 → 級數高者得", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1, D: 1 }), [
      mem("x", ["A", "B", "C", "D"], [2, 3, 1, 1]),
      mem("y", ["A", "B", "C", "D"], [3, 1, 1, 1]),
    ], "s");
    expect(roleOf(res, "y")).toBe("A");
    expect(roleOf(res, "x")).toBe("B");
  });
  it("驗證：只能 1～3 級，不需要加總", () => {
    const ids = ["A", "B", "C"];
    expect(validatePrefs("tier", mem("x", ids, [3, 3, 3]).prefs, ids)).toBeNull();
    expect(validatePrefs("tier", mem("x", ids, [4, 1, 1]).prefs, ids)).not.toBeNull();
    expect(validatePrefs("tier", mem("x", ids, [0, 1, 1]).prefs, ids)).not.toBeNull();
  });
});

describe("模式 ③ 第一志願＋可接受", () => {
  const all = ["A", "B", "C"];
  it("盡量讓大家落在第一志願或有勾的職位", () => {
    // 若 y 拿走 A，x（只接受 A、B）會和 z 搶 B → 必須由 x 拿 A、y 讓位去勾選的 C
    const res = assign(roles({ A: 1, B: 1, C: 1 }), [
      pick("x", all, "A", ["B"]),
      pick("y", all, "A", ["C"]),
      pick("z", all, "B", ["A", "C"]),
    ], "s", { k: 2 });
    expect(roleOf(res, "x")).toBe("A");
    expect(roleOf(res, "z")).toBe("B");
    expect(roleOf(res, "y")).toBe("C");
    expect(res.assignments.every((a) => a.rank <= 2)).toBe(true);
  });
  it("勾選的多個職位同屬第二順位", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1 }), [
      pick("x", all, "A", ["B", "C"]),
      pick("y", all, "A", ["B", "C"]),
      pick("z", all, "A", ["B", "C"]),
    ], "s", { k: 2 });
    expect(res.assignments.filter((a) => a.rank === 1).length).toBe(1);
    expect(res.assignments.filter((a) => a.rank === 2).length).toBe(2);
    expect(res.events.some((e) => e.type === "tie")).toBe(true);
  });
  it("沒勾別的職位又搶輸 → 只放寬必要的人", () => {
    const res = assign(roles({ A: 1, B: 1, C: 1 }), [
      pick("x", all, "A"),
      pick("y", all, "A"),
      pick("z", all, "B", ["C"]),
    ], "s", { k: 2 });
    expect(res.assignments.filter((a) => a.rank === 3).length).toBe(1);
    expect(res.events.find((e) => e.type === "relax")).toBeTruthy();
  });
  it("驗證：必須剛好一個第一志願、沒有渴望度", () => {
    const ok: Pref[] = pick("x", all, "A", ["B"]).prefs;
    expect(validatePrefs("pick", ok, all)).toBeNull();
    expect(validatePrefs("pick", ok.map((p) => ({ ...p, rank: 2 })), all)).not.toBeNull();
    expect(validatePrefs("pick", ok.map((p) => ({ ...p, desire: 1 })), all)).not.toBeNull();
  });
  it("property：隨機 1000 組，落在第一或勾選以外的人數 = 理論最小值", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 1000; t++) {
      const m = 2 + Math.floor(rnd() * 6);
      const spec: Record<string, number> = {};
      for (let i = 0; i < m; i++) spec[`r${i}`] = 1 + Math.floor(rnd() * 3);
      const rs = roles(spec);
      const ids = rs.map((r) => r.id);
      const n = 1 + Math.floor(rnd() * rs.reduce((s, r) => s + r.capacity, 0));
      const ms = Array.from({ length: n }, (_, i) => {
        const first = ids[Math.floor(rnd() * m)];
        return pick(`m${i}`, ids, first, ids.filter((x) => x !== first && rnd() < 0.35));
      });
      const res = assign(rs, ms, `p${t}`, { k: 2 });
      expect(res.assignments.length).toBe(n);
      const used = new Map<string, number>();
      for (const a of res.assignments) used.set(a.roleId, (used.get(a.roleId) ?? 0) + 1);
      for (const r of rs) expect(used.get(r.id) ?? 0).toBeLessThanOrEqual(r.capacity);
      expect(res.assignments.filter((a) => a.rank > 2).length).toBe(n - maxMatchWithin(rs, ms, 2));
    }
  });
});
