import React from "react";
import {
  ArrowRight,
  Play,
  Check,
  MessageSquare,
  Repeat,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const Hero = () => {
  const router = useRouter();
  return (
    <section className="relative pt-32 pb-20 lg:pt-0 lg:min-h-screen lg:flex lg:items-center overflow-hidden bg-background">
      {/* Background Pattern */}
      <div
        className="absolute inset-0 z-0 opacity-[0.6] dark:opacity-[0.3]"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--accent)) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      ></div>

      {/* Floating Blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/30 rounded-full blur-3xl pointer-events-none z-0"></div>

      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center">
        
        {/* Main Headline */}
        <h1 className="text-5xl md:text-6xl font-semibold text-foreground tracking-tight leading-[1.1] mb-6 animate-fade-in-up mx-auto max-w-4xl">
          Build alone.<br />
          Finish together.
        </h1>

        {/* Subhead */}
        <p className="text-lg text-muted-foreground mb-6 leading-relaxed max-w-2xl mx-auto animate-fade-in-up delay-100">
          Copanion is your AI productivity partner—turn ideas into action and achieve every goal, together.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-200 relative z-30">
          <Button
            variant="accent"
            onClick={() => router.push("/auth/signup")}
          >
            Join for free
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push("/download")}
          >
            Download now
          </Button>
        </div>

        <p className="text-sm font-normal text-muted-foreground animate-fade-in-up delay-300 mt-4">
          No credit card required.
        </p>
      </div>

      {/* --- DESKTOP FLOATING VISUALS (Around the Text) --- */}
      <div className="hidden lg:block absolute inset-0 pointer-events-none z-10 overflow-hidden">
        <div className="absolute top-[15%] left-[5%] xl:left-[10%] animate-float transform -rotate-6 transition-transform hover:scale-105 duration-500">
          <div className="bg-[#fef9c3] dark:bg-yellow-900/20 p-6 w-64 shadow-2xl shadow-yellow-900/5 dark:shadow-yellow-500/10 rounded-2xl border border-yellow-100 dark:border-yellow-800/30 relative">
            <div className="w-8 h-8 rounded-full bg-background/80 absolute -top-4 -left-4 shadow-sm flex items-center justify-center">
              <div className="w-3 h-3 bg-yellow-400 dark:bg-yellow-500 rounded-full"></div>
            </div>
            <p
              className="font-handwriting text-foreground text-lg leading-snug font-medium"
              style={{ fontFamily: "cursive" }}
            >
              "Validate the SaaS idea before building the MVP..."
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-bold bg-yellow-200/50 dark:bg-yellow-800/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                Idea
              </span>
              <span className="text-[10px] font-semibold bg-background/50 text-muted-foreground px-2 py-0.5 rounded-full">
                In Progress
              </span>
            </div>
          </div>
        </div>

        {/* Top Right: Timer (Glass/White) */}
        <div className="absolute top-[18%] right-[5%] xl:right-[10%] animate-float-delayed transform rotate-3 transition-transform hover:scale-105 duration-500">
          <div className="bg-background p-5 w-60 rounded-3xl shadow-2xl shadow-indigo-900/5 border border-solid border-border">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Focus Mode
              </span>
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            </div>
            <div className="text-center py-2">
              <div className="text-5xl font-mono font-black text-foreground tracking-tighter">
                25:00
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Deep Work Cycle
              </p>
            </div>
            <div className="mt-4 flex gap-2 justify-center">
              <div className="h-8 w-8 rounded-full bg-background/50 flex items-center justify-center">
                <Repeat size={14} className="text-muted-foreground" />
              </div>
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
                <Play size={14} fill="currentColor" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Left: Tasks (White) */}
        <div className="absolute bottom-[15%] left-[8%] xl:left-[12%] animate-float-delayed transform rotate-2 transition-transform hover:scale-105 duration-500">
          <div className="bg-background p-5 w-72 rounded-3xl shadow-2xl shadow-blue-900/5 border border-solid border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-background/50 flex items-center justify-center text-accent">
                <Check size={18} strokeWidth={3} />
              </div>
              <div>
                <div className="font-semibold text-foreground text-sm">
                  Next Tasks
                </div>
                <div className="text-[10px] text-muted-foreground">
                  AI Suggested
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-solid border-border">
                <div className="w-4 h-4 rounded border-2 border-muted-foreground"></div>
                <span className="text-xs font-medium text-muted-foreground line-through opacity-50">
                  Setup landing page
                </span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-background border border-solid border-border shadow-sm">
                <div className="w-4 h-4 rounded border-2 border-accent bg-accent flex items-center justify-center">
                  <Check size={10} className="text-accent-foreground" />
                </div>
                <span className="text-xs font-semibold text-foreground">
                  Email waiting list
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Right: Squad/Integrations */}
        <div className="absolute bottom-[12%] right-[8%] xl:right-[15%] animate-float transform -rotate-3 transition-transform hover:scale-105 duration-500">
          <div className="bg-card p-5 w-64 rounded-3xl shadow-2xl shadow-purple-900/5 dark:shadow-purple-500/10 border border-border">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-muted-foreground">
                My Squad
              </span>
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border-2 border-card bg-muted overflow-hidden"
                  >
                    <img
                      src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${
                        i * 123
                      }`}
                      alt="avatar"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-card shadow-sm flex items-center justify-center">
                <MessageSquare size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-foreground">
                  Sarah just checked in
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  "Finished the API docs! 🚀"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MOBILE VISUALS (Stacked below text) --- */}
      <div className="lg:hidden mt-12 px-4 relative z-10 w-full max-w-sm mx-auto">
        {/* A condensed card stack for mobile */}
        <div className="relative">
          {/* Card 1: Timer (Back) */}
          <div className="absolute top-0 left-0 w-full transform -rotate-3 scale-95 opacity-80 z-0">
            <div className="bg-card h-32 rounded-3xl border border-border shadow-lg"></div>
          </div>
          {/* Card 2: Note (Middle) */}
          <div className="absolute top-2 left-0 w-full transform rotate-2 scale-95 opacity-90 z-10">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 h-32 rounded-3xl border border-yellow-100 dark:border-yellow-800/30 shadow-lg"></div>
          </div>
          {/* Card 3: Main UI (Front) */}
          <div className="relative z-20 bg-card rounded-3xl shadow-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div>
                  <div className="font-bold text-foreground">Today's Focus</div>
                  <div className="text-xs text-muted-foreground">
                    3 tasks remaining
                  </div>
                </div>
              </div>
              <div className="text-2xl font-black text-foreground font-mono">
                25:00
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <div className="w-5 h-5 rounded-full border-2 border-border"></div>
                <span className="text-sm font-medium text-foreground">
                  Ship the new landing page
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-primary font-bold mt-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                AI Partner is active
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
