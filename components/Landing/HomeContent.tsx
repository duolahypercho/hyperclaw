import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  Cable,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Download,
  FileText,
  FolderKanban,
  Github,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LucideIcon,
  Monitor,
  Network,
  PlayCircle,
  RadioTower,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMediaUrl } from "$/utils";
import styles from "./HomeContent.module.css";

const MACOS_ARM64_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_ARM64_FILE_NAME;
const MACOS_INTEL_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_INTEL_FILE_NAME;
const WINDOWS_FILE_NAME = process.env.NEXT_PUBLIC_WINDOWS_FILE_NAME;
const LINUX_FILE_NAME = process.env.NEXT_PUBLIC_LINUX_FILE_NAME;

const mediaOrHash = (fileName?: string) => (fileName ? getMediaUrl(fileName) : "#");

const OPENCLAW_MACOS_ARM64_URL = mediaOrHash(MACOS_ARM64_FILE_NAME);
const OPENCLAW_MACOS_INTEL_URL = mediaOrHash(MACOS_INTEL_FILE_NAME);
const OPENCLAW_WINDOWS_URL = mediaOrHash(WINDOWS_FILE_NAME);
const OPENCLAW_LINUX_URL = mediaOrHash(LINUX_FILE_NAME);

type Platform = "mac-arm" | "mac-intel" | "windows" | "linux";

type DownloadOption = {
  id: Platform;
  label: string;
  shortLabel: string;
  url: string;
  Icon: (props: { className?: string }) => JSX.Element;
};

type CapabilityGroup = {
  title: string;
  description: string;
  Icon: LucideIcon;
  items: string[];
};

type ProductChapter = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  Icon: LucideIcon;
  metrics: Array<{ label: string; value: string }>;
  points: string[];
};

type FooterColumn = {
  title: string;
  links: Array<{
    label: string;
    href: string;
    internal?: boolean;
  }>;
};

function useMacArchitecture(): "arm" | "x86" | null {
  const [arch, setArch] = useState<"arm" | "x86" | null>(null);

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      (navigator.platform === "MacIntel" || /Mac/i.test(navigator.userAgent));

    if (!isMac) {
      setArch(null);
      return;
    }

    const nav = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues(
          hints: string[]
        ): Promise<{ architecture?: string; platform?: string }>;
      };
    };

    const userAgentData = nav.userAgentData;
    if (userAgentData?.getHighEntropyValues) {
      userAgentData
        .getHighEntropyValues(["architecture", "platform"])
        .then((values) => {
          const platform = (values.platform ?? "").toLowerCase();
          const architecture = (values.architecture ?? "").toLowerCase();

          if (platform !== "macos") {
            tryWebGLFallback(setArch);
            return;
          }

          if (architecture === "arm" || architecture === "arm64") setArch("arm");
          else if (architecture === "x86" || architecture === "x86-64") setArch("x86");
          else tryWebGLFallback(setArch);
        })
        .catch(() => tryWebGLFallback(setArch));
      return;
    }

    tryWebGLFallback(setArch);
  }, []);

  return arch;
}

function tryWebGLFallback(setArch: (arch: "arm" | "x86" | null) => void) {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");

    if (!gl) {
      setArch(null);
      return;
    }

    const context = gl as WebGLRenderingContext;
    const ext = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "" : "";
    const rendererName = String(renderer);

    if (/Intel/i.test(rendererName)) setArch("x86");
    else if (/Apple/i.test(rendererName)) setArch("arm");
    else setArch(null);
  } catch {
    setArch(null);
  }
}

function useDetectedPlatform(): Platform | null {
  const macArch = useMacArchitecture();
  const [osPlatform, setOsPlatform] = useState<"windows" | "linux" | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (/Win/i.test(navigator.platform)) setOsPlatform("windows");
    else if (/Linux/i.test(navigator.platform)) setOsPlatform("linux");
  }, []);

  if (macArch === "arm") return "mac-arm";
  if (macArch === "x86") return "mac-intel";
  if (osPlatform) return osPlatform;
  return null;
}

