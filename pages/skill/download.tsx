import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, ArrowRight, Download, Terminal, FileCode, ExternalLink, Key } from "lucide-react";
import { motion } from "framer-motion";
import Head from "next/head";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";

type Step = "loading" | "unauthenticated" | "connected";

function SkillDownload() {
  const router = useRouter();
  const { app } = router.query;
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>("loading");
  const [appName, setAppName] = useState<string>("AI Assistant");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (app && typeof app === "string") {
      setAppName(decodeURIComponent(app));
    }

    if (session) {
      setStep("connected");
    } else {
      setStep("unauthenticated");
    }
  }, [session, status, app]);

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (step === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-card border border-border rounded-2xl shadow-xl"
        >
          <div className="text-center mb-8">
            <HyperchoIcon className="h-16 w-16 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold">Get Hypercho Skill</h1>
            <p className="text-muted-foreground mt-2">
              Sign in to get your API key and download the skill
            </p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={() => signIn(undefined, { callbackUrl: "/skill/download" })}
              className="w-full h-12"
            >
              Sign In
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <a href="/auth/Signup" className="text-primary hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Connected - show download options
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="text-center mb-8">
          <HyperchoIcon className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-3xl font-semibold">Hypercho Skill</h1>
          <p className="text-muted-foreground mt-2">
            Connect {appName} to your Hypercho account
          </p>
        </div>

        {/* Step 1: Get API Key */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-semibold">1</span>
            </div>
            <h2 className="text-lg font-semibold">Get Your API Key</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Your unique API key to authenticate with Hypercho
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/Settings")}
          >
            <Key className="w-4 h-4 mr-2" />
            Go to Settings → AI Access
          </Button>
        </div>

        {/* Step 2: Install Skill */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-semibold">2</span>
            </div>
            <h2 className="text-lg font-semibold">Install the Skill</h2>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Option A: Using npx (Recommended)</p>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm">
                npx hypercho-skill@latest
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Option B: Manual Install</p>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm">
                npm install hypercho-skill
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Configure */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-semibold">3</span>
            </div>
            <h2 className="text-lg font-semibold">Configure Your AI</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            After installing, the skill will ask for your API key. Enter the key from Step 1.
          </p>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              Need Help?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Check our documentation for step-by-step guides
            </p>
            <Button variant="link" className="p-0 h-auto mt-2" asChild>
              <a href="https://docs.hypercho.com/skills" target="_blank" rel="noopener noreferrer">
                View Documentation <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          <Button variant="link" onClick={() => router.push("/")}>
            Go to Dashboard
          </Button>
        </p>
      </motion.div>
    </div>
  );
}

// Remove the duplicate import - already imported at top

export default function SkillDownloadWithHead() {
  return (
    <>
      <Head>
        <title>Get Hypercho Skill</title>
        <meta
          name="description"
          content="Download and install the Hypercho skill for AI assistants"
        />
      </Head>
      <SkillDownload />
    </>
  );
}
