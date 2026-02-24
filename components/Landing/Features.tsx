import React from "react";
import {
  BarChart3,
  Lock,
  Zap,
  MoreHorizontal,
  Pause,
  Share2,
  PenTool,
  X as XIcon,
  Image,
  Smile,
  Calendar,
  Wand2,
  SkipBack,
  SkipForward,
  CheckSquare,
  Heart,
} from "lucide-react";
import { useRouter } from "next/navigation";

const Features = () => {
  const router = useRouter();
  return (
    <section id="features" className="py-24 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-card border border-solid border-border shadow-sm px-4 py-1.5 rounded-full mb-8 animate-fade-in-up hover:border-brand-300 transition-colors cursor-default select-none mx-auto">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
              The Execution Cockpit
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6 tracking-tight">
            Five ways Copanion <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              transforms execution.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            From single-threaded focus to mission-driven execution. Every
            feature is designed to eliminate friction and amplify your agency.
          </p>
        </div>

        {/* Bento Grid - Widget Style */}
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-6 auto-rows-[minmax(300px,auto)]">
          {/* Card 1: AI Task Manager (Large) */}
          <div className="md:col-span-6 lg:col-span-7 bg-card rounded-3xl border border-solid border-border shadow-sm overflow-hidden relative flex flex-col group hover:shadow-sm transition-shadow duration-500">
            {/* Window Header */}
            <div className="h-10 flex items-center justify-between px-4 bg-card/50">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-muted"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-muted"></div>
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                Copanion AI
              </div>
              <div className="w-4"></div>
            </div>

            <div className="p-6 flex flex-col gap-4 h-full bg-card">
              {/* AI Chat Bubble */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                  <Zap size={14} className="text-primary fill-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="bg-card p-4 rounded-2xl rounded-tl-none text-sm text-muted-foreground border border-solid border-border">
                    <p>
                      I've broken down <strong>"Launch MVP"</strong> into
                      actionable steps. Want me to add these to your board?
                    </p>
                  </div>
                  {/* Interactive Task List Preview */}
                  <div className="bg-card border border-solid border-border rounded-xl overflow-hidden shadow-sm">
                    {[
                      {
                        title: "Setup Database Schema",
                        tag: "Dev",
                        priority: "High",
                      },
                      {
                        title: "Draft Landing Page Copy",
                        tag: "Marketing",
                        priority: "Med",
                      },
                      {
                        title: "Configure Stripe Webhooks",
                        tag: "Dev",
                        priority: "High",
                      },
                    ].map((task, i) => (
                      <div
                        key={i}
                        className="p-3 border-b border-solid border-border border-t-0 border-l-0 border-r-0 last:border-0 flex items-center justify-between hover:bg-card transition-colors group/task cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded border-2 border-solid border-border group-hover/task:border-primary transition-colors"></div>
                          <span className="text-sm font-medium text-muted-foreground">
                            {task.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground bg-card border border-solid border-border px-2 py-0.5 rounded">
                          {task.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-primary/80 transition-colors">
                      Confirm All
                    </button>
                    <button className="text-xs bg-card text-muted-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-card/80 transition-colors">
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Deep Work Player (Glassmorphism) */}
          <div className="md:col-span-6 lg:col-span-5 relative rounded-3xl overflow-hidden shadow-sm border border-solid border-border group">
            {/* Background Image with Blur */}
            <div
              className="absolute inset-0 bg-cover bg-center z-0 scale-110 blur-xl opacity-50 transition-transform duration-700 group-hover:scale-125"
              style={{
                backgroundImage:
                  'url("https://picsum.photos/1000/1000?random=1")',
              }}
            ></div>
            <div className="absolute inset-0 bg-card/50 backdrop-blur-md z-10"></div>

            <div className="relative z-20 p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <div className="inline-flex items-center gap-2 bg-card backdrop-blur-md px-3 py-1 rounded-full border border-solid border-border">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                    Focus Mode
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-card/50 flex items-center justify-center cursor-pointer hover:bg-card transition-colors">
                  <MoreHorizontal size={16} className="text-muted-foreground" />
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-32 h-32 rounded-2xl shadow-sm mb-6 relative overflow-hidden group-hover:shadow-sm transition-all duration-500">
                  <img
                    src="https://picsum.photos/400/400?random=1"
                    className="w-full h-full object-cover"
                    alt="Album Art"
                  />
                  {/* Play Overlay */}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
                      <Pause size={16} fill="white" />
                    </div>
                  </div>
                </div>
                <h3 className="text-foreground font-bold text-xl mb-1">
                  Deep House Focus
                </h3>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-6">
                  Ambient Labs
                </p>

                {/* Progress Bar & Waveform */}
                <div className="w-full space-y-2 mb-6">
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground px-1">
                    <span>12:45</span>
                    <span>45:00</span>
                  </div>
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-foreground rounded-full relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-card rounded-full shadow-sm"></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <SkipBack size={24} fill="currentColor" />
                  </button>
                  <button className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                    <Pause size={20} fill="currentColor" />
                  </button>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <SkipForward size={24} fill="currentColor" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Idea Validator */}
          <div className="md:col-span-4 lg:col-span-4 bg-card rounded-3xl shadow-sm overflow-hidden flex flex-col transition-colors border border-solid border-border hover:shadow-sm">
            <div className="p-4 flex items-center justify-between">
              <div className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                <BarChart3 size={14} /> Idea Validator
              </div>
              <div className="text-[10px] font-bold text-primary-foreground bg-green-500 px-2 py-0.5 rounded-full">
                Passed
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full border-[6px] border-solid border-border border-t-primary border-r-primary transform rotate-45 flex items-center justify-center mb-4">
                <div className="transform -rotate-45 flex flex-col">
                  <span className="text-3xl font-black text-foreground">
                    8.5
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    Score
                  </span>
                </div>
              </div>
              <h4 className="font-bold text-foreground text-sm">
                Niche SaaS App
              </h4>
              <p className="text-xs text-muted-foreground mt-1 px-4">
                Strong market demand with low competition detected.
              </p>
            </div>
          </div>

          {/* Card 4: Quick Notes */}
          <div className="md:col-span-4 lg:col-span-4 bg-yellow-50/50 dark:bg-yellow-900/10 rounded-3xl border border-yellow-100 dark:border-yellow-800/20 border-solid shadow-sm overflow-hidden flex flex-col group relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-300/20 dark:bg-yellow-700/20"></div>
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="text-xs font-bold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                <PenTool size={14} /> Scratchpad
              </div>
            </div>
            <div className="p-6 pt-0 flex-1">
              <div
                className="font-handwriting text-foreground text-base leading-7"
                style={{ fontFamily: "cursive" }}
              >
                <p>• Fix the login bug</p>
                <p>• Email 5 beta users</p>
                <p>
                  •{" "}
                  <span className="bg-yellow-100 dark:bg-yellow-800/30 px-1 text-yellow-800 dark:text-yellow-300">
                    Don't forget to launch on Tuesday!
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Card 5: X Integration (Active) */}
          <div className="md:col-span-4 lg:col-span-4 bg-card rounded-3xl border border-solid border-border shadow-sm overflow-hidden flex flex-col relative group hover:shadow-sm transition-all">
            {/* Header */}
            <div className="p-4 flex items-center justify-between bg-card/50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                  <XIcon size={12} strokeWidth={3} />
                </div>
                <span className="text-xs font-bold text-foreground">
                  New Post
                </span>
              </div>
              <button className="text-[10px] font-bold text-primary bg-card px-2 py-1 rounded flex items-center gap-1 hover:bg-card/80 transition-colors">
                <Wand2 size={10} /> AI Polish
              </button>
            </div>

            {/* Composer Body */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex gap-3 h-full">
                <div className="w-8 h-8 rounded-full bg-card overflow-hidden shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=100"
                    alt="Avatar"
                  />
                </div>
                <div className="flex-1 flex flex-col h-full">
                  <p className="text-sm text-foreground leading-relaxed">
                    Just shipped the new dashboard update! 🚀 <br />
                    <br />
                    It's amazing how much faster you can move when you have
                    focus tools built directly into your workflow.{" "}
                    <span className="text-primary">#buildinpublic</span>
                  </p>

                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-primary">
                      <Image
                        size={16}
                        className="cursor-pointer hover:text-primary/80"
                      />
                      <Smile
                        size={16}
                        className="cursor-pointer hover:text-primary/80"
                      />
                      <Calendar
                        size={16}
                        className="cursor-pointer hover:text-primary/80"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full border-2 border-solid border-border border-t-primary transform rotate-45"></div>
                      <button className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full hover:bg-primary/80 transition-colors">
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
