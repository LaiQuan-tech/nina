type DemoRow = { is_demo: true } & Record<string, unknown>;

const CUSTOMERS = [
  { company: "晴日餐飲設計", name: "林怡君", industry: "餐飲零售", tier: "vip", tags: ["月結熟客", "高價值"], material: "高遮PVC", product: "連鎖門市海報", processing: "霧膜", delivery: "專車配送", sensitivity: "low" },
  { company: "島嶼運動行銷", name: "陳柏翰", industry: "活動行銷", tier: "vip", tags: ["急件常客", "高價值"], material: "帆布", product: "賽事主視覺", processing: "打銅扣", delivery: "現場施工", sensitivity: "medium" },
  { company: "拾光婚禮企劃", name: "王雅婷", industry: "婚禮企劃", tier: "growth", tags: ["成長客戶"], material: "PP相紙", product: "迎賓背板", processing: "亮膜", delivery: "門市自取", sensitivity: "medium" },
  { company: "北城建設整合", name: "張志豪", industry: "建設營造", tier: "vip", tags: ["月結熟客", "固定規格"], material: "工程帆布", product: "工地圍籬", processing: "車縫補強", delivery: "現場施工", sensitivity: "low" },
  { company: "米禾烘焙工作室", name: "黃詩涵", industry: "餐飲零售", tier: "standard", tags: ["新客戶", "價格敏感"], material: "合成紙", product: "檔期海報", processing: "霧膜", delivery: "超商配送", sensitivity: "high" },
  { company: "森野戶外用品", name: "蔡承恩", industry: "品牌零售", tier: "growth", tags: ["季節型客戶"], material: "網格布", product: "戶外旗幟", processing: "車邊", delivery: "宅配", sensitivity: "medium" },
  { company: "好日子市集有限公司", name: "吳佳穎", industry: "展覽市集", tier: "growth", tags: ["待報價", "多品項"], material: "PVC貼紙", product: "攤位識別", processing: "造型割字", delivery: "門市自取", sensitivity: "high" },
  { company: "光禾診所設計", name: "周建宏", industry: "醫療空間", tier: "standard", tags: ["沉睡客戶"], material: "透光片", product: "燈箱片", processing: "護膜", delivery: "專車配送", sensitivity: "medium" },
  { company: "紅點活動製作", name: "李婉如", industry: "活動行銷", tier: "vip", tags: ["逾期回訪", "急件常客"], material: "黑背膠", product: "舞台背板", processing: "拼接", delivery: "現場施工", sensitivity: "low" },
  { company: "海線文化創意", name: "趙子翔", industry: "文化展演", tier: "standard", tags: ["新客戶", "待追蹤"], material: "油畫布", product: "展覽輸出", processing: "木框繃布", delivery: "宅配", sensitivity: "medium" },
] as const;

function uuid(prefix: number, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function iso(base: Date, offsetDays: number, hour = 10): string {
  const shifted = new Date(base.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const taipei = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour - 8));
  return taipei.toISOString();
}

export type DemoSeed = {
  members: DemoRow[];
  profiles: DemoRow[];
  sessions: DemoRow[];
  quotes: DemoRow[];
  orders: DemoRow[];
  followups: DemoRow[];
};

