import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMediaUrl } from "$/utils";

const MACOS_ARM64_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_ARM64_FILE_NAME;
const MACOS_INTEL_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_INTEL_FILE_NAME;
const WINDOWS_FILE_NAME = process.env.NEXT_PUBLIC_WINDOWS_FILE_NAME;

const OPENCLAW_MACOS_ARM64_URL =
  getMediaUrl(`${MACOS_ARM64_FILE_NAME}`) ?? "#";
const OPENCLAW_MACOS_INTEL_URL =
  getMediaUrl(`${MACOS_INTEL_FILE_NAME}`) ?? "#";
const OPENCLAW_WINDOWS_URL =
  getMediaUrl(`${WINDOWS_FILE_NAME}`) ?? "#";

const HAS_VALID_DOWNLOAD_URLS =
  OPENCLAW_MACOS_ARM64_URL !== "#" || OPENCLAW_MACOS_INTEL_URL !== "#";
const HAS_WINDOWS_URL = OPENCLAW_WINDOWS_URL !== "#";

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
    const ua = nav.userAgentData;
    if (ua?.getHighEntropyValues) {
      ua.getHighEntropyValues(["architecture", "platform"])
        .then((values) => {
          const platform = (values.platform ?? "").toLowerCase();
          const archVal = (values.architecture ?? "").toLowerCase();
          if (platform !== "macos") {
            tryWebGLFallback(setArch);
            return;
          }
          if (archVal === "arm" || archVal === "arm64") setArch("arm");
          else if (archVal === "x86" || archVal === "x86-64") setArch("x86");
          else tryWebGLFallback(setArch);
        })
        .catch(() => tryWebGLFallback(setArch));
      return;
    }

    tryWebGLFallback(setArch);
  }, []);

  return arch;
}

function tryWebGLFallback(
  setArch: (a: "arm" | "x86" | null) => void
): void {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl) {
      setArch(null);
      return;
    }
    const ext = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_debug_renderer_info"
    );
    const renderer = ext
      ? (gl as WebGLRenderingContext).getParameter(
          ext.UNMASKED_RENDERER_WEBGL
        ) ?? ""
      : "";
    const r = String(renderer);
    if (/Intel/i.test(r)) setArch("x86");
    else if (/Apple/i.test(r)) setArch("arm");
    else setArch(null);
  } catch {
    setArch(null);
  }
}

const Grainient = dynamic(
  () => import("$/components/Grainient/Grainient"),
  { ssr: false }
);

const GrainientBackground = () => (
  <div className="absolute inset-0 z-0">
    <Grainient
      color1="#968d95"
      color2="#0c255f"
      color3="#3f1f9e"
      timeSpeed={1.7}
      colorBalance={0}
      warpStrength={1}
      warpFrequency={5}
      warpSpeed={3.2}
      warpAmplitude={50}
      blendAngle={0}
      blendSoftness={0.05}
      rotationAmount={500}
      noiseScale={2}
      grainAmount={0.1}
      grainScale={2}
      grainAnimated={false}
      contrast={1.5}
      gamma={1}
      saturation={1}
      centerX={0}
      centerY={0}
      zoom={0.9}
    />
  </div>
);

const DownloadIcon = () => (
  <svg
    className="w-5 h-5 shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

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

function useDetectedPlatform(): "mac-arm" | "mac-intel" | "windows" | null {
  const macArch = useMacArchitecture();
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && /Win/i.test(navigator.platform)) {
      setIsWindows(true);
    }
  }, []);

  if (macArch === "arm") return "mac-arm";
  if (macArch === "x86") return "mac-intel";
  if (isWindows) return "windows";
  return null;
}

export default function HomeContent() {
  const { status } = useSession();
  const platform = useDetectedPlatform();

  if (status === "loading") {
    return null;
  }

  const primaryDownload = (() => {
    switch (platform) {
      case "mac-arm":
        return OPENCLAW_MACOS_ARM64_URL !== "#"
          ? { url: OPENCLAW_MACOS_ARM64_URL, label: "Download for macOS", platform: "mac" as const }
          : null;
      case "mac-intel":
        return OPENCLAW_MACOS_INTEL_URL !== "#"
          ? { url: OPENCLAW_MACOS_INTEL_URL, label: "Download for macOS", platform: "mac" as const }
          : null;
      case "windows":
        return HAS_WINDOWS_URL
          ? { url: OPENCLAW_WINDOWS_URL, label: "Download for Windows", platform: "windows" as const }
          : null;
      default:
        return OPENCLAW_MACOS_ARM64_URL !== "#"
          ? { url: OPENCLAW_MACOS_ARM64_URL, label: "Download for macOS", platform: "mac" as const }
          : null;
    }
  })();

  return (
    <div className="min-h-screen relative overflow-hidden bg-transparent">
      <GrainientBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="max-w-2xl w-full text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              OpenClaw Mission Control
            </h1>
            <p className="text-lg text-white/70 mb-8">
              Your local command center for AI assistants.
            </p>

            <Card className="max-w-md mx-auto bg-black/30 backdrop-blur-2xl border-white/10 mb-6">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-5">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    {primaryDownload?.platform === "windows" ? (
                      <WindowsIcon className="w-8 h-8 text-white" />
                    ) : (
                      <AppleIcon className="w-8 h-8 text-white" />
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-semibold text-white">
                    Download OpenClaw Dashboard
                  </h2>

                  {/* Primary download button */}
                  {primaryDownload ? (
                    <Button
                      size="lg"
                      variant="callout"
                      className="w-full gap-2"
                      asChild
                    >
                      <a href={primaryDownload.url} target="_blank" rel="noopener noreferrer" download>
                        <DownloadIcon />
                        {primaryDownload.label}
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-white/60">
                      Download links will be available when builds are published.
                    </p>
                  )}

                  {/* Divider */}
                  <div className="w-full border-t border-white/10" />

                  {/* Other platforms */}
                  <div className="w-full space-y-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">
                      Other platforms
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {OPENCLAW_MACOS_ARM64_URL !== "#" && (
                        <a
                          href={OPENCLAW_MACOS_ARM64_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <AppleIcon className="w-3 h-3" />
                          Apple Silicon
                        </a>
                      )}
                      {OPENCLAW_MACOS_INTEL_URL !== "#" && (
                        <a
                          href={OPENCLAW_MACOS_INTEL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <AppleIcon className="w-3 h-3" />
                          Intel Mac
                        </a>
                      )}
                      {HAS_WINDOWS_URL ? (
                        <a
                          href={OPENCLAW_WINDOWS_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <WindowsIcon className="w-3 h-3" />
                          Windows
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/25 cursor-default">
                          <WindowsIcon className="w-3 h-3" />
                          Windows (soon)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-white/40 text-sm">
              After downloading, open the app and connect to your HyperClaw account.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
