import Head from "next/head";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import { getLayout } from "../../../layouts/AuthLayout";

const ResetPassword = () => {
  return (
    <>
      <Head>
        <title>Password Reset Disabled | Hyperclaw</title>
        <meta
          name="description"
          content="Hosted password reset is not part of the local-first Hyperclaw Community Edition."
        />
      </Head>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-background/95 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card/60 p-8 text-center shadow-2xl backdrop-blur-xl"
        >
          <HyperchoIcon className="mx-auto mb-5 h-16 w-16" />
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            No hosted password reset
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Community Edition uses local sessions and does not send password
            reset emails through Hypercho cloud services.
          </p>
          <Button asChild variant="outline" className="mt-7 w-full">
            <Link href="/auth/Login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </motion.div>
      </div>
    </>
  );
};

ResetPassword.getLayout = getLayout;
export default ResetPassword;
