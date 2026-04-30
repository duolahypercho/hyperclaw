import React from "react";
import { motion } from "framer-motion";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "$/utils";

interface DesktopOnlyAccessProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
}

const DesktopOnlyAccess: React.FC<DesktopOnlyAccessProps> = ({
  title = "Desktop Access Only",
  description = "This feature is optimized for desktop computers and requires a larger screen for the best experience.",
  showBackButton = true,
  onBackClick,
}) => {
  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      window.history.back();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="border-primary/20 bg-card/80 backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center pb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
            >
              <Monitor className="h-8 w-8 text-primary" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-foreground">
              {title}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-base leading-relaxed">
              {description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Device Icons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center items-center space-x-8"
            >
              <div className="flex flex-col items-center space-y-2">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Monitor className="h-6 w-6 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">Desktop</span>
              </div>
              <div className="flex flex-col items-center space-y-2 opacity-40">
                <div className="p-3 rounded-lg bg-muted/20">
                  <Tablet className="h-6 w-6 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">Tablet</span>
              </div>
              <div className="flex flex-col items-center space-y-2 opacity-40">
                <div className="p-3 rounded-lg bg-muted/20">
                  <Smartphone className="h-6 w-6 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">Mobile</span>
              </div>
            </motion.div>

            {/* Feature List */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-3"
            >
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">
                  Why desktop only?
                </p>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span>
                      Larger screen real estate for complex interfaces
                    </span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span>Enhanced productivity with keyboard shortcuts</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span>Better precision for detailed interactions</span>
                  </li>
                </ul>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex flex-col space-y-3"
            >
              {showBackButton && (
                <Button
                  onClick={handleBackClick}
                  variant="outline"
                  className="w-full"
                >
                  Go Back
                </Button>
              )}
              <Button
                onClick={() => window.open("https://hypercho.com", "_blank")}
                variant="default"
                className="w-full"
              >
                Visit Hypercho
              </Button>
            </motion.div>
          </CardContent>
        </Card>

        {/* Background Animation */}
        <motion.div
          className="absolute inset-0 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default DesktopOnlyAccess;
