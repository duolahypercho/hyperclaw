import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMediaUrl } from "$/utils";

const MACOS_ARM64_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_ARM64_FILE_NAME;
const MACOS_INTEL_FILE_NAME = process.env.NEXT_PUBLIC_MACOS_INTEL_FILE_NAME;

const OPENCLAW_MACOS_ARM64_URL =
  getMediaUrl(`${MACOS_ARM64_FILE_NAME}`) ?? "#";
const OPENCLAW_MACOS_INTEL_URL =
  getMediaUrl(`${MACOS_INTEL_FILE_NAME}`) ?? "#";

const HAS_VALID_DOWNLOAD_URLS =
  OPENCLAW_MACOS_ARM64_URL !== "#" || OPENCLAW_MACOS_INTEL_URL !== "#";

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

export default function HomeContent() {
  const { status } = useSession();
  const macArch = useMacArchitecture();

  if (status === "loading") {
    return null;
  }

  const preferredMacUrl =
    macArch === "arm"
      ? OPENCLAW_MACOS_ARM64_URL
      : macArch === "x86"
        ? OPENCLAW_MACOS_INTEL_URL
        : null;
  const showSingleDownload = preferredMacUrl != null && preferredMacUrl !== "#";

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

            {/* macOS Download CTA */}
            <Card className="max-w-md mx-auto bg-black/30 backdrop-blur-2xl border-white/10 mb-6">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-1">
                      Download OpenClaw Dashboard
                    </h2>
                  </div>
                  <div className="w-full flex flex-col items-center gap-3">
                    {!HAS_VALID_DOWNLOAD_URLS ? (
                      <p className="text-sm text-white/60">
                        Download links will be available when builds are
                        published.
                      </p>
                    ) : showSingleDownload ? (
                      <Button
                        size="lg"
                        variant="callout"
                        className="w-full gap-2"
                        asChild
                      >
                        <a
                          href={preferredMacUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          <DownloadIcon />
                          Download for MacOS
                        </a>
                      </Button>
                    ) : (
                      <div className="w-full flex flex-col sm:flex-row gap-3 justify-center">
                        <Button
                          size="lg"
                          variant="callout"
                          className="flex-1 gap-2"
                          asChild
                        >
                          <a
                            href={OPENCLAW_MACOS_ARM64_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                          >
                            <DownloadIcon />
                            Apple Silicon
                          </a>
                        </Button>
                        <Button
                          size="lg"
                          variant="callout"
                          className="flex-1 gap-2"
                          asChild
                        >
                          <a
                            href={OPENCLAW_MACOS_INTEL_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                          >
                            <DownloadIcon />
                            Intel
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* OpenClaw extension */}
            <Card className="max-w-md mx-auto bg-black/30 backdrop-blur-2xl border-white/10 mb-8">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h7"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-1">
                      OpenClaw extension
                    </h2>
                    <p className="text-sm text-white/50">
                      Install the HyperClaw plugin into OpenClaw
                    </p>
                  </div>
                  <div className="w-full space-y-2 text-left">
                    <pre className="p-3 rounded-lg bg-black/40 text-white/90 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">
                      <code>{`curl -sL https://claw.hypercho.com/hyperclaw-plugin.tgz -o /tmp/hyperclaw.tgz && openclaw plugins install /tmp/hyperclaw.tgz`}</code>
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20 text-white/90 hover:bg-white/10"
                    onClick={() => {
                      const cmd =
                        "curl -sL https://claw.hypercho.com/hyperclaw-plugin.tgz -o /tmp/hyperclaw.tgz && openclaw plugins install /tmp/hyperclaw.tgz\nopenclaw gateway restart";
                      void navigator.clipboard.writeText(cmd);
                    }}
                  >
                    Copy commands
                  </Button>
                </div>
              </CardContent>
            </Card>

            <p className="text-white/40 text-sm">
              After downloading, open the app and connect to your HyperClaw
              account.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
