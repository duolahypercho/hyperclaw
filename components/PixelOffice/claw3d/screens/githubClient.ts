/**
 * GitHub Review Station client.
 *
 * Routes all `gh` CLI commands through the OpenClaw gateway
 * (Hub → Connector → local `gh` on the device). No local `gh` install needed,
 * no API routes, no Vercel cost.
 */

import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

// ── Error classes to distinguish gateway errors from gh CLI errors ───────────

/** Gateway/Hub level error (no device, no auth token, WS disconnected). */
export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayError";
  }
}

/** gh CLI error (not installed, not authenticated, command failed). */
export class GhCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhCliError";
  }
}

// Hub/gateway-level error patterns (never reached the device's gh CLI)
const GATEWAY_ERROR_PATTERNS = [
  /^not authenticated$/i,
  /no device registered/i,
  /needsSetup/i,
  /websocket not connected/i,
  /request .* timed out/i,
  /hub returned/i,
  /no device/i,
];

function isGatewayError(msg: string): boolean {
  return GATEWAY_ERROR_PATTERNS.some((p) => p.test(msg));
}

// ── Helper: run a `gh` command via the gateway ──────────────────────────────

async function gh(args: string): Promise<string> {
  const result = (await bridgeInvoke("send-command", { command: `gh ${args}` })) as {
    success?: boolean;
    data?: string;
    error?: string;
    needsSetup?: boolean;
  };
  if (!result.success) {
    const msg = result.error || "gh command failed";
    if (result.needsSetup || isGatewayError(msg)) {
      throw new GatewayError(msg);
    }
    throw new GhCliError(msg);
  }
  return result.data ?? "";
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Failed to parse gh output");
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GhPrListItem {
  number: number;
  title: string;
  author: { login: string };
  isDraft: boolean;
  updatedAt: string;
  statusCheckRollup?: { state: string }[];
  headRepository?: { nameWithOwner: string };
}

interface PrSummary {
  repo: string;
  number: number;
  title: string;
  author: string;
  isDraft: boolean;
  updatedAt: string;
  statusSummary: string | null;
}

function mapPrList(items: GhPrListItem[], repoFallback: string | null): PrSummary[] {
  return items.map((pr) => {
    const rollup = pr.statusCheckRollup ?? [];
    let statusSummary: string | null = null;
    if (rollup.length > 0) {
      const states = rollup.map((c) => c.state);
      if (states.every((s) => s === "SUCCESS")) statusSummary = "success";
      else if (states.some((s) => s === "FAILURE" || s === "ERROR")) statusSummary = "failure";
      else if (states.some((s) => s === "PENDING")) statusSummary = "pending";
    }
    return {
      repo: pr.headRepository?.nameWithOwner ?? repoFallback ?? "",
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
      statusSummary,
    };
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export async function fetchDashboard() {
  // Check auth
  let login: string | null = null;
  try {
    const userRaw = await gh("api user");
    const user = parseJson<{ login?: string }>(userRaw);
    login = user.login ?? null;
  } catch (e: any) {
    // Re-throw gateway errors so onboarding can distinguish them
    if (e instanceof GatewayError) throw e;

    return {
      ready: false,
      message: `GitHub CLI not authenticated on the connected device. Run \`gh auth login\` on the device.${e.message ? ` (${e.message})` : ""}`,
      viewerLogin: null,
      currentRepoSlug: null,
      reviewRequests: [],
      currentRepoPullRequests: [],
      authoredPullRequests: [],
    };
  }

  // Detect current repo on device
  let repoSlug: string | null = null;
  try {
    const raw = await gh("repo view --json nameWithOwner -q .nameWithOwner");
    repoSlug = raw.trim() || null;
  } catch {
    // not in a repo — that's fine
  }

  const fields = "number,title,author,isDraft,updatedAt,statusCheckRollup,headRepository";

  // Run queries in parallel
  const [reviewReq, repoPrs, authored] = await Promise.allSettled([
    gh(`search prs --review-requested @me --state open --json ${fields} --limit 20`),
    repoSlug
      ? gh(`pr list --state open --json ${fields} --limit 20`)
      : Promise.resolve("[]"),
    gh(`search prs --author @me --state open --json ${fields} --limit 20`),
  ]);

  const parse = (r: PromiseSettledResult<string>): GhPrListItem[] => {
    if (r.status === "fulfilled") {
      try { return JSON.parse(r.value); } catch { return []; }
    }
    return [];
  };

  return {
    ready: true,
    message: null,
    viewerLogin: login,
    currentRepoSlug: repoSlug,
    reviewRequests: mapPrList(parse(reviewReq), repoSlug),
    currentRepoPullRequests: mapPrList(parse(repoPrs), repoSlug),
    authoredPullRequests: mapPrList(parse(authored), repoSlug),
  };
}

// ── PR Detail ────────────────────────────────────────────────────────────────

const DIFF_BYTE_LIMIT = 80_000;

export async function fetchPrDetail(repo: string, number: number) {
  const detailFields = "number,title,author,body,url,updatedAt,reviewDecision,mergeable,headRefOid,statusCheckRollup,reviews,files";

  const [prRaw, diffRaw] = await Promise.all([
    gh(`pr view ${number} --repo ${repo} --json ${detailFields}`),
    gh(`pr diff ${number} --repo ${repo}`).catch(() => ""),
  ]);

  const pr = parseJson<any>(prRaw);

  let diff: string | null = diffRaw || null;
  let diffTruncated = false;
  if (diff && diff.length > DIFF_BYTE_LIMIT) {
    diff = diff.slice(0, DIFF_BYTE_LIMIT);
    diffTruncated = true;
  }

  return {
    pullRequest: {
      repo,
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      body: pr.body ?? null,
      url: pr.url ?? `https://github.com/${repo}/pull/${number}`,
      updatedAt: pr.updatedAt,
      reviewDecision: pr.reviewDecision ?? null,
      mergeable: pr.mergeable ?? null,
      headRefOid: pr.headRefOid ?? null,
      diff,
      diffTruncated,
      statusChecks: (pr.statusCheckRollup ?? []).map((c: any) => ({
        name: c.name ?? c.context ?? "unknown",
        status: c.status ?? null,
        conclusion: c.conclusion ?? c.state ?? null,
        workflow: c.workflowName ?? null,
        detailsUrl: c.detailsUrl ?? c.targetUrl ?? null,
      })),
      reviews: (pr.reviews ?? []).map((r: any) => ({
        author: r.author?.login ?? "unknown",
        state: r.state ?? "COMMENTED",
        body: r.body ?? null,
        submittedAt: r.submittedAt ?? null,
      })),
      files: (pr.files ?? []).map((f: any) => ({
        path: f.path,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        status: f.status ?? null,
        patch: f.patch ?? null,
      })),
    },
  };
}

// ── Submit review ────────────────────────────────────────────────────────────

export async function postReview(repo: string, number: number, action: string, body: string) {
  const flag =
    action === "APPROVE" ? "--approve"
    : action === "REQUEST_CHANGES" ? "--request-changes"
    : "--comment";

  const bodyArg = body.trim() ? ` --body ${JSON.stringify(body)}` : "";
  await gh(`pr review ${number} --repo ${repo} ${flag}${bodyArg}`);
  return { message: `Review submitted: ${action}` };
}

// ── Submit inline comment ────────────────────────────────────────────────────

export async function postInlineComment(input: {
  repo: string;
  pullNumber: number;
  commitId: string | null;
  path: string;
  line: number;
  side: string;
  body: string;
}) {
  const commitArg = input.commitId ? ` -f commit_id=${input.commitId}` : "";
  await gh(
    `api --method POST repos/${input.repo}/pulls/${input.pullNumber}/comments` +
    ` -f body=${JSON.stringify(input.body)}` +
    ` -f path=${input.path}` +
    ` -F line=${input.line}` +
    ` -f side=${input.side || "RIGHT"}` +
    commitArg
  );
  return { message: "Inline comment posted." };
}
