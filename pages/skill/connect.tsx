import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { hyperchoApi } from "$/services/http.config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Loader2, ArrowRight, Download } from "lucide-react";
import { motion } from "framer-motion";
import Head from "next/head";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";

type Step = "loading" | "unauthenticated" | "confirm" | "success";

function SkillConnect() {
  const router = useRouter();
  const { app } = router.query;
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>("loading");
  const [apiKey, setApiKey] = useState<string>("");
  const [appName, setAppName] = useState<string>("AI Assistant");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (app && typeof app === "string") {
      setAppName(decodeURIComponent(app));
    }

    if (session) {
      setStep("confirm");
    } else {
      setStep("unauthenticated");
    }
  }, [session, status, app]);

  const generateAndConnect = async () => {
    setLoading(true);
    try {
      const response = await hyperchoApi.post("/skill/token", {
        name: `Connected to ${appName}`,
      });
      if (response.data.success) {
        setApiKey(response.data.data.token);
        setStep("success");
      }
    } catch (error) {
      console.error("Error generating API key:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            <h1 className="text-2xl font-semibold">Connect to {appName}</h1>
            <p className="text-muted-foreground mt-2">
              Sign in to authorize access to your account
            </p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={() =>
                signIn(undefined, { callbackUrl: "/skill/connect" })
              }
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

  if (step === "confirm") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-card border border-border rounded-2xl shadow-xl"
        >
          <div className="text-center mb-8">
            <HyperchoIcon className="h-16 w-16 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold">Connect to {appName}</h1>
            <p className="text-muted-foreground mt-2">
              {appName} wants to access your Hypercho account
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium mb-2">
              This will allow {appName} to:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• View and manage your tasks</li>
              <li>• Create new tasks and todos</li>
              <li>• Access your account information</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push("/")}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={generateAndConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Allow Access
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-card border border-border rounded-2xl shadow-xl"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-semibold">Connected!</h1>
            <p className="text-muted-foreground mt-2">
              {appName} has been connected to your account
            </p>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
              Copy your API key now!
            </p>
            <p className="text-xs text-muted-foreground">
              For security reasons, we cannot show this again. Make sure to copy
              it now.
            </p>
          </div>

          <div className="flex gap-2 mb-6">
            <Input value={apiKey} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copyToClipboard}>
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center mb-4">
            You can revoke access anytime in Settings → AI Access
          </p>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => router.push("/skill/download")}
          >
            <Download className="w-4 h-4" />
            Download Skill for AI
          </Button>

          <Button className="w-full" onClick={() => router.push("/")}>
            Go to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  return null;
}

export default function SkillConnectWithHead() {
  return (
    <>
      <Head>
        <title>Connect to AI - Hypercho</title>
        <meta
          name="description"
          content="Connect your Hypercho account to AI assistants"
        />
      </Head>
      <SkillConnect />
    </>
  );
}
