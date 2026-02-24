"use client";
import React from "react";
import { usePromptLibrary } from "../../provider/PromptProv";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, Sparkles } from "lucide-react";

// Component to show when no prompt is selected
const NoPromptSelected = () => {
  const { handleTabChange } = usePromptLibrary();

  return (
    <div className="h-full flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <Card className="p-8 border-dashed border-2 border-muted-foreground/20">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Library className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold text-foreground">
              No Prompt Selected
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Select a prompt from the library to start optimizing it with
              AI-powered strategies.
            </p>
            <Button
              onClick={() => handleTabChange("explore")}
              className="w-full"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Browse Prompt Library
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default NoPromptSelected;