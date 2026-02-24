import { getLayout } from "$/layouts/MainLayout";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import router from "next/router";
import { MultiStepLoader as Loader } from "@/components/ui/multi-step-loader";
import { generateIdeaReport } from "$/services/tools/aurum";
import { useToast } from "@/components/ui/use-toast";
import { handleError } from "$/utils/errorHandler";
import { useAurum } from "$/components/Tool/Aurum/provider/aurumProvider";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { tooltips } from "$/components/Tool/Aurum/type";
import { useUser } from "$/Providers/UserProv";
import EmptyIdeasState from "../components/EmptyIdeasState";
import { IdeasSkeleton } from "../components/IdeasSkeleton";

const placeholders = [
  "A mobile app that helps people find local farmers markets",
  "An AI-powered tool for personalizing workout routines",
  "A subscription service for eco-friendly household products",
  "A platform connecting remote workers with temporary office",
  "An educational app teaching financial literacy to teenagers",
  "A service that turns family recipes into custom cookbooks",
];

const IdeaValidator = () => {
  const [idea, setIdea] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const [id, setId] = useState("");
  const { handleOnClickIdea, appendNewIdeas } = useAurum();
  const { userId } = useUser();

  const loadingStates = [
    { text: "Analyzing your idea" },
    { text: "Asking top experts for their opinion" },
    { text: "Doing market research" },
    { text: "Generating report" },
    { text: "Report generated" },
    { text: "Redirecting to report" },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIdea(e.target.value);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    try {
      const response = await generateIdeaReport({
        idea,
        userId: userId || undefined,
      });
      const result = response.data;

      if (!result.success) {
        console.error("Validation Error:", result.error || result.message);
        toast({
          title: result.error || "Something went wrong",
          description: result.message || "Please try again",
          variant: "destructive",
        });
        return;
      }
      appendNewIdeas({
        _id: result.data._id,
        title: result.data.title,
      });
      setId(result.data._id);
      setSuccess(true);
    } catch (error) {
      handleError(error, "Failed to validate idea");
    }
  };

  return (
    <>
      <Loader
        loadingStates={loadingStates}
        loading={isLoading}
        duration={2000}
        success={success}
        onComplete={() => {
          setIsLoading(false);
          handleOnClickIdea(id);
        }}
      />
      <div className="h-full container mx-auto px-4 py-12 relative z-10 flex flex-col gap-12 justify-between">
        <div>
          <motion.div
            className="text-center mb-12"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl font-semibold mb-4 text-foreground">
              Idea Validator
            </h1>
            <p className="text-base max-w-2xl mx-auto text-muted-foreground font-medium">
              Get an in-depth, customized report highlighting your idea&apos;s
              strengths, weaknesses, market fit, and practical next steps.
            </p>
          </motion.div>

          <PlaceholdersAndVanishInput
            placeholders={placeholders}
            onSubmit={onSubmit}
            onChange={handleChange}
          />
        </div>
      </div>
    </>
  );
};

IdeaValidator.getLayout = getLayout;
export default IdeaValidator;
