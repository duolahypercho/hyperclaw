import React from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  HelpCircle,
  Info,
  ThumbsDown,
  ThumbsUp,
  Users,
  Zap,
} from "lucide-react";
import HyperchoTooltips from "$/components/UI/HyperchoTooltip";
import { cn } from "$/utils";
import { useRouter } from "next/navigation";
import { tooltips, IdeaAnalysis } from "$/components/Tool/Aurum/type";
import { useIdea } from "../provider/ideaProvider";

interface CompletedReportProps {
  ideaData: IdeaAnalysis;
}

const CompletedReport = ({ ideaData }: CompletedReportProps) => {
  const router = useRouter();

  return (
    <>
      {/* Header Card */}
      <Card className="w-full g-background/5 backdrop-blur-sm border-primary/20 overflow-hidden shadow-lg">
        <div className="h-2 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-400 dark:from-[#b8d4fb] dark:via-[#a5c4f9] dark:to-[#8fb4f8]"></div>
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <CardTitle className="text-xl text-foreground">
                {ideaData.title}
              </CardTitle>
              <CardDescription className="flex items-center mt-2 text-muted-foreground text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                Submitted on {new Date(ideaData.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge
                className={`px-3 py-1 ${
                  ideaData.status === "recommended"
                    ? "bg-green-500/50 hover:bg-green-500/60 text-foreground"
                    : ideaData.status === "needs_enhancement"
                    ? "bg-yellow-500/50 hover:bg-yellow-500/60 text-foreground"
                    : ideaData.status === "potential"
                    ? "bg-blue-500/50 hover:bg-blue-500/60 text-foreground"
                    : ideaData.status === "not_recommended"
                    ? "bg-red-500/50 hover:bg-red-500/60 text-foreground"
                    : "bg-gray-500/50 hover:bg-gray-500/60 text-foreground"
                }`}
              >
                {ideaData.status === "recommended"
                  ? "Recommended"
                  : ideaData.status === "needs_enhancement"
                  ? "Needs Enhancement"
                  : ideaData.status === "potential"
                  ? "Potential"
                  : ideaData.status === "not_recommended"
                  ? "Not Recommended"
                  : "Under Evaluation"}
              </Badge>

              {/* Dynamic Score Display with Tooltip */}
              <div className="flex items-center gap-2">
                <HyperchoTooltips value={tooltips.score}>
                  <div
                    className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-help border border-primary/10 border-solid
                      ${
                        ideaData.score >= 80
                          ? "bg-green-500/20 text-green-700 dark:bg-green-400/20 dark:text-green-300"
                          : ideaData.score >= 60
                          ? "bg-blue-500/20 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300"
                          : ideaData.score >= 40
                          ? "bg-yellow-400/20 text-yellow-700 dark:bg-yellow-300/20 dark:text-yellow-200"
                          : "bg-red-500/20 text-red-700 dark:bg-red-400/20 dark:text-red-300"
                      }`}
                  >
                    <span className="font-medium text-xs">
                      {ideaData.score}/100
                    </span>
                  </div>
                </HyperchoTooltips>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-6 text-muted-foreground">
            {ideaData.description}
          </p>

          <div className="p-4 border border-solid border-primary/5 rounded-lg mb-6 bg-background">
            <h3 className="font-semibold text-sm mb-2 text-foreground">
              Expert Feedback
            </h3>
            <p className="text-sm text-foreground">{ideaData.feedback}</p>
          </div>
        </CardContent>
      </Card>

      {/* Strengths and Improvements */}
      <div className="grid md:grid-cols-2 gap-6 w-full">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <Card className="h-full bg-background backdrop-blur-sm border-primary/20 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Zap className="h-4 w-4 text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400" />
                Strengths
                <HyperchoTooltips value={tooltips.strengths}>
                  <Info className="h-3.5 w-3.5 text-foreground cursor-help" />
                </HyperchoTooltips>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {ideaData.strengths.map((strength, index) => (
                  <li
                    key={"strength-" + index}
                    className="flex items-start gap-2"
                  >
                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 flex items-center justify-center text-xs ">
                      +
                    </span>
                    <span className="text-sm text-foreground">{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <Card className="h-full bg-background backdrop-blur-sm border-primary/20 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <ArrowLeft className="h-4 w-4 text-yellow-600 dark:text-yellow-300 rotate-45" />
                Suggested Improvements
                <HyperchoTooltips value={tooltips.improvements}>
                  <Info className="h-3.5 w-3.5 text-foreground cursor-help" />
                </HyperchoTooltips>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {ideaData.improvements.map((improvement, index) => (
                  <li
                    key={"improvement-" + index}
                    className="flex items-start gap-2"
                  >
                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-yellow-100 dark:bg-yellow-400/20 text-yellow-600 dark:text-yellow-300 flex items-center justify-center text-xs">
                      →
                    </span>
                    <span className="text-sm text-foreground">
                      {improvement}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Challenges & Risks Section - Now using data from the template */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.35 }}
      >
        <Card className="h-full w-full bg-amber-50/50 dark:bg-white/5 backdrop-blur-sm border-blue-200/20 dark:border-[#b8d4fb]/20 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <ThumbsDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Challenges & Risks
              <HyperchoTooltips value={tooltips.challenges}>
                <Info className="h-3.5 w-3.5 text-foreground cursor-help" />
              </HyperchoTooltips>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-amber-600 dark:text-amber-400 mb-2">
                  Potential Roadblocks
                </h3>
                <ul className="space-y-2">
                  {ideaData.challenges.roadblocks.map((roadblock, index) => (
                    <li
                      key={"potential-roadblock-" + index}
                      className="flex items-start gap-2"
                    >
                      <span className="flex-shrink-0 h-5 w-5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center text-xs ">
                        !
                      </span>
                      <span className="text-sm text-foreground">
                        {roadblock}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-sm text-amber-600 dark:text-amber-400 mb-2">
                  Market Concerns
                </h3>
                <p className="text-sm text-foreground mb-3">
                  {ideaData.challenges.marketConcerns.overview}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {ideaData.challenges.marketConcerns.concerns.map(
                    (concern, index) => (
                      <div
                        key={"market-concern-" + index}
                        className="p-3 border border-red-200 dark:border-red-500/20 rounded-lg bg-amber-100/50 dark:bg-amber-500/5"
                      >
                        <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
                          {concern.title}
                        </h4>
                        <p className="text-xs text-foreground">
                          {concern.description}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-sm text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                  Technical Feasibility
                  <HyperchoTooltips value={tooltips.technicalFeasibility}>
                    <HelpCircle className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/70 cursor-help" />
                  </HyperchoTooltips>
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className={cn(
                        "h-2.5 rounded-full transition-all duration-500",
                        ideaData.challenges.technicalFeasibility.score < 30
                          ? "bg-red-500"
                          : ideaData.challenges.technicalFeasibility.score < 60
                          ? "bg-amber-500"
                          : "bg-green-500"
                      )}
                      style={{
                        width: `${ideaData.challenges.technicalFeasibility.score}%`,
                      }}
                    ></div>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      ideaData.challenges.technicalFeasibility.score < 30
                        ? "text-red-600 dark:text-red-400"
                        : ideaData.challenges.technicalFeasibility.score < 60
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-green-600 dark:text-green-400"
                    )}
                  >
                    {ideaData.challenges.technicalFeasibility.score}%
                  </span>
                </div>
                <p className="text-sm text-foreground">
                  {ideaData.challenges.technicalFeasibility.description}
                </p>

                {/* Add a dynamic status indicator */}
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      ideaData.challenges.technicalFeasibility.score < 30
                        ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                        : ideaData.challenges.technicalFeasibility.score < 60
                        ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400"
                    )}
                  >
                    {ideaData.challenges.technicalFeasibility.score < 30
                      ? "High Difficulty"
                      : ideaData.challenges.technicalFeasibility.score < 60
                      ? "Moderate Difficulty"
                      : "Technically Feasible"}
                  </span>
                  {ideaData.challenges.technicalFeasibility.score < 30 && (
                    <span className="text-xs text-red-600 dark:text-red-400">
                      Requires significant technical expertise
                    </span>
                  )}
                  {ideaData.challenges.technicalFeasibility.score >= 30 &&
                    ideaData.challenges.technicalFeasibility.score < 60 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        May require specialized skills
                      </span>
                    )}
                  {ideaData.challenges.technicalFeasibility.score >= 60 && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Achievable with standard development practices
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Market Potential */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <Card className="h-full w-full bg-blue-50/50 dark:bg-white/5 backdrop-blur-sm border-blue-200/20 dark:border-[#b8d4fb]/20 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400 fill-blue-600 dark:fill-blue-400" />
              Market Potential
              <HyperchoTooltips value={tooltips.marketPotential}>
                <Info className="h-3.5 w-3.5 text-foreground cursor-help" />
              </HyperchoTooltips>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {ideaData.marketPotential.map((potential, index) => (
                <div key={"market-potential-" + index}>
                  <h3 className="font-medium text-sm text-blue-700 dark:text-primary mb-2">
                    {potential.title}
                  </h3>
                  <p className="text-sm text-foreground">
                    {potential.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Implementation Details */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <Card className="h-full w-full bg-purple-50/50 dark:bg-white/5 backdrop-blur-sm border-purple-200/20 dark:border-[#b8d4fb]/20 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400 fill-purple-600 dark:fill-purple-400" />
              Implementation Considerations
              <HyperchoTooltips value={tooltips.implementationComplexity}>
                <Info className="h-3.5 w-3.5 text-foreground cursor-help" />
              </HyperchoTooltips>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Badge
                  className="bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-500/30 text-foreground cursor-help"
                  title={`${ideaData.implementationComplexity} complexity indicates the relative difficulty of bringing this idea to market.`}
                >
                  {ideaData.implementationComplexity} Complexity
                </Badge>
              </div>

              <div>
                <h3 className="font-medium text-sm text-purple-700 dark:text-primary mb-2 flex items-center gap-2">
                  Resource Requirements
                  <HyperchoTooltips value={tooltips.resourceRequirements}>
                    <HelpCircle className="h-3.5 w-3.5 text-foreground cursor-help" />
                  </HyperchoTooltips>
                </h3>
                <ul className="grid md:grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                  {ideaData.resourceRequirements.map((resource, index) => (
                    <li
                      key={"resource-requirement-" + index}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="h-2 w-2 rounded-full bg-purple-300 dark:bg-primary/50"></span>
                      {resource}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default CompletedReport;
