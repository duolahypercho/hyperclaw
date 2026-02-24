import { Smartphone, List, Battery } from "lucide-react";

const Problem = () => {
  const problems = [
    {
      icon: Smartphone,
      title: "Decision Fatigue",
      description:
        "Traditional task managers overwhelm you with long, guilt-inducing lists. Too many choices lead to paralysis, not action.",
    },
    {
      icon: List,
      title: "Vague Todos",
      description:
        "Tasks like 'Work on project' lack clear finish lines. Without objectives and done criteria, you never know when you're actually done.",
    },
    {
      icon: Battery,
      title: "Friction Kills Flow",
      description:
        "Switching between timers, notes, and music creates setup costs that break your focus. Your tools should adapt to you, not the other way around.",
    },
  ];

  return (
    <section className=" py-20 px-6">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            Why Most Task Managers Fail
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            They create more problems than they solve. Here's what's broken.
          </p>
        </div>

        {/* Three Column Problem Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {problems.map((problem, index) => {
            const IconComponent = problem.icon;
            return (
              <div
                key={index}
                className="bg-card border border-border border-solid rounded-lg p-8 space-y-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <IconComponent className="w-6 h-6 text-primary" />
                  <h3 className="text-2xl font-bold text-foreground">
                    {problem.title}
                  </h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {problem.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Closing Statement */}
        <div className="text-center">
          <p className="text-lg text-foreground max-w-3xl mx-auto leading-relaxed font-medium">
            The problem isn't you. The problem is that traditional productivity
            tools are designed for task management, not execution. They create
            friction, ambiguity, and decision fatigue—exactly what kills
            momentum.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Problem;
