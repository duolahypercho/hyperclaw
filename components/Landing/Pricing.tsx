"use client";

import { Button } from "@/components/ui/button";
import { Check, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PackageTypes } from "$/services/package";
import { getCachedPackage } from "$/lib/package-cache";

const Pricing = () => {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageTypes[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        setIsLoading(true);
        const packages = await getCachedPackage();
        setPackages(packages);
      } catch (error) {
        console.error("Error fetching packages:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPackages();
  }, []);

  // Transform packages data into plans format
  type PlanType = {
    _id: string;
    name: string;
    price: string;
    period: string;
    hint: string;
    features: string[];
    cta: string;
    note: string;
    highlighted: boolean;
    badge?: string;
    icon: typeof Users | typeof Sparkles;
    onClick: () => void;
  };

  const transformPackagesToPlans = (): PlanType[] => {
    if (packages.length === 0) return [];

    const freePlan = packages.find((pkg) => pkg.price === 0);
    const paidPlans = packages.filter((pkg) => pkg.price > 0);

    const plans: PlanType[] = [];

    // Add free plan if exists
    if (freePlan) {
      plans.push({
        _id: freePlan._id,
        name: freePlan.name,
        price: "0.00",
        period: "",
        hint: freePlan.description || "Everything you need to get started.",
        features: freePlan.features || [],
        cta: "Get Started For Free",
        note: "No credit card needed",
        highlighted: false,
        icon: Users,
        onClick: () => {
          router.push("/auth/Signup");
        },
      });
    }

    // Add paid plans
    paidPlans.forEach((pkg) => {
      plans.push({
        _id: pkg._id,
        name: pkg.name,
        price: `$${pkg.price.toFixed(2)}`,
        period: "/month",
        hint: pkg.description || "Unlock unlimited potential.",
        features: pkg.features || [],
        cta: "Get Started",
        note: "No credit card needed",
        highlighted: true,
        badge: "Popular",
        icon: Sparkles,
        onClick: () => {
          router.push("/auth/Signup");
        },
      });
    });

    return plans;
  };

  const plans = transformPackagesToPlans();

  return (
    <section className="py-20 px-6 bg-card">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            Pricing
          </h2>
        </div>

        {/* Pricing Cards */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <p className="text-muted-foreground">Loading plans...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <p className="text-muted-foreground">No plans available</p>
          </div>
        ) : (
          <div
            className={`grid gap-6 max-w-5xl mx-auto mb-8 items-stretch ${plans.length === 1 ? "md:grid-cols-1" : "md:grid-cols-2"
              }`}
          >
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`rounded-lg p-6 flex flex-col ${plan.highlighted
                  ? "bg-primary/5 border-2 border-primary shadow-xl"
                  : "bg-card border border-border"
                  }`}
              >
                {/* Plan Header */}
                <div className="text-center space-y-1.5">
                  <div className="flex items-center justify-center gap-2">
                    <h3 className="text-xl font-semibold text-foreground">
                      {plan.name}
                    </h3>
                    {plan.badge && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-accent text-accent-foreground rounded-full border border-accent/30">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-semibold text-foreground">
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-lg text-muted-foreground">
                          {plan.period}
                        </span>
                      )}
                    </div>
                    {plan.hint && (
                      <p className="text-xs text-muted-foreground">
                        {plan.hint}
                      </p>
                    )}
                    {(plan as any).altPrice && (
                      <p className="text-xs text-muted-foreground">
                        {(plan as any).altPrice}
                      </p>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <div className="flex-1 space-y-2 py-4">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground font-medium">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-auto space-y-2">
                  <Button
                    className="w-full group"
                    size="default"
                    variant={plan.highlighted ? "default" : "outline"}
                    onClick={plan.onClick}
                  >
                    {plan.icon && <plan.icon className="w-4 h-4 mr-2" />}
                    {plan.cta}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    {plan.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Pricing;
