import React from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import { useUser } from "$/Providers/UserProv";
const Danger = () => {
  const { logout } = useUser();
  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-destructive">Log Out</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        You are about to log out of your account. Make sure you have saved your
        work.
      </p>
      <Button variant="destructive" onClick={logout}>
        Log Out
      </Button>
    </section>
  );
};

export default Danger;
