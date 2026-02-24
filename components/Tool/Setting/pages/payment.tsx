import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUser } from "$/Providers/UserProv";
import { useToast } from "@/components/ui/use-toast";
import SettingsSkeleton from "$/components/Tool/Setting/pages/skelenton";
import { getBillingPortalUrl } from "$/services/user";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const Payment = () => {
  const { membership, userId } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleManageBilling = async () => {
    if (!membership || !userId) {
      toast({
        title: "Error",
        description: "Unable to access billing portal. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    const customerId = membership.customerId;

    if (!customerId) {
      toast({
        title: "Error",
        description: "Customer ID not found. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { url } = await getBillingPortalUrl({
        customerId: customerId,
      });

      window.location.href = url;
    } catch (error: any) {
      console.error("Error opening billing portal:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to open billing portal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string | Date) => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (!membership) {
    return (
      <SettingsSkeleton
        title="Subscription"
        description="Manage your subscription and billing information."
      />
    );
  }

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | number;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-solid border-t-0 border-l-0 border-r-0 border-border/40 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">Subscription</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage your subscription and billing
      </p>
      <div className="space-y-6">

        {/* Plan Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-card/50 backdrop-blur-sm rounded-2xl border border-solid border-border/50 p-8 mb-8 max-w-2xl mx-auto"
        >
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xl font-semibold text-foreground">
                {membership.package.name}
              </h2>
              {membership.isFreePlan && (
                <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded-md bg-muted/50">
                  Free
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Active subscription</p>
          </div>

          <div className="space-y-0 bg-card/30 rounded-xl border border-solid border-border/30 p-4">
            <InfoRow
              label="Max Tokens"
              value={membership.package.maxToken.toLocaleString()}
            />
            <InfoRow
              label="Daily Generations"
              value={membership.package.generate_response_daily.toLocaleString()}
            />
            <InfoRow
              label="Start Date"
              value={formatDate(membership.startDate)}
            />
            <InfoRow label="End Date" value={formatDate(membership.endDate)} />
          </div>
        </motion.div>

        {/* Billing Section */}
        {!membership.isFreePlan && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-card/50 backdrop-blur-sm rounded-2xl border border-solid border-border/50 p-8 max-w-2xl mx-auto"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Billing
              </h2>
              <p className="text-sm text-muted-foreground">
                Manage your payment methods and invoices
              </p>
            </div>

            <Button
              onClick={handleManageBilling}
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg transition-all duration-200"
              variant="default"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening...
                </>
              ) : (
                "Manage Billing"
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default Payment;
