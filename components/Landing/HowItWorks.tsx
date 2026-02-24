import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      number: 1,
      title: "Share Your Vision",
      description: '"I want to build a SaaS tool for freelance designers"',
      visual: "Idea validation interface",
    },
    {
      number: 2,
      title: "Get Strategic Analysis",
      description: "Copanion analyzes market fit, competition, and validates your core assumptions. Identifies potential risks and opportunities you might have missed.",
      visual: "Business intelligence dashboard",
    },
    {
      number: 3,
      title: "Build Your Roadmap",
      description: 'Personalized milestones: Customer interviews → MVP → Beta launch',
      options: ["Week 1-2", "Week 3-4", "Week 5-8"],
      visual: "Strategic roadmap view",
    },
    {
      number: 4,
      title: "Daily Accountability",
      description: '"Did you talk to 3 potential customers today? What did you learn?"',
      visual: "Check-in conversation",
    },
    {
      number: 5,
      title: "Ship & Iterate",
      description: '"MVP is live! Time to analyze user feedback and plan v2"',
      extra: "Track progress. Celebrate wins. Keep building.",
      visual: "Progress dashboard",
    },
  ];

  return (
    <section className=" py-20 px-6">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground">
            From Idea to Launch
          </h2>
        </div>

        {/* Steps Flow */}
        <div className="space-y-8">
          {steps.map((step, index) => (
            <div key={index}>
              <div className="bg-card border border-border rounded-lg p-8 space-y-4">
                {/* Step Header */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg flex-shrink-0">
                    {step.number}
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">
                    Step {step.number}: {step.title}
                  </h3>
                </div>

                {/* Step Content */}
                <div className="pl-16 space-y-4">
                  <p className="text-lg text-foreground italic">
                    {step.description}
                  </p>

                  {step.options && (
                    <div className="flex flex-wrap gap-2">
                      {step.options.map((option, i) => (
                        <span
                          key={i}
                          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium"
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  )}

                  {step.extra && (
                    <p className="text-muted-foreground">{step.extra}</p>
                  )}

                  {/* Visual Placeholder */}
                  <div className="bg-muted rounded-md p-6 text-center text-sm text-muted-foreground border border-border">
                    Screenshot: {step.visual}
                  </div>
                </div>
              </div>

              {/* Arrow between steps */}
              {index < steps.length - 1 && (
                <div className="flex justify-center py-4">
                  <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Button size="lg" className="text-lg px-8">
            Try It Free
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
