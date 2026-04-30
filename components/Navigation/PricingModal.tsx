"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HYPERCHO_PRICING_URL = "https://hypercho.com/pricing";

const PricingModal = ({ open, onOpenChange }: PricingModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Upgrade to Hyperclaw Cloud
          </DialogTitle>
          <DialogDescription className="text-center">
            You're using the open-source Community Edition. Hyperclaw Cloud adds
            multi-device sync, team workspaces, hosted agents, and priority support.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-2 flex flex-col gap-3"
        >
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Multi-device sync across desktop, web, and mobile</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Hosted AI agents that run when your laptop is closed</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Team workspaces with shared projects and channels</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Priority support and managed updates</span>
            </li>
          </ul>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              asChild
              className="w-full"
            >
              <a
                href={HYPERCHO_PRICING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                See cloud plans
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Keep using Community Edition
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default PricingModal;
