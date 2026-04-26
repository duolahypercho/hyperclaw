export interface DbColumn {
  name: string;
  type: "text" | "number" | "enum" | "date" | "json";
  pk?: boolean;
}

export interface Database {
  id: string;
  name: string;
  icon: string;
  desc: string;
  rows: number;
  cols: number;
  updated: string;
  schema: DbColumn[];
  sample: Array<Array<string | number>>;
  perms: {
    read: string[];   // agent ids
    write: string[];
  };
}

export const DATABASES: Database[] = [
  {
    id: "customers",
    name: "customers",
    icon: "👥",
    desc: "Current book of business. Canonical customer record.",
    rows: 1_204,
    cols: 6,
    updated: "14m ago",
    schema: [
      { name: "id", type: "text", pk: true },
      { name: "name", type: "text" },
      { name: "email", type: "text" },
      { name: "tier", type: "enum" },
      { name: "mrr", type: "number" },
      { name: "signed_at", type: "date" },
    ],
    sample: [
      ["cus_01", "Apex Ranch", "ops@apex.co", "enterprise", 12400, "2024-11-03"],
      ["cus_02", "Fieldwork Co.", "hello@fieldwork.io", "growth", 2800, "2025-02-17"],
      ["cus_03", "North Cove", "a@northcove.com", "starter", 480, "2025-06-09"],
      ["cus_04", "Lumio", "t@lumio.dev", "growth", 3100, "2025-08-22"],
    ],
    perms: { read: ["clio","orin","rell"], write: ["rell"] },
  },
  {
    id: "filings",
    name: "filings",
    icon: "📄",
    desc: "Regulatory filings, pulled nightly.",
    rows: 38_412,
    cols: 5,
    updated: "1h ago",
    schema: [
      { name: "id", type: "text", pk: true },
      { name: "ticker", type: "text" },
      { name: "type", type: "enum" },
      { name: "filed_at", type: "date" },
      { name: "summary", type: "text" },
    ],
    sample: [
      ["fil_9421", "AAPL", "10-Q", "2026-04-12", "Q2 revenue growth +4.2%"],
      ["fil_9422", "MSFT", "10-K", "2026-04-11", "Cloud segment reorg"],
      ["fil_9423", "NVDA", "8-K", "2026-04-10", "Item 2.02 — earnings release"],
    ],
    perms: { read: ["clio"], write: ["clio"] },
  },
  {
    id: "tickets",
    name: "tickets",
    icon: "🎫",
    desc: "Inbound support tickets from OpenClaw channels.",
    rows: 842,
    cols: 5,
    updated: "2m ago",
    schema: [
      { name: "id", type: "text", pk: true },
      { name: "customer", type: "text" },
      { name: "channel", type: "enum" },
      { name: "status", type: "enum" },
      { name: "opened_at", type: "date" },
    ],
    sample: [
      ["tkt_5501", "Apex Ranch", "slack", "open", "2026-04-18"],
      ["tkt_5502", "North Cove", "email", "resolved", "2026-04-18"],
      ["tkt_5503", "Lumio", "whatsapp", "waiting", "2026-04-17"],
    ],
    perms: { read: ["orin","clio"], write: ["orin"] },
  },
  {
    id: "candidates",
    name: "candidates",
    icon: "🧑‍💼",
    desc: "People we're talking to. Pipeline, not CRM.",
    rows: 318,
    cols: 6,
    updated: "4h ago",
    schema: [
      { name: "id", type: "text", pk: true },
      { name: "name", type: "text" },
      { name: "role", type: "text" },
      { name: "stage", type: "enum" },
      { name: "owner", type: "text" },
      { name: "last_touch", type: "date" },
    ],
    sample: [
      ["cand_210", "Nadia Reyes", "Senior PM", "phone-screen", "Aria", "2026-04-15"],
      ["cand_211", "Jun Park", "Staff Eng", "onsite", "Kai", "2026-04-17"],
      ["cand_212", "Mara Ito", "Designer", "intro", "Aria", "2026-04-18"],
    ],
    perms: { read: ["rell"], write: ["rell"] },
  },
  {
    id: "metrics_daily",
    name: "metrics_daily",
    icon: "📈",
    desc: "Daily KPIs — usage, revenue, ops.",
    rows: 2_190,
    cols: 7,
    updated: "3h ago",
    schema: [
      { name: "date", type: "date", pk: true },
      { name: "mrr", type: "number" },
      { name: "arr", type: "number" },
      { name: "churn", type: "number" },
      { name: "runs", type: "number" },
      { name: "spend", type: "number" },
      { name: "errors", type: "number" },
    ],
    sample: [
      ["2026-04-17", 118_400, 1_420_800, 1, 214, 48.12, 3],
      ["2026-04-16", 117_900, 1_414_800, 0, 201, 44.90, 1],
      ["2026-04-15", 117_600, 1_411_200, 2, 198, 45.12, 2],
    ],
    perms: { read: ["clio","rell","pax"], write: ["pax"] },
  },
];