function useRevealMotion() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;

    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-visible", "true");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -80px 0px" }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

const AppleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const WindowsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M3 5.548l7.065-.966v6.822H3V5.548zm0 12.904l7.065.966v-6.822H3v5.856zm7.834 1.072L21 21v-7.596H10.834v6.12zm0-14.048v6.12H21V3l-10.166 1.476z" />
  </svg>
);

const LinuxIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.022 1.903 1.395.199.093.387.134.59.134.15 0 .6-.063.863-.195a.44.44 0 00.133-.078c.137.07.208.18.224.317.057.28.08.632.035 1.082-.052.473-.112.872-.197 1.173-.175.638-.49.937-.856.937-.09 0-.184-.013-.283-.039-.493-.128-.807-.356-1.068-.588-.251-.222-.44-.449-.656-.625-.195-.16-.406-.276-.66-.284a.632.632 0 00-.137.014c-.208.05-.37.195-.473.39a1.18 1.18 0 00-.13.59c.008.199.076.4.2.606.124.201.27.399.455.591.193.197.371.399.55.529.176.129.322.2.402.23.137.053.288.112.444.182.193.087.349.204.463.358.116.158.164.34.134.564-.03.21-.1.39-.254.515-.151.13-.38.197-.674.197-.106 0-.202-.009-.3-.027a1.9 1.9 0 01-.363-.117 2.6 2.6 0 01-.234-.13c-.136-.08-.257-.179-.404-.279-.335-.224-.648-.398-.968-.398a.67.67 0 00-.266.053c-.196.081-.32.233-.38.408-.064.176-.068.382.008.577.076.192.234.38.46.52.344.21.71.364 1.076.429.199.036.326.058.48.058a2.03 2.03 0 001.31-.506c.264-.239.393-.553.4-.875.005-.21-.055-.408-.17-.589.224-.114.412-.29.543-.522.13-.231.17-.495.134-.741a1.41 1.41 0 00-.264-.622c.087-.264.13-.562.166-.905.047-.455.026-.857-.036-1.178-.063-.321-.166-.569-.298-.653a.66.66 0 00-.174-.077l-.014-.003.007-.016c.199-.39.293-.762.294-1.083 0-.199-.04-.39-.102-.553-.069-.179-.174-.333-.336-.429-.164-.095-.355-.143-.613-.143-.284 0-.501.076-.758.119-.256.046-.509.07-.834.07l-.154-.003c-.27-.009-.514.044-.717.135-.17.076-.302.193-.373.361-.148-.16-.368-.28-.685-.28-.291 0-.532.098-.712.242-.171.137-.277.328-.302.564a1.45 1.45 0 00.001.316c-.263.028-.529.001-.735-.07a1.47 1.47 0 01-.453-.231 1.99 1.99 0 00-.282-.175 2.15 2.15 0 00-.278-.12c.074-.176.087-.38.033-.58-.048-.175-.14-.325-.255-.446z" />
  </svg>
);

const allDownloads: DownloadOption[] = [
  {
    id: "mac-arm",
    label: "Download for macOS",
    shortLabel: "Apple Silicon",
    url: OPENCLAW_MACOS_ARM64_URL,
    Icon: AppleIcon,
  },
  {
    id: "mac-intel",
    label: "Download for macOS",
    shortLabel: "Intel Mac",
    url: OPENCLAW_MACOS_INTEL_URL,
    Icon: AppleIcon,
  },
  {
    id: "windows",
    label: "Download for Windows",
    shortLabel: "Windows",
    url: OPENCLAW_WINDOWS_URL,
    Icon: WindowsIcon,
  },
  {
    id: "linux",
    label: "Download for Linux",
    shortLabel: "Linux",
    url: OPENCLAW_LINUX_URL,
    Icon: LinuxIcon,
  },
];

