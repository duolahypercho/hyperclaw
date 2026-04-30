import Head from "next/head";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MonitorCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import { getLayout } from "../../layouts/AuthLayout";

const Signup = () => {
  return (
    <>
      <Head>
        <title>Local Sign In | Hyperclaw</title>
        <meta
          name="description"
          content="Hyperclaw Community Edition runs local-first. Create or use a local session to connect your local dashboard and connector."
        />
      </Head>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-background/95 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-accent/10 blur-2xl" />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card/60 p-8 text-center shadow-2xl backdrop-blur-xl"
        >
          <HyperchoIcon className="mx-auto mb-5 h-16 w-16" />
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <MonitorCog className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Local-first accounts
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The open-source edition no longer creates hosted Hypercho accounts.
            Use the sign-in screen to start a local session, then connect your
            local connector and OpenClaw gateway from onboarding.
          </p>
          <Button asChild className="mt-7 w-full">
            <Link href="/auth/Login">
              Continue to local sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </>
  );
};

Signup.getLayout = getLayout;
export default Signup;