export function buildDemoSeed(now = new Date()): DemoSeed {
  const createdOffsets = [-120, -100, -82, -70, -54, -40, -28, -15, -4, -1];
  const members = CUSTOMERS.map((customer, index) => {
    const n = index + 1;
    const isMonthlyCustomer = (customer.tags as readonly string[]).includes("月結熟客");
    return {
      id: uuid(1, n),
      phone: `09000000${String(n).padStart(2, "0")}`,
      phone_display: `0900-000-${String(n).padStart(3, "0")}`,
      name: customer.name,
      company: customer.company,
      email: `demo${String(n).padStart(2, "0")}@example.com`,
      status: "active",
      credit_status: isMonthlyCustomer ? "approved" : "prepay",
      payment_terms: isMonthlyCustomer ? "monthly" : "cash",
      erp_customer_name: customer.company,
      erp_customer_no: `DEMO${String(n).padStart(4, "0")}`,
      paid_order_count: Math.max(0, 14 - n),
      last_order_at: iso(now, -(n + 1)),
      created_at: iso(now, createdOffsets[index]),
      updated_at: iso(now, -Math.min(n, 7)),
      is_demo: true as const,
    };
  });

  const profiles = CUSTOMERS.map((customer, index) => ({
    member_id: uuid(1, index + 1),
    industry: customer.industry,
    customer_tier: customer.tier,
    tags: [...customer.tags],
    preferred_contact: index % 3 === 0 ? "電話後以 LINE 確認" : index % 3 === 1 ? "LINE" : "Email",
    preferred_materials: [customer.material, index % 2 ? "帆布" : "PVC貼紙"],
    preferred_products: [customer.product],
    preferred_processing: [customer.processing],
    preferred_delivery: [customer.delivery],
    common_sizes: index % 2 ? ["90×180 cm", "120×240 cm"] : ["60×90 cm", "A1"],
    price_sensitivity: customer.sensitivity,
    ai_summary: `${customer.company}主要製作${customer.product}，偏好${customer.material}與${customer.processing}。${index % 2 ? "時程確認要明確，急件先電話回覆。" : "報價需列出材質差異與交期。"}`,
    service_notes: index === 4 ? "新客戶，先確認預算再提供兩種材質方案。" : index === 7 ? "已超過三個月未互動，適合用換季需求切入。" : "交稿前再次確認尺寸、數量與交貨方式。",
    last_summary_at: iso(now, -Math.min(index, 5)),
    created_at: iso(now, -60),
    updated_at: iso(now, -Math.min(index, 5)),
    is_demo: true as const,
  }));

  const sessions = CUSTOMERS.flatMap((customer, customerIndex) => [0, 1].map((round) => {
    const n = customerIndex * 2 + round + 1;
    const memberId = uuid(1, customerIndex + 1);
    const asked = round === 0 ? `${customer.product}想做兩個尺寸，請問${customer.material}交期多久？` : `上次的${customer.processing}效果不錯，這次數量增加可以先估價嗎？`;
    const messages = [
      { role: "model", text: `${customer.name}您好，請告訴我這次想製作的品項與尺寸。` },
      { role: "user", text: asked },
      { role: "model", text: `收到，我先依${customer.material}整理規格，確認數量後提供報價與送件方式。` },
    ];
    return {
      id: uuid(2, n),
      session_id: `demo-session-${String(n).padStart(2, "0")}`,
      member_id: memberId,
      contact_name: customer.name,
      contact_email: `demo${String(customerIndex + 1).padStart(2, "0")}@example.com`,
      contact_phone: `0900-000-${String(customerIndex + 1).padStart(3, "0")}`,
      messages,
      message_count: messages.length,
      submitted_count: 1,
      status: "submitted",
      last_file_name: `DEMO_${customer.product}_${String(round + 1).padStart(2, "0")}.pdf`,
      created_at: iso(now, -(customerIndex * 3 + round + 2)),
      updated_at: iso(now, -(customerIndex * 3 + round + 2)),
      is_demo: true as const,
    };
  }));

  const quotes = Array.from({ length: 16 }, (_, index) => {
    const customerIndex = index % CUSTOMERS.length;
    const customer = CUSTOMERS[customerIndex];
    const n = index + 1;
    return {
      id: uuid(3, n),
      quote_no: `DEMO-Q-${String(n).padStart(4, "0")}`,
      member_id: uuid(1, customerIndex + 1),
      session_id: `demo-session-${String(customerIndex * 2 + 1).padStart(2, "0")}`,
      title: `${customer.product}｜${customer.material}`,
      amount: 6800 + n * 1350,
      status: ["sent", "accepted", "draft", "accepted", "expired"][index % 5],
      items: [{ name: customer.product, material: customer.material, processing: customer.processing, qty: 2 + (index % 6) }],
      valid_until: iso(now, 7 + (index % 12)).slice(0, 10),
      created_at: iso(now, -(index + 1)),
      updated_at: iso(now, -Math.min(index, 5)),
      is_demo: true as const,
    };
  });

  const orders = Array.from({ length: 30 }, (_, index) => {
    const customerIndex = index % CUSTOMERS.length;
    const customer = CUSTOMERS[customerIndex];
    const n = index + 1;
    const isMonthlyCustomer = (customer.tags as readonly string[]).includes("月結熟客");
    return {
      id: uuid(4, n),
      order_no: `DEMO-WO-${String(n).padStart(4, "0")}`,
      member_id: uuid(1, customerIndex + 1),
      session_id: `demo-session-${String(customerIndex * 2 + (index % 2) + 1).padStart(2, "0")}`,
      serial: `D${String(n).padStart(5, "0")}`,
      payment_type: isMonthlyCustomer ? "月匯" : "現金",
      customer_name: customer.company,
      design_name: `${customer.product}${index % 3 === 0 ? "追加" : ""}`,
      size_w: index % 2 ? 90 : 120,
      size_h: index % 2 ? 180 : 240,
      size_unit: "cm",
      material_raw: customer.material,
      product_name: customer.product,
      product_code: `DEMO-P-${String(customerIndex + 1).padStart(3, "0")}`,
      product_matched: true,
      total_qty: 1 + (index % 8),
      single_qty: 1 + (index % 8),
      processing_items: customer.processing,
      delivery_method: customer.delivery,
      file_ext: index % 3 === 0 ? "ai" : "pdf",
      file_name: `DEMO_${customer.company}_${customer.product}_${String(n).padStart(2, "0")}.${index % 3 === 0 ? "ai" : "pdf"}`,
      storage_path: `demo-only/${uuid(4, n)}/preview-file`,
      parsed: { demo: true, material: customer.material },
      status: ["open", "in_progress", "done"][index % 3],
      received_at: iso(now, -(index + 2)),
      created_at: iso(now, -(index + 2)),
      updated_at: iso(now, -Math.min(index, 4)),
      is_demo: true as const,
    };
  });

  const followupOffsets = [-4, -2, 0, 0, 1, 2, 3, 5, 7, 10, 14, 21, -1, 6];
  const followups = followupOffsets.map((offset, index) => {
    const customerIndex = index % CUSTOMERS.length;
    const customer = CUSTOMERS[customerIndex];
    return {
      id: uuid(5, index + 1),
      member_id: uuid(1, customerIndex + 1),
      title: index % 3 === 0 ? "確認報價與製作檔期" : index % 3 === 1 ? "追蹤換季輸出需求" : "確認稿件與交貨方式",
      reason: `${customer.company}最近一次需求為${customer.product}，${offset < 0 ? "已超過預定回訪時間。" : "依服務節奏主動聯繫。"}`,
      priority: offset < 0 ? "high" : index % 3 === 0 ? "medium" : "low",
      status: index === 11 ? "completed" : "open",
      assignee: index % 2 ? "王小美" : "李明哲",
      due_at: iso(now, offset, 14),
      completed_at: index === 11 ? iso(now, -1, 16) : null,
      created_at: iso(now, -10 - index),
      updated_at: iso(now, -Math.min(index, 3)),
      is_demo: true as const,
    };
  });

  return { members, profiles, sessions, quotes, orders, followups };
}
