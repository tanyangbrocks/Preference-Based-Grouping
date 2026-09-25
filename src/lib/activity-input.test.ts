import { describe, expect, it, vi } from "vitest";

// activity-input.ts / service.ts 都有 `import "server-only"`，這個套件只在偵測到
// 瀏覽器環境時才會丟錯，但 vitest 的預設環境會讓它誤判，所以測試時把它當空模組處理。
vi.mock("server-only", () => ({}));

const { HttpError } = await import("./service");
const { parseActivityInput } = await import("./activity-input");

const body = (overrides: Record<string, unknown> = {}) => ({
  title: "測試活動",
  description: "",
  deadline: new Date(Date.now() + 65_000).toISOString(),
  roles: [
    { id: "r0", name: "美術", description: "", capacity: 1 },
    { id: "r1", name: "程式", description: "", capacity: 1 },
  ],
  ...overrides,
});

describe("parseActivityInput：截止時間未修改時不應被『至少 1 分鐘後』擋下（回歸測試）", () => {
  it("建立活動：截止時間不到 1 分鐘 → 拒絕", () => {
    const soon = new Date(Date.now() + 10_000).toISOString();
    expect(() => parseActivityInput(body({ deadline: soon }))).toThrow(HttpError);
  });

  it("編輯活動：截止時間跟目前完全一樣，就算只剩幾秒也不擋（沒有人在改截止時間）", () => {
    const almostThere = new Date(Date.now() + 10_000).toISOString();
    // currentDeadline 跟送出的 deadline 相同 → 不重新檢查「未來 1 分鐘」
    expect(() => parseActivityInput(body({ deadline: almostThere }), [], "bid", almostThere)).not.toThrow();
  });

  it("編輯活動：真的把截止時間改到快到了 → 還是要擋", () => {
    const original = new Date(Date.now() + 10 * 60_000).toISOString(); // 原本 10 分鐘後
    const tooSoon = new Date(Date.now() + 10_000).toISOString(); // 改成 10 秒後
    expect(() => parseActivityInput(body({ deadline: tooSoon }), [], "bid", original)).toThrow(HttpError);
  });

  it("編輯活動：沒有 currentDeadline 參數時，維持原本的嚴格檢查", () => {
    const soon = new Date(Date.now() + 10_000).toISOString();
    expect(() => parseActivityInput(body({ deadline: soon }), [])).toThrow(HttpError);
  });
});
