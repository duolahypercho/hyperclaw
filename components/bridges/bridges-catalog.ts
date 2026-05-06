/**
 * Bridge catalog. A "bridge" is a connection to an external model provider,
 * inference platform, or tool that agents can read/write. Foundation-model
 * providers are sourced from the onboarding `provider-models.ts` so a model
 * configured during onboarding shows up here automatically with its key.
 *
 * Non-model bridges (search, communication, productivity, ...) are defined
 * locally — they don't have a counterpart in the onboarding flow.
 */

import { PROVIDERS, type ProviderDef } from "$/components/Onboarding/provider-models";

export type BridgeAuth = "apikey" | "oauth" | "iam" | "token" | "oauth+key";
export type BridgeStatus = "connected" | "needs-auth" | "paused" | "off";

export interface BridgeField {
  key: string;
  label: string;
  ph: string;
  secret?: boolean;
}

export interface BridgeModel {
  name: string;
  ctx?: string;
  price?: string;
}

export interface BridgeDef {
  id: string;
  name: string;
  kind: string;
  cat: BridgeCategoryId;
  auth: BridgeAuth;
  fields: BridgeField[];
  scopes: string[];
  pricing?: string;
  docsUrl?: string;
  region?: string;
  blurb: string;
  tagline: string;
  /** Foundation-model providers carry their model list for the drawer. */
  models?: BridgeModel[];
  /** Onboarding provider id (matches PROVIDERS[].id) when this bridge is an LLM. */
  providerId?: string;
  /** Domain used to resolve the provider's company favicon/logo. */
  logoDomain?: string;
}

export type BridgeCategoryId =
  | "AI models"
  | "AI infra"
  | "Voice & vision"
  | "Search & RAG"
  | "Communication"
  | "Productivity"
  | "Code & deploy"
  | "Data & storage"
  | "Sales & support"
  | "Custom";

export interface BridgeCategory {
  id: BridgeCategoryId | "all";
  label: string;
  desc: string;
}

export const BRIDGE_CATEGORIES: BridgeCategory[] = [
  { id: "all", label: "All", desc: "All bridges in your workspace" },
  { id: "AI models", label: "AI models", desc: "Foundation model providers — chat, embeddings, multimodal." },
  { id: "AI infra", label: "AI infra", desc: "Inference platforms, BYO-cloud and open-model hosts." },
  { id: "Voice & vision", label: "Voice & vision", desc: "Speech, transcription, vision and TTS." },
  { id: "Search & RAG", label: "Search & RAG", desc: "Web search, scrapers and vector databases." },
  { id: "Communication", label: "Communication", desc: "Email, chat and messaging." },
  { id: "Productivity", label: "Productivity", desc: "Docs, issues, files, calendars." },
  { id: "Code & deploy", label: "Code & deploy", desc: "Code hosts, deploys and observability." },
  { id: "Data & storage", label: "Data & storage", desc: "Warehouses, databases and object stores." },
  { id: "Sales & support", label: "Sales & support", desc: "CRM, helpdesk and payments." },
  { id: "Custom", label: "Custom", desc: "HTTP, webhooks and Model Context Protocol." },
];

/* ── Bridge defs derived from the onboarding PROVIDERS list ─────────────── */