const heroStats = [
  { value: "4", label: "runtime families" },
  { value: "local", label: "connector boundary" },
  { value: "live", label: "token streaming" },
];

const runtimeSteps = [
  {
    title: "Dashboard",
    description: "Next.js and Electron interface for chat, projects, knowledge, and status.",
    Icon: LayoutDashboard,
  },
  {
    title: "Bridge relay",
    description: "Requests flow through the hub or local bridge client instead of direct Electron spawning.",
    Icon: Cable,
  },
  {
    title: "Connector",
    description: "The Go daemon owns local process spawning, SQLite state, and gateway sessions.",
    Icon: Server,
  },
  {
    title: "Runtimes",
    description: "Claude Code, Codex, OpenClaw, and Hermes stream back through one surface.",
    Icon: Cpu,
  },
];

const productChapters: ProductChapter[] = [
  {
    eyebrow: "Runtime fabric",
    title: "One calm surface for every agent run.",
    description:
      "Start, monitor, and resume work across Claude Code, Codex, OpenClaw, and Hermes without juggling terminals. HyperClaw keeps the runtime boundary explicit and the stream readable.",
    image: "/landing/agent-runtime-fabric.png",
    imageAlt: "Abstract local relay lattice connecting a desktop dashboard to runtime nodes.",
    Icon: Network,
    metrics: [
      { value: "JSONL", label: "stream aware" },
      { value: "WS", label: "gateway events" },
      { value: "MCP", label: "tool bridge" },
    ],
    points: [
      "Unified agent chat and gateway chat surfaces",
      "Runtime picker, model selection, tool-call grouping, and history",
      "Connector status, logs, and agent stack adapter views",
    ],
  },
  {
    eyebrow: "Knowledge and intelligence",
    title: "Give agents memory they can actually use.",
    description:
      "Knowledge collections, docs, graphs, data tables, SQL, charts, pipelines, and research views sit next to the agents that create and consume them.",
    image: "/landing/knowledge-intelligence-core.png",
    imageAlt: "Dark knowledge graph and data intelligence core with glass tables and graph arcs.",
    Icon: Brain,
    metrics: [
      { value: "docs", label: "workspace memory" },
      { value: "graph", label: "relationships" },
      { value: "data", label: "analysis layer" },
    ],
    points: [
      "Company knowledge collections stored under the HyperClaw workspace",
      "File previews, markdown editing, knowledge graph, and agent-scoped reads",
      "Intelligence tables, SQL console, chart view, timeline, and pipeline panels",
    ],
  },
  {
    eyebrow: "Projects and workflows",
    title: "Turn AI output into shipped work.",
    description:
      "Workflow templates, Mission Control, project canvases, issue boards, and team channels turn agent runs into visible operating systems for real work.",
    image: "/landing/workflow-projects-future.png",
    imageAlt: "High-tech workflow board with connected tasks, timelines, and project channels.",
    Icon: Workflow,
    metrics: [
      { value: "templates", label: "starter crews" },
      { value: "boards", label: "project state" },
      { value: "runs", label: "mission control" },
    ],
    points: [
      "Morning briefings, inbox triage, lead research, bug intake, metrics, and onboarding templates",
      "Project profiles, issue boards, agent rosters, member clusters, and task detail views",
      "Mission Control for workflow runs, ownership, live status, and intervention points",
    ],
  },
];

