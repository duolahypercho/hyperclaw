export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  owner: string;       // agent id or "humans"
  itemCount: number;
  updatedAgo: string;
  visibility: "shared" | "private";
  pinned?: boolean;
}

export interface KnowledgeEdit {
  collection: string;
  agent: string;      // agent id
  action: string;     // "added", "updated", "removed"
  title: string;
  ts: number;
}

export const KNOWLEDGE: KnowledgeCollection[] = [
  { id: "company", name: "Company handbook", description: "Policies, rituals, how we work.", owner: "humans", itemCount: 42, updatedAgo: "2d", visibility: "shared", pinned: true },
  { id: "brand", name: "Brand & voice", description: "Tone, positioning, visual language.", owner: "humans", itemCount: 18, updatedAgo: "6d", visibility: "shared", pinned: true },
  { id: "research", name: "Research library", description: "Filings, briefs, primary sources.", owner: "clio", itemCount: 212, updatedAgo: "3h", visibility: "shared" },
  { id: "support", name: "Support playbook", description: "Canned replies, escalation paths.", owner: "orin", itemCount: 64, updatedAgo: "1d", visibility: "shared" },
  { id: "eng", name: "Engineering runbooks", description: "Deploys, incidents, rollbacks.", owner: "mira", itemCount: 33, updatedAgo: "12h", visibility: "shared" },
  { id: "arch", name: "Architecture decisions", description: "ADRs for the codebase.", owner: "pax", itemCount: 21, updatedAgo: "4d", visibility: "shared" },
  { id: "skills", name: "Skill library", description: "Rell's learned skills.", owner: "rell", itemCount: 47, updatedAgo: "30m", visibility: "private" },
];

export const RECENT_EDITS: KnowledgeEdit[] = [
  { collection: "research", agent: "clio", action: "added", title: "Q1 earnings — sector note", ts: Date.now() - 1000 * 60 * 12 },
  { collection: "support", agent: "orin", action: "updated", title: "Refund flow — v2", ts: Date.now() - 1000 * 60 * 47 },
  { collection: "eng", agent: "mira", action: "added", title: "Incident: gateway reconnect storm", ts: Date.now() - 1000 * 60 * 80 },
  { collection: "arch", agent: "pax", action: "updated", title: "ADR 0031 — relay timeouts", ts: Date.now() - 1000 * 60 * 180 },
  { collection: "skills", agent: "rell", action: "added", title: "Summarise JSONL transcript", ts: Date.now() - 1000 * 60 * 4 },
];
