export const tooltips = {
  score:
    "Our AI evaluates ideas on a scale of 0-100 based on market potential, feasibility, and innovation.",
  strengths:
    "Key positive aspects of your idea that contribute to its potential success.",
  improvements:
    "Suggested enhancements that could increase your idea's chances of success.",
  challenges:
    "Potential obstacles that might impact implementation or market success.",
  technicalFeasibility:
    "How technically achievable your idea is with current technology and resources. Higher scores indicate greater feasibility.",
  marketPotential:
    "Analysis of your idea's potential market reach and growth opportunities.",
  implementationComplexity:
    "The relative difficulty of bringing your idea to market.",
  resourceRequirements:
    "Key resources needed to successfully implement your idea.",
};

export type TabType = "aurum-home-item" | "aurum-idea-report-item";

export interface IdeaAnalysis {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  description: string;
  feedback: string;
  improvements: string[];
  strengths: string[];
  challenges: {
    roadblocks: string[];
    marketConcerns: {
      overview: string;
      concerns: Array<{
        title: string;
        description: string;
      }>;
    };
    technicalFeasibility: {
      score: number;
      description: string;
    };
  };
  marketPotential: Array<{
    title: string;
    description: string;
  }>;
  implementationComplexity: "Easy" | "Medium" | "Hard";
  status: "recommended" | "needs_enhancement" | "potential" | "not_recommended";
  resourceRequirements: string[];
  score: number;
  recommendations: string[];
}

export interface IdeaReport {
  _id: string;
  title: string;
}