const capabilityGroups: CapabilityGroup[] = [
  {
    title: "Command dashboard",
    description: "A dense home base for active agent work.",
    Icon: LayoutDashboard,
    items: ["Agent status", "Agent chat", "Logs", "Docs widget", "Pixel Office widget", "Intelligence widget"],
  },
  {
    title: "Agents and runtimes",
    description: "Hire, route, and inspect the AI workers.",
    Icon: Bot,
    items: ["Team roster", "Agent profiles", "Souls and identity", "Skills", "MCP tools", "Cost and usage signals"],
  },
  {
    title: "Messaging gateway",
    description: "Bring multi-channel signal into the agent layer.",
    Icon: RadioTower,
    items: ["Gateway chat", "Channel dashboard", "Announce channels", "Thread export", "Tool action grouping"],
  },
  {
    title: "Knowledge base",
    description: "Local company memory that agents can browse and update.",
    Icon: FileText,
    items: ["Collections", "Markdown docs", "File previews", "Knowledge graph", "Agent-scoped context"],
  },
  {
    title: "Intelligence layer",
    description: "A workspace for tables, research, and operational data.",
    Icon: Database,
    items: ["Data grids", "SQL console", "Charts", "Timelines", "Pipelines", "Smart view detection"],
  },
  {
    title: "Projects",
    description: "Track real work instead of disconnected prompts.",
    Icon: FolderKanban,
    items: ["Project list", "Project detail", "Issue board", "Issue filters", "Agent member cluster"],
  },
  {
    title: "Workflow system",
    description: "Repeatable agent crews for operating rhythms.",
    Icon: Workflow,
    items: ["Templates", "Project editor", "Mission Control", "Manual runs", "Schedules", "Webhook/event triggers"],
  },
  {
    title: "Desktop and devices",
    description: "A local-first app that can grow into a multi-device mesh.",
    Icon: Monitor,
    items: ["Electron app", "Connector install", "Device setup", "Local gateway discovery", "Desktop-only surfaces"],
  },
  {
    title: "Provider control",
    description: "Bring your own models and operational credentials.",
    Icon: LockKeyhole,
    items: ["OpenAI", "Anthropic", "Gemini", "Mistral", "Ollama", "Stripe analytics hooks"],
  },
  {
    title: "Prompt and skill surfaces",
    description: "Improve the way agents write, search, and operate.",
    Icon: Sparkles,
    items: ["Prompt optimizer", "Prompt history", "AI textarea", "Autosuggestions", "OpenClaw skills"],
  },
  {
    title: "Pixel Office",
    description: "A visual operations room for live agent state.",
    Icon: PlayCircle,
    items: ["3D office", "Agent routing", "Immersive screens", "Settings panel", "Status presence"],
  },
  {
    title: "Open core",
    description: "A practical boundary between community and cloud.",
    Icon: Globe2,
    items: ["MIT repo", "Local-only mode", "Optional hub", "Cloud hooks", "No telemetry by default"],
  },
];

const futurePlans = [
  {
    phase: "Near",
    title: "Proactive operating rhythm",
    description:
      "Agents that notice state changes, prepare briefings, and ask for decisions before a workflow goes stale.",
    items: ["Daily operator briefings", "Needs-you queues", "Completion nudges", "Cross-session recall"],
    Icon: Activity,
  },
  {
    phase: "Next",
    title: "Team-mode coordination",
    description:
      "Shared workspaces where multiple people can see agent runs, approvals, channels, and project ownership in one place.",
    items: ["Approvals", "Team channels", "Shared agents", "Multi-device sync"],
    Icon: Users,
  },
  {
    phase: "Later",
    title: "Cross-tool intelligence",
    description:
      "Knowledge, projects, channels, and runtime history feeding one context layer so agents stop acting like isolated tabs.",
    items: ["Context routing", "Relationship memory", "Tool-aware suggestions", "Reusable company graph"],
    Icon: Brain,
  },
  {
    phase: "Optional cloud",
    title: "Hybrid local and hosted agents",
    description:
      "Cloud should add reach without weakening the local connector boundary: hosted coordination, local execution, explicit control.",
    items: ["Hosted agents", "Remote device bridge", "Cloud workspaces", "Local runtime guardrails"],
    Icon: Cloud,
  },
];

