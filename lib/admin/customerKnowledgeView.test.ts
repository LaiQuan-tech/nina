import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyActivity,
  bucketFollowups,
  matchesCustomerFilters,
  mergeCustomerTimeline,
  validateFollowupInput,
  validateCustomerProfilePatch,
} from "./customerKnowledgeView";

const customer = {
  name: "林怡君",
  company: "晴日餐飲設計",
  phone: "0900000001",
  industry: "餐飲零售",
  customerTier: "vip",
  status: "active",
  tags: ["月結熟客", "高價值"],
};

test("客戶搜尋可比對公司、姓名、手機與標籤", () => {
  for (const query of ["晴日", "怡君", "000001", "高價值"]) {
    assert.equal(matchesCustomerFilters(customer, { query }), true);
  }
  assert.equal(matchesCustomerFilters(customer, { query: "不存在" }), false);
});

test("客戶 tier、產業與狀態篩選可組合", () => {
  assert.equal(
    matchesCustomerFilters(customer, { customerTier: "vip", industry: "餐飲零售", status: "active" }),
    true
  );
  assert.equal(matchesCustomerFilters(customer, { customerTier: "growth", industry: "餐飲零售" }), false);
});

test("跨來源歷程依時間新到舊排序", () => {
  const timeline = mergeCustomerTimeline({
    sessions: [{ id: "s1", at: "2026-08-01T08:00:00Z", title: "詢問帆布" }],
    quotes: [{ id: "q1", at: "2026-08-03T08:00:00Z", title: "活動背板報價" }],
    orders: [{ id: "o1", at: "2026-08-02T08:00:00Z", title: "背板工單" }],
    followups: [{ id: "f1", at: "2026-08-04T08:00:00Z", title: "確認檔期" }],
  });
  assert.deepEqual(
    timeline.map((item) => [item.type, item.id]),
    [
      ["followup", "f1"],
      ["quote", "q1"],
      ["order", "o1"],
      ["conversation", "s1"],
    ]
  );
});

test("回訪依逾期、今天、七天內與稍後分組", () => {
  const groups = bucketFollowups(
    [
      { id: "late", dueAt: "2026-08-05T01:00:00+08:00", status: "open" },
      { id: "today", dueAt: "2026-08-06T15:00:00+08:00", status: "open" },
      { id: "week", dueAt: "2026-08-10T10:00:00+08:00", status: "open" },
      { id: "later", dueAt: "2026-08-20T10:00:00+08:00", status: "open" },
      { id: "done", dueAt: "2026-08-05T01:00:00+08:00", status: "completed" },
    ],
    new Date("2026-08-06T12:00:00+08:00")
  );
  assert.deepEqual(groups.overdue.map((item) => item.id), ["late"]);
  assert.deepEqual(groups.today.map((item) => item.id), ["today"]);
  assert.deepEqual(groups.next7.map((item) => item.id), ["week"]);
  assert.deepEqual(groups.later.map((item) => item.id), ["later"]);
});

test("互動量以台北日期分組，不會把今日資料算到前一天", () => {
  const values = buildDailyActivity(
    ["2026-08-06T04:51:05.000Z", "2026-08-05T20:00:00.000Z", "2026-08-05T10:00:00.000Z"],
    new Date("2026-08-06T04:53:00.000Z"),
    2,
  );
  assert.deepEqual(values, [
    { label: "8/5", value: 1 },
    { label: "8/6", value: 2 },
  ]);
});

test("客戶樣貌 patch 接受白名單並正規化字串陣列", () => {
  assert.deepEqual(
    validateCustomerProfilePatch({
      customerTier: "growth",
      priceSensitivity: "high",
      aiSummary: "  習慣 LINE 確認  ",
      preferredMaterials: ["帆布", " 帆布 ", "PVC"],
    }),
    {
      ok: true,
      value: {
        customer_tier: "growth",
        price_sensitivity: "high",
        ai_summary: "習慣 LINE 確認",
        preferred_materials: ["帆布", "PVC"],
      },
    }
  );
});

test("客戶樣貌 patch 拒絕未知欄位、錯誤列舉與過長內容", () => {
  assert.equal(validateCustomerProfilePatch({ secret: "x" }).ok, false);
  assert.equal(validateCustomerProfilePatch({ customerTier: "super" }).ok, false);
  assert.equal(validateCustomerProfilePatch({ aiSummary: "x".repeat(2001) }).ok, false);
  assert.equal(validateCustomerProfilePatch({ preferredMaterials: Array(13).fill("帆布") }).ok, false);
});

test("新增回訪會驗證並轉換安全欄位", () => {
  assert.deepEqual(
    validateFollowupInput({
      memberId: "10000000-0000-4000-8000-000000000001",
      title: " 確認新檔期 ",
      reason: "詢問活動背板",
      priority: "high",
      assignee: "王小美",
      dueAt: "2026-08-10T10:00:00+08:00",
    }, "create"),
    {
      ok: true,
      value: {
        member_id: "10000000-0000-4000-8000-000000000001",
        title: "確認新檔期",
        reason: "詢問活動背板",
        priority: "high",
        assignee: "王小美",
        due_at: "2026-08-10T02:00:00.000Z",
      },
    }
  );
});

test("回訪輸入拒絕未知欄位、非 UUID、錯誤日期與錯誤狀態", () => {
  assert.equal(validateFollowupInput({ memberId: "x", title: "追蹤", dueAt: "2026-08-10" }, "create").ok, false);
  assert.equal(validateFollowupInput({ memberId: "10000000-0000-4000-8000-000000000001", title: "追蹤", dueAt: "not-date" }, "create").ok, false);
  assert.equal(validateFollowupInput({ status: "deleted" }, "update").ok, false);
  assert.equal(validateFollowupInput({ isDemo: false }, "update").ok, false);
});
