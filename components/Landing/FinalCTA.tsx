"use client";

import { useRouter } from "next/navigation";
import {
  Bot,
  Zap,
  MessageSquare,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

const FinalCTA = () => {
  const router = useRouter();
  return (
    <section
      id="companionship"
      className="py-24 bg-background overflow-hidden relative"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-20">
          <div className="lg:w-1/2">
            <h2 className="text-4xl lg:text-5xl font-black text-foreground mb-6 leading-[1.1] tracking-tight">
              Ready to transform <br />
              execution?
            </h2>
            <p className="text-lg text-muted-foreground mb-3 leading-relaxed max-w-md">
              Experience the High-Agency Execution Cockpit. Turn vague todos
              into structured missions. Eliminate decision fatigue. Execute with
              clarity.
            </p>

            <button
              className="px-6 py-3 mb-3 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors text-sm whitespace-nowrap flex items-center gap-2 group"
              onClick={() => router.push("/auth/signup")}
            >
              Start for Free
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </button>

            <div className="grid grid-cols-1 gap-6">
              {[
                {
                  title: "Theater Mode",
                  desc: "Single Active Task with spotlight focus.",
                  icon: Bot,
                },
                {
                  title: "Mission Briefings",
                  desc: "AI transforms intent into structured missions.",
                  icon: Zap,
                },
                {
                  title: "Intent-Sensing",
                  desc: "Context-aware dashboard adapts to your workflow.",
                  icon: MessageSquare,
                },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 group mb-3">
                  <div className="w-10 h-10 rounded-lg bg-card border border-solid border-border flex items-center justify-center shrink-0 text-primary shadow-sm group-hover:scale-110 transition-transform">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {item.title}
                    </h4>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:w-1/2 w-full relative">
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

            {/* AI Companion Chat UI Mockup */}
            <div className="relative bg-card rounded-3xl shadow-2xl border border-solid border-border overflow-hidden max-w-sm mx-auto transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="bg-primary p-6 text-primary-foreground relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <Bot size={20} className="text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Copanion AI</h3>
                    <p className="text-accent text-xs font-medium uppercase tracking-wider mt-0.5">
                      Always here for you
                    </p>
                  </div>
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-primary to-transparent opacity-50"></div>
              </div>

              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto customScrollbar2">
                {/* AI Message */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-muted/50 rounded-2xl rounded-tl-none p-3 border border-border">
                      <p className="text-sm text-foreground">
                        I've broken down "Launch MVP" into 5 actionable tasks.
                        Want me to add them to your board?
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      Just now
                    </span>
                  </div>
                </div>

                {/* User Message */}
                <div className="flex gap-3 justify-end">
                  <div className="flex-1 flex justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none p-3 max-w-[80%]">
                      <p className="text-sm">Yes, please add them!</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-foreground">
                      You
                    </span>
                  </div>
                </div>

                {/* AI Message with Tasks */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-muted/50 rounded-2xl rounded-tl-none p-3 border border-border">
                      <p className="text-sm text-foreground mb-2">
                        Done! Here's what I added:
                      </p>
                      <div className="space-y-1.5">
                        {[
                          "Setup database schema",
                          "Draft landing page copy",
                          "Configure payment webhooks",
                        ].map((task, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-muted-foreground bg-card/50 p-2 rounded-lg border border-border"
                          >
                            <div className="w-3 h-3 rounded border border-primary"></div>
                            <span>{task}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      2 minutes ago
                    </span>
                  </div>
                </div>

                {/* Typing Indicator */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-muted/50 rounded-2xl rounded-tl-none p-3 border border-border w-fit">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-150"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted/50 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask Copanion anything..."
                    className="flex-1 bg-card border border-border rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