const footerColumns: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Feature map", href: "#features" },
      { label: "Future planning", href: "#future" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    title: "App",
    links: [
      { label: "Start for free", href: "/auth/Signup", internal: true },
      { label: "Log in", href: "/auth/Login", internal: true },
      { label: "Dashboard", href: "/dashboard", internal: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "GitHub", href: "https://github.com/duolahypercho/HyperClaw" },
      { label: "Architecture", href: "https://github.com/duolahypercho/HyperClaw/blob/main/docs/ARCHITECTURE.md" },
      { label: "Connector", href: "https://github.com/duolahypercho/HyperClaw/tree/main/connector" },
    ],
  },
];

function getPrimaryDownload(platform: Platform | null) {
  const detected = platform ? allDownloads.find((option) => option.id === platform && option.url !== "#") : null;
  return detected ?? allDownloads.find((option) => option.url !== "#") ?? null;
}

function DownloadCta({
  download,
  compact = false,
}: {
  download: DownloadOption | null;
  compact?: boolean;
}) {
  if (!download) {
    return (
      <span className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/15 bg-white/8 px-5 text-sm text-white/55">
        Builds publish here when available
      </span>
    );
  }

  const Icon = download.Icon;

  return (
    <a
      href={download.url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className={[
        "group inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-white px-5 text-sm font-semibold text-black shadow-[0_18px_70px_rgba(255,255,255,0.18)] transition duration-500 hover:-translate-y-0.5 hover:bg-[#d7fff3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white",
        compact ? "w-full" : "w-full sm:w-auto",
      ].join(" ")}
    >
      <Icon className="h-5 w-5" />
      <span>{download.label}</span>
      <Download className="h-4 w-4 transition duration-500 group-hover:translate-y-0.5" />
    </a>
  );
}

function PlatformLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {allDownloads.map((download) => {
        const Icon = download.Icon;
        if (download.url === "#") {
          return (
            <span
              key={download.id}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/35"
            >
              <Icon className="h-3.5 w-3.5" />
              {download.shortLabel} soon
            </span>
          );
        }

        return (
          <a
            key={download.id}
            href={download.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/12 bg-white/7 px-3 text-xs text-white/70 transition duration-300 hover:border-[#74ffd7]/40 hover:bg-[#74ffd7]/10 hover:text-white"
          >
            <Icon className="h-3.5 w-3.5" />
            {download.shortLabel}
          </a>
        );
      })}
    </div>
  );
}

function SectionHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center" data-reveal>
      <p className="mb-4 text-sm font-medium text-[#8df7d5]">{label}</p>
      <h2 className="text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h2>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/62 md:text-lg">{description}</p>
    </div>
  );
}

