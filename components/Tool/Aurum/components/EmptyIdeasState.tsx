import React from "react";
import { motion } from "framer-motion";
import { Lightbulb, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyIdeasStateProps {
  title?: string;
  description?: string;
  showActionButton?: boolean;
  actionButtonText?: string;
  onActionClick?: () => void;
  variant?: "home" | "report";
}

const EmptyIdeasState: React.FC<EmptyIdeasStateProps> = ({
  title = "No Ideas Found",
  description = "Start by submitting your first idea to get personalized analysis and insights.",
  showActionButton = true,
  actionButtonText = "Submit Your First Idea",
  onActionClick,
  variant = "home",
}) => {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.2, 0.8, 0.2, 1],
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
    },
  };

  const iconVariants = {
    hidden: { scale: 0, rotate: -180 },
    visible: {
      scale: 1,
      rotate: 0,
      transition: {
        duration: 0.8,
        ease: [0.2, 0.8, 0.2, 1],
        delay: 0.2,
      },
    },
  };

  const floatingVariants = {
    float: {
      y: [-10, 10, -10],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Analysis",
      description: "Get comprehensive insights powered by advanced AI",
    },
    {
      icon: TrendingUp,
      title: "Market Research",
      description: "Understand market potential and competition",
    },
    {
      icon: Users,
      title: "Expert Validation",
      description: "Receive feedback from industry experts",
    },
  ];

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Main Icon */}
      <motion.div
        className="relative mb-8"
        variants={iconVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="relative"
          variants={floatingVariants}
          animate="float"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
            <Lightbulb className="w-12 h-12 text-primary" />
          </div>
          {/* Floating particles */}
          <motion.div
            className="absolute -top-2 -right-2 w-4 h-4 bg-primary/30 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: 0.5,
            }}
          />
          <motion.div
            className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary/40 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: 1,
            }}
          />
        </motion.div>
      </motion.div>

      {/* Title and Description */}
      <motion.div
        className="text-center mb-8 max-w-2xl"
        variants={itemVariants}
      >
        <h2 className="text-3xl font-semibold text-foreground mb-4">{title}</h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      </motion.div>

      {/* Features Grid */}
      {variant === "home" && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 w-full max-w-4xl"
          variants={containerVariants}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="group bg-background/5 backdrop-blur-sm border border-primary/10 rounded-xl p-6 text-center hover:border-primary/20 transition-all duration-300"
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -5 }}
            >
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Action Button */}
      {showActionButton && (
        <motion.div variants={itemVariants}>
          <Button
            onClick={onActionClick}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
            size="lg"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {actionButtonText}
          </Button>
        </motion.div>
      )}

      {/* Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary/20 rounded-full"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: 0,
          }}
        />
        <motion.div
          className="absolute top-1/3 right-1/3 w-1 h-1 bg-primary/30 rounded-full"
          animate={{
            scale: [1, 2, 1],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: 1,
          }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-primary/25 rounded-full"
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            delay: 0.5,
          }}
        />
      </div>
    </motion.div>
  );
};

export default EmptyIdeasState;
