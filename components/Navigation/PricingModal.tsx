"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Sparkles } from "lucide-react";
import { useUser } from "$/Providers/UserProv";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import { getPackage, PackageTypes } from "$/services/package";

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PricingModal = ({ open, onOpenChange }: PricingModalProps) => {
  const { userInfo, userId } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">(
    "month"
  );
  const [packages, setPackages] = useState<PackageTypes[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(true);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        setIsLoadingPackages(true);
        const packagesResponse = await getPackage();
        if (packagesResponse.data?.data) {
          setPackages(packagesResponse.data.data);
        }
      } catch (error) {
        console.error("Error fetching packages:", error);
      } finally {
        setIsLoadingPackages(false);
      }
    };
    if (open) {
      fetchPackages();
    }
  }, [open]);

  // Transform packages data into plans format
  type PlanType = {
    _id: string;
    name: string;
    price: string | number;
    period: string;
    hint: string;
    features: string[];
    highlighted: boolean;
    badge?: string;
    generate_response_daily?: number;
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
        price: "$0.00",
        period: "",
        hint: freePlan.description || "Everything you need to get started.",
        features: freePlan.features || [],
        highlighted: false,
      });
    }

    // Add paid plans
    paidPlans.forEach((pkg) => {
      plans.push({
        _id: pkg._id,
        name: pkg.name,
        price: selectedInterval === "month" ? pkg.price : pkg.price * 12 * 0.8341, // 15% discount for annual
        period: selectedInterval === "month" ? "/month" : "/year",
        hint: pkg.description || "Unlock unlimited potential.",
        features: pkg.features || [],
        highlighted: true,
        badge: "Popular",
        generate_response_daily: pkg.generate_response_daily,
      });
    });

    return plans;
  };

  const plans = transformPackagesToPlans();

  const handleUpgrade = async (planId: string, planName: string) => {
    if (!userId || !userInfo.email) {
      toast({
        title: "Error",
        description: "User information not available. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    toast({
      title: "Redirecting to Stripe",
      description: "Please wait while we redirect you to checkout.",
    });

    try {
      const response = await fetch("/api/stripe/customCheckout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId,
          email: userInfo.email,
          product: planId,
          interval: selectedInterval,
          customerId: "", // Will be created if doesn't exist
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const data = await response.json();

      // Redirect to checkout URL
      if (data.url) {
        window.location.href = data.url;
      } else if (data.sessionId) {
        // If only sessionId is returned, construct the checkout URL
        // This is a fallback - ideally the API should return the URL
        window.location.href = `https://checkout.stripe.com/c/pay/${data.sessionId}`;
      } else {
        throw new Error("No checkout URL or session ID received");
      }
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      toast({
        title: "Error",
        description:
          error.message ||
          "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 w-full h-full max-w-none max-h-none m-0 rounded-none bg-background/95 backdrop-blur-sm overflow-y-auto p-0 top-0 left-0 translate-x-0 translate-y-0">
        {/* Content Container */}
        <div className="container mx-auto max-w-6xl px-6 py-12 md:py-16">
          <DialogHeader className="mb-8">
            <DialogTitle className="text-4xl md:text-5xl font-semibold text-center">
              Choose Your Plan
            </DialogTitle>
            <DialogDescription className="text-center text-lg mt-2">
              Select the plan that best fits your needs
            </DialogDescription>
          </DialogHeader>

          {/* Interval Tabs */}
          <div className="flex justify-center mb-8">
            <Tabs
              value={selectedInterval}
              onValueChange={(value) =>
                setSelectedInterval(value as "month" | "year")
              }
              className="w-full max-w-md"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="month">Monthly</TabsTrigger>
                <TabsTrigger value="year">Annual</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Pricing Cards */}
          {isLoadingPackages ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-muted-foreground">Loading plans...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-muted-foreground">No plans available</p>
            </div>
          ) : (
            <div
              className={`grid gap-6 max-w-5xl mx-auto ${plans.length === 1 ? "md:grid-cols-1" : "md:grid-cols-2"
                }`}
            >
              {plans.map((plan, index) => {
                const isFree = plan.price === "$0.00" || plan.price === "Free";
                const isPaid = !isFree;

                return (
                  <motion.div
                    key={plan._id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className={`rounded-lg max-w-md mx-auto p-6 flex flex-col relative ${plan.highlighted
                      ? "bg-primary border-1 border-solid border-primary shadow-xl"
                      : "bg-card border border-border"
                      }`}
                  >
                    {plan.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-2 py-0.5 text-xs font-semibold bg-card text-foreground rounded-full border border-solid border-primary/30">
                          {plan.badge}
                        </span>
                      </div>
                    )}

                    <div className="text-center space-y-1.5 mb-4">
                      <div className="flex items-center justify-center gap-2">
                        <h3 className={`text-xl font-semibold ${plan.highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                          {plan.name}
                        </h3>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className={`text-4xl font-semibold ${plan.highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                            {isFree
                              ? plan.price
                              : `$${typeof plan.price === "number"
                                ? plan.price.toFixed(2)
                                : plan.price
                              }`}
                          </span>
                          {plan.period && (
                            <span className={`text-lg ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                              {plan.period}
                            </span>
                          )}
                        </div>
                        {plan.hint && (
                          <p className={`text-xs ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            {plan.hint}
                          </p>
                        )}
                        {selectedInterval === "year" && isPaid && (
                          <p className={`text-xs font-medium ${plan.highlighted ? "text-primary-foreground" : "text-primary"}`}>
                            Save 15% with annual billing
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 space-y-2 mb-4">
                      {plan.features && plan.features.length > 0 ? (
                        plan.features.map((feature, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlighted ? "text-primary-foreground" : "text-primary"}`} />
                            <span className={`text-sm font-medium ${plan.highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                              {feature}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className={`text-xs text-center ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          No features listed
                        </p>
                      )}
                    </div>

                    <Button
                      className="w-full"
                      variant={isFree ? "outline" : "accent"}
                      onClick={
                        isFree
                          ? () => onOpenChange(false)
                          : () => handleUpgrade(plan._id, plan.name)
                      }
                      disabled={isLoading && !isFree}
                      size="default"
                    >
                      {isFree
                        ? "Current Plan"
                        : isLoading
                          ? "Processing..."
                          : `Upgrade to ${plan.name}`}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PricingModal;
