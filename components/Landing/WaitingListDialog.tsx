"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { addToWaitingList } from "$/services/user";

interface WaitingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WaitingListDialog({
  open,
  onOpenChange,
}: WaitingListDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await addToWaitingList({ name, email });

      if (!response.data) {
        throw new Error(response.data.message || "Failed to join waiting list");
      }


      setIsSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        // Reset form after closing
        setTimeout(() => {
          setIsSuccess(false);
          setName("");
          setEmail("");
        }, 300);
      }, 2000);
    } catch (err: any) {
      console.log(err);
      setError(err.response.data.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <DialogTitle className="text-2xl">
                    Join our waiting list
                  </DialogTitle>
                </div>
                <DialogDescription className="text-base">
                  Join the waiting list to get exclusive early access to
                  Copanion's unlimited features. We'll notify you as soon as
                  spots are available.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-foreground"
                  >
                    Full Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Alex Chen"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="alex@startup.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="w-full group"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    "Joining..."
                  ) : (
                    <>
                      Join Waiting List
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By joining, you'll be among the first to access unlimited
                  features when they launch.
                </p>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4"
              >
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </motion.div>
              <DialogTitle className="text-2xl text-center mb-2">
                You're on the list!
              </DialogTitle>
              <DialogDescription className="text-center text-base">
                We'll email you at{" "}
                <span className="font-medium text-foreground">{email}</span>{" "}
                when unlimited access is ready.
              </DialogDescription>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