const PROVIDER_META: Record<string, { kind: string; tagline: string; blurb: string; pricing?: string; docsUrl?: string }> = {
  anthropic: { kind: "Model", tagline: "Frontier reasoning", blurb: "Claude Sonnet · Haiku · Opus. Long context, tool use, vision.", pricing: "$3 / $15 per 1M", docsUrl: "docs.anthropic.com" },
  openai: { kind: "Model", tagline: "General-purpose", blurb: "GPT-5, o-series reasoners, Whisper, embeddings, image gen.", pricing: "$2.50 / $10 per 1M", docsUrl: "platform.openai.com" },
  google: { kind: "Model", tagline: "Long context", blurb: "Gemini 3 Pro · Flash. Native multimodal, 2M context.", pricing: "$1.25 / $5 per 1M", docsUrl: "ai.google.dev" },
  openrouter: { kind: "Aggregator", tagline: "One key, many models", blurb: "Single key, hundreds of models with automatic failover.", pricing: "pass-through", docsUrl: "openrouter.ai/docs" },
  deepseek: { kind: "Model", tagline: "Low cost", blurb: "R1 reasoner, V3. Cheap chains-of-thought.", pricing: "$0.14 / $0.28 per 1M", docsUrl: "platform.deepseek.com" },
  mistral: { kind: "Model", tagline: "EU-hosted", blurb: "Open-weight Mistral & Codestral. Hosted in EU.", pricing: "$0.40 / $2 per 1M", docsUrl: "docs.mistral.ai" },
  xai: { kind: "Model", tagline: "Realtime web", blurb: "Grok with realtime web context.", pricing: "$3 / $15 per 1M", docsUrl: "x.ai/api" },
  groq: { kind: "Inference", tagline: "Ultra fast", blurb: "Llama, Mixtral on LPU — sub-100ms first token.", pricing: "$0.10 / $0.50 per 1M", docsUrl: "console.groq.com" },
  together: { kind: "Inference", tagline: "Open models", blurb: "Together AI inference for open-weight models.", pricing: "per-token", docsUrl: "docs.together.ai" },
  minimax: { kind: "Model", tagline: "Long context", blurb: "MiniMax models with extended context.", pricing: "per-token", docsUrl: "minimaxi.com" },
  moonshot: { kind: "Model", tagline: "Kimi K-series", blurb: "Moonshot Kimi K2 series — agentic & thinking variants.", pricing: "per-token", docsUrl: "platform.moonshot.cn" },
  cerebras: { kind: "Inference", tagline: "Wafer-scale", blurb: "Llama 4 inference on wafer-scale chips.", pricing: "per-token", docsUrl: "inference-docs.cerebras.ai" },
  huggingface: { kind: "Inference", tagline: "Community", blurb: "Inference endpoints + 500k models.", pricing: "free + paid", docsUrl: "huggingface.co/docs" },
  nvidia: { kind: "Inference", tagline: "NIM", blurb: "NVIDIA NIM endpoints for top open models.", pricing: "per-token", docsUrl: "build.nvidia.com" },
  perplexity: { kind: "Search", tagline: "Cited search", blurb: "Sonar — live web search with cited answers.", pricing: "$1 / 1k", docsUrl: "docs.perplexity.ai" },
};

const PROVIDER_LOGO_DOMAINS: Record<string, string> = {
  anthropic: "anthropic.com",
  openai: "openai.com",
  google: "gemini.google.com",
  openrouter: "openrouter.ai",
  deepseek: "deepseek.com",
  mistral: "mistral.ai",
  xai: "x.ai",
  groq: "groq.com",
  together: "together.ai",
  minimax: "minimax.io",
  moonshot: "moonshot.cn",
  cerebras: "cerebras.ai",
  huggingface: "huggingface.co",
  nvidia: "nvidia.com",
  perplexity: "perplexity.ai",
};

function categoryForProvider(p: ProviderDef): BridgeCategoryId {
  if (p.id === "huggingface" || p.id === "groq" || p.id === "together" || p.id === "cerebras" || p.id === "nvidia") return "AI infra";
  if (p.id === "perplexity") return "Search & RAG";
  return "AI models";
}

const PROVIDER_BRIDGES: BridgeDef[] = PROVIDERS.map((p) => {
  const meta = PROVIDER_META[p.id] || { kind: "Model", tagline: p.name, blurb: `${p.name} models.` };
  return {
    id: p.id,
    name: p.name,
    kind: meta.kind,
    cat: categoryForProvider(p),
    auth: p.oauthId ? "oauth+key" : "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: p.placeholder, secret: true }],
    scopes: ["chat", "tools", "embed"],
    pricing: meta.pricing,
    docsUrl: meta.docsUrl,
    region: "global",
    blurb: meta.blurb,
    tagline: meta.tagline,
    models: p.models.map((m) => ({ name: m.id, ctx: undefined, price: undefined })),
    providerId: p.id,
    logoDomain: PROVIDER_LOGO_DOMAINS[p.id],
  };
});

/* ── Non-LLM bridges (search, comms, code, productivity...) ─────────────── */

