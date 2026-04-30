import Head from "next/head";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";

export default function SkillConnect() {
  return (
    <>
      <Head>
        <title>Local Skill Connection | Hyperclaw</title>
        <meta
          name="description"
          content="Hyperclaw Community Edition connects skills through the local connector and OpenClaw gateway."
        />
      </Head>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card/60 p-8 text-center shadow-2xl backdrop-blur-xl"
        >
          <HyperchoIcon className="mx-auto mb-5 h-16 w-16" />
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Cable className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Use the local connector
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Hosted skill API keys are not part of the open-source experience.
            Connect AI skills through the local connector, OpenClaw gateway, and
            MCP settings in the dashboard.
          </p>
          <Button asChild className="mt-7 w-full">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </motion.div>
      </div>
    </>
  );
}