function ChapterCard({ chapter, index }: { chapter: ProductChapter; index: number }) {
  const Icon = chapter.Icon;
  const reverse = index % 2 === 1;

  return (
    <section
      className={[
        "grid items-center gap-8 py-10 md:grid-cols-2 md:py-16",
        reverse ? "md:[&_.chapter-copy]:order-2" : "",
      ].join(" ")}
      data-reveal
    >
      <div className="chapter-copy">
        <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-[#74ffd7]/20 bg-[#74ffd7]/8 px-3 py-2 text-sm text-[#9fffe0]">
          <Icon className="h-4 w-4" />
          {chapter.eyebrow}
        </div>
        <h3 className="max-w-xl text-3xl font-semibold leading-tight text-white md:text-5xl">{chapter.title}</h3>
        <p className="mt-5 max-w-xl text-base leading-7 text-white/62">{chapter.description}</p>

        <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          {chapter.metrics.map((metric) => (
            <div key={`${chapter.title}-${metric.label}`} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xl font-semibold text-white">{metric.value}</p>
              <p className="mt-1 text-xs leading-5 text-white/45">{metric.label}</p>
            </div>
          ))}
        </div>

        <ul className="mt-8 space-y-3">
          {chapter.points.map((point) => (
            <li key={point} className="flex max-w-xl gap-3 text-sm leading-6 text-white/70">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#74ffd7]" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#070a0a] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 z-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.13),transparent_28%,transparent_72%,rgba(116,255,215,0.11))]" />
        <Image
          src={chapter.image}
          alt={chapter.imageAlt}
          width={1672}
          height={941}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-[16/9] h-auto w-full object-cover opacity-92 transition duration-700 group-hover:scale-[1.025] group-hover:opacity-100"
        />
      </div>
    </section>
  );
}

function CapabilityCard({ group }: { group: CapabilityGroup }) {
  const Icon = group.Icon;

  return (
    <article
      className="group rounded-lg border border-white/10 bg-white/[0.035] p-5 transition duration-500 hover:-translate-y-1 hover:border-[#74ffd7]/35 hover:bg-[#74ffd7]/7"
      data-reveal
    >
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#9fffe0] transition duration-500 group-hover:border-[#74ffd7]/45 group-hover:bg-[#74ffd7]/10">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-white">{group.title}</h3>
      <p className="mt-2 min-h-[48px] text-sm leading-6 text-white/55">{group.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {group.items.map((item) => (
          <span
            key={`${group.title}-${item}`}
            className="rounded-md border border-white/8 bg-black/25 px-2.5 py-1 text-xs text-white/58"
          >
            {item}
          </span>
        ))}
      </div>
    </article>
  );
}

function FooterLink({
  href,
  children,
  internal,
}: {
  href: string;
  children: React.ReactNode;
  internal?: boolean;
}) {
  const className =
    "inline-flex items-center text-sm text-white/52 transition duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

  if (internal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function LandingFooter({ primaryDownload }: { primaryDownload: DownloadOption | null }) {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#030405] px-5 py-12 sm:px-8 lg:px-10">
      <div className={`${styles.landingGrid} absolute inset-0 opacity-15`} />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#74ffd7]/25 bg-[#74ffd7]/10 text-[#9fffe0]">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">HyperClaw</p>
                <p className="text-xs text-white/45">Local-first AI agent command center</p>
              </div>
            </div>

            <p className="mt-6 max-w-xl text-sm leading-6 text-white/58">
              Built for builders who want powerful AI agents without losing the thread. The dashboard stays calm;
              the connector keeps runtime execution explicit.
            </p>

            <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
              {[
                { label: "MIT community edition", Icon: Github },
                { label: "Connector relay boundary", Icon: Cable },
                { label: "No telemetry by default", Icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.Icon;
                return (
                  <div key={item.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-xs text-white/56">
                    <Icon className="h-4 w-4 shrink-0 text-[#9fffe0]" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerColumns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <p className="mb-4 text-sm font-semibold text-white">{column.title}</p>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      <FooterLink href={link.href} internal={link.internal}>
                        {link.label}
                      </FooterLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-5 border-t border-white/10 pt-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/42">
            <span>© {new Date().getFullYear()} HyperClaw.</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/22 sm:inline-flex" />
            <span>Community edition, cloud-ready architecture.</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="https://github.com/duolahypercho/HyperClaw/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-white/68 transition duration-300 hover:border-[#74ffd7]/35 hover:bg-[#74ffd7]/8 hover:text-white"
            >
              <BookOpen className="h-4 w-4" />
              Read the repo
            </a>
            <DownloadCta download={primaryDownload} compact />
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function HomeContent() {
  const platform = useDetectedPlatform();
  const primaryDownload = useMemo(() => getPrimaryDownload(platform), [platform]);
  useRevealMotion();

  return (
    <div className={`${styles.landingShell} min-h-screen overflow-hidden bg-[#030405] text-white`}>
      <section className="relative isolate min-h-[88svh] overflow-hidden border-b border-white/10">
        <Image
          src="/landing/hero-command-center.png"
          alt="Cinematic AI mission-control workstation with luminous interface panels."
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-center opacity-70"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#030405_0%,rgba(3,4,5,0.92)_31%,rgba(3,4,5,0.56)_58%,rgba(3,4,5,0.36)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,4,5,0.18)_0%,rgba(3,4,5,0.48)_68%,#030405_100%)]" />
        <div className={`${styles.landingGrid} absolute inset-0 -z-10 opacity-35`} />

        <div className="mx-auto flex min-h-[88svh] max-w-7xl flex-col justify-end px-5 pb-10 pt-24 sm:px-8 lg:px-10">
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)]">
            <div className="max-w-4xl">
              <div className={`${styles.heroReveal} inline-flex items-center gap-2 rounded-lg border border-[#74ffd7]/25 bg-[#74ffd7]/9 px-3 py-2 text-sm text-[#b9ffec]`}>
                <ShieldCheck className="h-4 w-4" />
                Local-first mission control for AI agents
              </div>
              <h1 className={`${styles.heroReveal} ${styles.heroDelay1} mt-6 max-w-5xl text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl`}>
                Run every AI agent from one quiet control room.
              </h1>
              <p className={`${styles.heroReveal} ${styles.heroDelay2} mt-6 max-w-2xl text-lg leading-8 text-white/68 md:text-xl`}>
                HyperClaw gives builders a local desktop dashboard for Claude Code, Codex, OpenClaw, Hermes,
                knowledge, workflows, projects, and channels. The command center stays elegant; the execution
                stays on your machine.
              </p>

              <div className={`${styles.heroReveal} ${styles.heroDelay3} mt-9 flex flex-col gap-3 sm:flex-row`}>
                <DownloadCta download={primaryDownload} />
                <a
                  href="#features"
                  className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/7 px-5 text-sm font-semibold text-white transition duration-500 hover:-translate-y-0.5 hover:border-[#74ffd7]/35 hover:bg-[#74ffd7]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Explore the system
                  <ArrowRight className="h-4 w-4 transition duration-500 group-hover:translate-x-1" />
                </a>
              </div>

              <div className={`${styles.heroReveal} ${styles.heroDelay4} mt-6`}>
                <PlatformLinks />
              </div>
            </div>

            <div className={`${styles.heroReveal} ${styles.heroDelay3} hidden rounded-lg border border-white/12 bg-black/35 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:block`}>
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm font-medium text-white">Live run fabric</p>
                  <p className="mt-1 text-xs text-white/45">Dashboard to connector to runtime</p>
                </div>
                <span className="rounded-md border border-[#74ffd7]/25 bg-[#74ffd7]/10 px-2 py-1 text-xs text-[#9fffe0]">
                  streaming
                </span>
              </div>
              <div className="space-y-3">
                {["OpenClaw agent", "Codex run", "Claude Code session", "Hermes relay"].map((label, index) => (
                  <div key={label} className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.035] p-3">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/50">
                      <span
                        className={[
                          "h-2.5 w-2.5 rounded-full",
                          index === 0 ? "bg-[#74ffd7]" : index === 1 ? "bg-white" : "bg-[#7dbbff]",
                        ].join(" ")}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm text-white/82">{label}</p>
                        <p className="text-xs text-white/40">{index === 0 ? "active" : index === 1 ? "queued" : "ready"}</p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <span
                          className={`${styles.runtimeMeter} block h-full rounded-full bg-[linear-gradient(90deg,#74ffd7,#ffffff)]`}
                          style={{ width: `${86 - index * 13}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-4 backdrop-blur-md">
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
                <p className="mt-1 text-sm text-white/45">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main id="features">
        <section className="border-b border-white/10 bg-[#050707] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              label="What ships today"
              title="Less prompt juggling. More operational clarity."
              description="HyperClaw is not a single chat box. It is a local operating layer for the agents, files, channels, projects, and workflows that surround real work."
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {runtimeSteps.map((step, index) => {
                const Icon = step.Icon;
                return (
                  <article key={step.title} className="relative rounded-lg border border-white/10 bg-white/[0.035] p-5" data-reveal>
                    {index < runtimeSteps.length - 1 && (
                      <ChevronRight className="absolute -right-3 top-8 z-10 hidden h-6 w-6 text-white/28 lg:block" />
                    )}
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-[#74ffd7]/20 bg-[#74ffd7]/8 text-[#9fffe0]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/58">{step.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#030405] px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            {productChapters.map((chapter, index) => (
              <ChapterCard key={chapter.title} chapter={chapter} index={index} />
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#070909] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              label="Feature map"
              title="Every major HyperClaw surface, grouped by the job it does."
              description="The page stays simple, but the product underneath is deep: dashboard, agents, runtimes, gateway, projects, workflows, knowledge, intelligence, desktop, devices, providers, and skills."
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilityGroups.map((group) => (
                <CapabilityCard key={group.title} group={group} />
              ))}
            </div>
          </div>
        </section>

        <section id="future" className="relative overflow-hidden border-b border-white/10 bg-[#030405] px-5 py-24 sm:px-8 lg:px-10">
          <div className={`${styles.landingGrid} absolute inset-0 opacity-25`} />
          <div className="relative mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <div data-reveal>
                <p className="mb-4 text-sm font-medium text-[#8df7d5]">Future planning</p>
                <h2 className="max-w-xl text-3xl font-semibold leading-tight text-white md:text-5xl">
                  The future layer is ambitious, but the boundary stays honest.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-7 text-white/62">
                  These are planned directions, not fake screenshots. HyperClaw’s north star is a system
                  where agents can coordinate, remember, and act across tools while local execution remains
                  explicit and inspectable.
                </p>
                <div className="mt-8 rounded-lg border border-[#74ffd7]/20 bg-[#74ffd7]/8 p-5">
                  <div className="mb-3 flex items-center gap-3 text-[#b9ffec]">
                    <Rocket className="h-5 w-5" />
                    <p className="text-sm font-semibold">Planning principle</p>
                  </div>
                  <p className="text-sm leading-6 text-white/68">
                    Future cloud and team features should add coordination, not hide execution. The connector remains
                    the process-spawning boundary for local runtimes.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {futurePlans.map((plan) => {
                  const Icon = plan.Icon;
                  return (
                    <article key={plan.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-5" data-reveal>
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#9fffe0]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/55">
                          {plan.phase}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white">{plan.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-white/58">{plan.description}</p>
                      <div className="mt-5 space-y-2">
                        {plan.items.map((item) => (
                          <div key={`${plan.title}-${item}`} className="flex items-center gap-2 text-xs text-white/58">
                            <Zap className="h-3.5 w-3.5 text-[#74ffd7]" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="download" className="bg-[#050707] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 rounded-lg border border-white/10 bg-white/[0.035] p-6 md:grid-cols-[1fr_0.8fr] md:p-10" data-reveal>
              <div>
                <p className="mb-4 text-sm font-medium text-[#8df7d5]">Start locally</p>
                <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-white md:text-5xl">
                  Download the desktop command center. Connect the runtimes you already use.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-white/62">
                  HyperClaw works as a local dashboard first. Add the connector for live runtime runs, then bring
                  in providers and channels when your workflow needs them.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-4">
                <DownloadCta download={primaryDownload} compact />
                <PlatformLinks />
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Local gateway", Icon: RadioTower },
                    { label: "SQLite store", Icon: Database },
                    { label: "Desktop shell", Icon: Monitor },
                    { label: "Runtime CLIs", Icon: Terminal },
                  ].map((item) => {
                    const Icon = item.Icon;
                    return (
                      <div key={item.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/62">
                        <Icon className="h-4 w-4 text-[#9fffe0]" />
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter primaryDownload={primaryDownload} />
    </div>
  );
}
