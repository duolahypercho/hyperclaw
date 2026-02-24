import React from "react";
import {
  Play,
  SkipForward,
  SkipBack,
  Repeat,
  List,
  Plus,
  Maximize2,
  Edit2,
  Send,
  MoreHorizontal,
  Clock,
  Music,
  Bot,
  CheckSquare,
} from "lucide-react";

const Solution: React.FC = () => {
  return (
    <section id="solution" className="py-24 bg-background relative">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 bg-background border border-solid border-border shadow-sm px-4 py-1.5 rounded-full mb-8 animate-fade-in-up hover:border-brand-300 transition-colors cursor-default select-none mx-auto">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Our Solution
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-foreground mt-6 mb-4 tracking-tight">
            Built to solve the silence.
          </h2>
          <p className="text-muted-foreground text-lg">
            More than just a workspace. It&apos;s a presence that keeps you on
            track when the motivation fades. AI that cares, and tools that
            focus.
          </p>
        </div>

        {/* Detailed Dashboard Mockup */}
        <div className="relative w-full">
          <div className="w-full bg-muted/30 rounded-3xl shadow-2xl border border-border p-2 lg:p-4 overflow-hidden">
            {/* Mockup Header */}
            <div className="h-12 bg-card rounded-t-2xl flex items-center justify-between px-4 border-b border-border mb-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                Copanion Workspace
              </div>
              <div className="w-8 h-8 rounded-full bg-background/50">
                <img
                  src="https://picsum.photos/100/100?random=99"
                  className="w-full h-full rounded-full"
                  alt="Profile"
                />
              </div>
            </div>

            {/* Mockup Grid Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-auto lg:h-[600px]">
              {/* Col 1: Widgets (Music, Pomodoro, Clock) */}
              <div className="space-y-4 flex flex-col">
                {/* Music Widget */}
                <div className="bg-card p-5 rounded-2xl shadow-sm border border-solid border-border hover:shadow-sm transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-foreground text-xs font-semibold uppercase">
                      <Music size={12} /> Lofi Station
                    </div>
                    <MoreHorizontal
                      size={14}
                      className="text-muted-foreground"
                    />
                  </div>
                  <div className="flex gap-4 items-center mb-6">
                    <img
                      src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=100&q=80"
                      className="w-16 h-16 rounded-xl object-cover shadow-sm"
                      alt="Album"
                    />
                    <div>
                      <div className="font-bold text-foreground">
                        Deep Focus
                      </div>
                      <div className="text-xs text-muted-foreground font-medium">
                        Ambient Mix
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground px-1">
                    <SkipBack
                      size={20}
                      className="hover:text-muted-foreground cursor-pointer"
                    />
                    <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:scale-105 transition-transform cursor-pointer">
                      <Play size={16} fill="currentColor" />
                    </div>
                    <SkipForward
                      size={20}
                      className="hover:text-muted-foreground cursor-pointer"
                    />
                  </div>
                </div>

                {/* Pomodoro Widget */}
                <div className="bg-card p-5 rounded-2xl shadow-sm border border-solid border-border flex-1 flex flex-col justify-center items-center relative overflow-hidden group">
                  <div className="absolute top-5 left-5 flex items-center gap-2 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>{" "}
                    Live Session
                  </div>
                  <div className="text-6xl font-mono font-black text-foreground mt-2 mb-2 tracking-tighter group-hover:scale-110 transition-transform duration-500">
                    25:00
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mb-8">
                    Focus Cycle 1/4
                  </div>

                  <div className="flex gap-4">
                    <button className="w-14 h-14 rounded-2xl bg-card text-muted-foreground hover:bg-card/80 transition-colors flex items-center justify-center">
                      <Repeat size={20} />
                    </button>
                    <button className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform">
                      <Play size={20} fill="white" />
                    </button>
                  </div>
                </div>

                {/* Clock Widget */}
                <div className="bg-card p-5 rounded-2xl shadow-sm border border-solid border-border">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-bold uppercase">
                      <Clock size={12} /> Local Time
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      NYC
                    </span>
                  </div>
                  <div className="text-3xl font-mono font-black text-foreground">
                    02:10{" "}
                    <span className="text-lg text-muted-foreground font-medium">
                      PM
                    </span>
                  </div>
                </div>
              </div>

              {/* Col 2: My Tasks */}
              <div className="bg-card rounded-2xl shadow-sm border border-solid border-border flex flex-col h-[600px] hover:shadow-sm transition-shadow">
                <div className="p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <List size={18} /> Today's Plan
                  </div>
                  <Maximize2
                    size={16}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex gap-2 mb-6">
                    <input
                      type="text"
                      placeholder="Add a new goal..."
                      className="flex-1 bg-card border border-solid border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                    />
                    <button className="bg-primary text-primary-foreground rounded-xl px-4 flex items-center shadow-lg hover:bg-primary/80 transition-colors">
                      <Plus size={20} />
                    </button>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="p-4 bg-card border border-solid border-border rounded-xl shadow-[0_4px_20px_-10px_rgba(37,99,235,0.2)] group hover:border-accent transition-all cursor-pointer relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent"></div>
                      <div className="flex items-start gap-4">
                        <div className="mt-1 w-5 h-5 rounded-full border-2 border-solid border-border group-hover:border-accent transition-colors flex items-center justify-center"></div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground text-sm">
                            Review landing page copy
                          </p>
                          <div className="flex gap-2 mt-2">
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md">
                              <span className="text-red-600 dark:text-red-400">
                                HIGH
                              </span>{" "}
                              PRIORITY
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="p-4 bg-card border border-solid border-border rounded-xl group hover:bg-card hover:border-accent hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-4 opacity-60 group-hover:opacity-100">
                          <div className="w-5 h-5 rounded-full border-2 border-solid border-border bg-card"></div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Update financial model v2
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Col 3: Notes */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl shadow-sm border border-solid border-yellow-100 dark:border-yellow-800/30 flex flex-col h-[600px] hover:shadow-sm transition-shadow">
                <div className="p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Edit2 size={16} /> Quick Notes
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Saving...
                  </span>
                </div>
                <div className="p-2 flex gap-1 overflow-x-auto text-muted-foreground px-4">
                  <button className="p-2 hover:bg-card rounded-lg text-muted-foreground">
                    <strong className="font-serif font-black">B</strong>
                  </button>
                  <button className="p-2 hover:bg-card rounded-lg text-muted-foreground">
                    <em className="font-serif italic">I</em>
                  </button>
                  <div className="w-px h-4 bg-solid border-border mx-2 my-auto"></div>
                  <button className="p-2 hover:bg-card rounded-lg text-xs font-bold text-muted-foreground">
                    H1
                  </button>
                  <button className="p-2 hover:bg-card rounded-lg text-xs font-bold text-muted-foreground">
                    H2
                  </button>
                </div>
                <div className="flex-1 p-6">
                  <textarea
                    className="w-full h-full bg-transparent resize-none focus:outline-none text-base leading-relaxed text-muted-foreground placeholder:text-muted-foreground"
                    placeholder="Capture your thoughts..."
                  ></textarea>
                </div>
              </div>

              {/* Col 4: AI Assistant */}
              <div className="bg-card rounded-2xl shadow-sm border border-solid border-border flex flex-col h-[600px] overflow-hidden relative group">
                {/* Avatar Section */}
                <div className="flex-1 relative flex flex-col items-center pt-10">
                  <div className="absolute top-5 left-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-solid border-border shadow-sm">
                      <img
                        src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix"
                        alt="Avatar Icon"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        Aiko
                      </div>
                      <div className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                        <Bot size={10} /> AI Partner
                      </div>
                    </div>
                  </div>

                  {/* Anime Character */}
                  <div className="mt-8 relative w-56 h-72 transition-all duration-700 hover:scale-105">
                    <img
                      src="https://api.dicebear.com/9.x/notionists/svg?seed=Destiny&backgroundColor=transparent"
                      className="w-full h-full object-contain drop-shadow-2xl"
                      alt="AI Companion"
                    />

                    {/* Floating Speech Bubble */}
                    <div className="absolute -right-2 top-4 bg-transparent backdrop-blur-sm p-4 rounded-2xl rounded-bl-none shadow-xl border border-solid border-border max-w-[160px] animate-float">
                      <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                        "Hey! Don't forget to take a break. You've been focusing
                        for 2 hours! 🍵"
                      </p>
                    </div>
                  </div>

                  {/* Context Action */}
                  <div className="w-full px-6 mt-2">
                    <div className="bg-card p-4 rounded-xl border border-solid border-border shadow-lg shadow-brand-100/50 text-xs text-muted-foreground">
                      <strong className="text-primary block mb-2">
                        SUGGESTION
                      </strong>
                      <div className="flex items-center gap-2 text-muted-foreground cursor-pointer hover:text-primary">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        Take a 5 min breathing break
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat Input */}
                <div className="p-4 bg-card backdrop-blur-md">
                  <div className="bg-card rounded-full px-4 py-3 flex items-center gap-3 shadow-sm border border-solid border-border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    <input
                      type="text"
                      placeholder="I feel stuck on this bug..."
                      className="bg-transparent text-sm flex-1 focus:outline-none text-foreground font-medium placeholder:text-muted-foreground"
                    />
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Legend/Tags */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {[
              "Always Available",
              "Emotional Support",
              "Focus Timers",
              "Daily Reviews",
            ].map((tag, i) => (
              <div
                key={i}
                className="bg-muted text-muted-foreground px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide border border-border"
              >
                {tag}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Solution;