const EXTRA_BRIDGES: BridgeDef[] = [
  // Search & RAG
  { id: "tavily", name: "Tavily", kind: "Search", cat: "Search & RAG", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "tvly-...", secret: true }],
    scopes: ["search", "extract"], pricing: "$8 / 1k", docsUrl: "docs.tavily.com",
    blurb: "Agent-grade web search & page extract.", tagline: "Agent search", logoDomain: "tavily.com" },
  { id: "exa", name: "Exa", kind: "Search", cat: "Search & RAG", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "...", secret: true }],
    scopes: ["search", "contents", "similar"], pricing: "$10 / 1k", docsUrl: "docs.exa.ai",
    blurb: "Neural web search built for LLMs.", tagline: "Neural search", logoDomain: "exa.ai" },
  { id: "firecrawl", name: "Firecrawl", kind: "Scraping", cat: "Search & RAG", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "fc-...", secret: true }],
    scopes: ["scrape", "crawl", "map"], pricing: "per page", docsUrl: "firecrawl.dev",
    blurb: "Crawl any site → clean Markdown.", tagline: "Scrape", logoDomain: "firecrawl.dev" },
  { id: "pinecone", name: "Pinecone", kind: "Vector DB", cat: "Search & RAG", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "...", secret: true }, { key: "env", label: "Environment", ph: "us-east-1" }],
    scopes: ["query", "upsert", "delete"], pricing: "per pod", docsUrl: "docs.pinecone.io",
    blurb: "Managed vector DB.", tagline: "Vectors", logoDomain: "pinecone.io" },

  // Voice & vision
  { id: "elevenlabs", name: "ElevenLabs", kind: "Voice", cat: "Voice & vision", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "...", secret: true }],
    scopes: ["tts", "voices", "clone"], pricing: "per char", docsUrl: "elevenlabs.io/docs",
    blurb: "Studio-grade TTS + voice cloning.", tagline: "Voice synthesis", logoDomain: "elevenlabs.io" },
  { id: "deepgram", name: "Deepgram", kind: "Voice", cat: "Voice & vision", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "...", secret: true }],
    scopes: ["transcribe", "live", "tts"], pricing: "per minute", docsUrl: "developers.deepgram.com",
    blurb: "Nova speech → text. Streaming.", tagline: "Real-time STT", logoDomain: "deepgram.com" },

  // Communication
  { id: "gmail", name: "Gmail", kind: "Email", cat: "Communication", auth: "oauth",
    fields: [], scopes: ["read", "send", "label", "draft"], pricing: "free", docsUrl: "developers.google.com/gmail",
    blurb: "Read, label, draft, and send.", tagline: "Email", logoDomain: "mail.google.com" },
  { id: "slack", name: "Slack", kind: "Messaging", cat: "Communication", auth: "oauth",
    fields: [], scopes: ["channels:read", "chat:write", "reactions"], pricing: "free", docsUrl: "api.slack.com",
    blurb: "Read channels, post, react, summarize.", tagline: "Team chat", logoDomain: "slack.com" },
  { id: "resend", name: "Resend", kind: "Email", cat: "Communication", auth: "apikey",
    fields: [{ key: "apiKey", label: "API key", ph: "re_...", secret: true }],
    scopes: ["emails:send", "domains"], pricing: "$20 / mo", docsUrl: "resend.com/docs",
    blurb: "Transactional email built for devs.", tagline: "Tx email", logoDomain: "resend.com" },
  { id: "twilio", name: "Twilio", kind: "Messaging", cat: "Communication", auth: "token",
    fields: [{ key: "sid", label: "Account SID", ph: "AC..." }, { key: "token", label: "Auth token", ph: "...", secret: true }],
    scopes: ["sms", "voice", "verify"], pricing: "per message", docsUrl: "twilio.com/docs",
    blurb: "SMS + voice + verify.", tagline: "SMS & voice", logoDomain: "twilio.com" },

  // Productivity
  { id: "notion", name: "Notion", kind: "Docs", cat: "Productivity", auth: "oauth",
    fields: [], scopes: ["read", "write", "blocks"], pricing: "free", docsUrl: "developers.notion.com",
    blurb: "Read + write pages, databases, blocks.", tagline: "Workspace", logoDomain: "notion.so" },
  { id: "linear", name: "Linear", kind: "Issues", cat: "Productivity", auth: "oauth",
    fields: [], scopes: ["issues:read", "issues:write"], pricing: "free", docsUrl: "developers.linear.app",
    blurb: "Issue triage and updates.", tagline: "Issues", logoDomain: "linear.app" },
  { id: "gcal", name: "Google Calendar", kind: "Scheduling", cat: "Productivity", auth: "oauth",
    fields: [], scopes: ["events.read", "events.write"], pricing: "free", docsUrl: "developers.google.com/calendar",
    blurb: "Defend maker time, schedule.", tagline: "Calendar", logoDomain: "calendar.google.com" },
  { id: "gdrive", name: "Google Drive", kind: "File store", cat: "Productivity", auth: "oauth",
    fields: [], scopes: ["read", "write", "share"], pricing: "free", docsUrl: "developers.google.com/drive",
    blurb: "Files, docs, attachments.", tagline: "Files", logoDomain: "drive.google.com" },

  // Code & deploy
  { id: "github", name: "GitHub", kind: "Code host", cat: "Code & deploy", auth: "oauth",
    fields: [], scopes: ["repo", "pull_requests", "issues", "actions"], pricing: "free", docsUrl: "docs.github.com/rest",
    blurb: "PRs, issues, actions, code review.", tagline: "Code", logoDomain: "github.com" },
  { id: "vercel", name: "Vercel", kind: "Deploy", cat: "Code & deploy", auth: "oauth",
    fields: [], scopes: ["deployments", "projects", "env"], pricing: "free", docsUrl: "vercel.com/docs/rest-api",
    blurb: "Deploy previews, env, observability.", tagline: "Edge deploy", logoDomain: "vercel.com" },
  { id: "sentry", name: "Sentry", kind: "Monitoring", cat: "Code & deploy", auth: "token",
    fields: [{ key: "token", label: "Auth token", ph: "sntrys_...", secret: true }, { key: "org", label: "Org slug", ph: "your-org" }],
    scopes: ["event:read", "issue:read"], pricing: "usage", docsUrl: "docs.sentry.io",
    blurb: "Errors and performance issues.", tagline: "Errors", logoDomain: "sentry.io" },

  // Data & storage
  { id: "postgres", name: "Postgres", kind: "Database", cat: "Data & storage", auth: "token",
    fields: [{ key: "host", label: "Host", ph: "db.example.co" }, { key: "db", label: "Database", ph: "prod" }, { key: "user", label: "User", ph: "agent_ro" }, { key: "pass", label: "Password", ph: "...", secret: true }],
    scopes: ["select", "schema"], pricing: "self-hosted", docsUrl: "postgresql.org/docs",
    blurb: "Read-only against a Postgres replica.", tagline: "OLTP", logoDomain: "postgresql.org" },
  { id: "s3", name: "S3", kind: "Object store", cat: "Data & storage", auth: "iam",
    fields: [{ key: "bucket", label: "Bucket", ph: "my-bucket" }, { key: "region", label: "Region", ph: "us-east-1" }, { key: "access", label: "Access key", ph: "AKIA..." }, { key: "secret", label: "Secret", ph: "...", secret: true }],
    scopes: ["get", "put", "list"], pricing: "pass-through", docsUrl: "docs.aws.amazon.com/s3",
    blurb: "Object storage for files and dumps.", tagline: "Objects", logoDomain: "aws.amazon.com" },
  { id: "supabase", name: "Supabase", kind: "Database", cat: "Data & storage", auth: "apikey",
    fields: [{ key: "url", label: "Project URL", ph: "https://....supabase.co" }, { key: "key", label: "Service role key", ph: "...", secret: true }],
    scopes: ["rest", "realtime", "storage"], pricing: "free + paid", docsUrl: "supabase.com/docs",
    blurb: "Postgres + auth + storage in one.", tagline: "Backend", logoDomain: "supabase.com" },

  // Sales & support
  { id: "stripe", name: "Stripe", kind: "Payments", cat: "Sales & support", auth: "apikey",
    fields: [{ key: "secret", label: "Secret key", ph: "sk_live_...", secret: true }, { key: "whsec", label: "Webhook signing secret", ph: "whsec_...", secret: true }],
    scopes: ["read", "write", "webhooks"], pricing: "pass-through", docsUrl: "stripe.com/docs/api",
    blurb: "Payments, subscriptions, invoices.", tagline: "Payments", logoDomain: "stripe.com" },

  // Custom
  { id: "mcp", name: "Model Context Protocol", kind: "MCP", cat: "Custom", auth: "token",
    fields: [{ key: "url", label: "MCP server URL", ph: "https://..." }, { key: "token", label: "Auth token (optional)", ph: "...", secret: true }],
    scopes: ["resources", "tools"], pricing: "self-hosted", docsUrl: "modelcontextprotocol.io",
    blurb: "Connect any MCP server.", tagline: "MCP", logoDomain: "modelcontextprotocol.io" },
  { id: "webhook", name: "HTTP / Webhook", kind: "HTTP", cat: "Custom", auth: "token",
    fields: [{ key: "url", label: "Endpoint", ph: "https://..." }, { key: "secret", label: "Signing secret", ph: "...", secret: true }],
    scopes: ["inbound", "outbound", "signature"], pricing: "free", docsUrl: "—",
    blurb: "Inbound + outbound webhooks with signed payloads.", tagline: "Webhooks" },
];

export const BRIDGES: BridgeDef[] = [...PROVIDER_BRIDGES, ...EXTRA_BRIDGES];

export function getBridge(id: string): BridgeDef | undefined {
  return BRIDGES.find((b) => b.id === id);
}
