"use client";

import { motion } from "framer-motion";
import { IconType } from "react-icons";
import { SiProducthunt, SiTechcrunch, SiYcombinator } from "react-icons/si";
import { FaRocket, FaCode, FaUsers } from "react-icons/fa";

interface SocialProofItem {
  name: string;
  icon: IconType;
}

const SocialProof = () => {
  const socialProofs: SocialProofItem[] = [
    { name: "Product Hunt", icon: SiProducthunt },
    { name: "Indie Hackers", icon: FaCode },
    { name: "TechCrunch", icon: SiTechcrunch },
    { name: "Hacker News", icon: SiYcombinator },
    { name: "Y Combinator", icon: SiYcombinator },
    { name: "Launching Next", icon: FaRocket },
    { name: "Tech Community", icon: FaUsers },
  ];

  // Duplicate the array for seamless infinite loop
  const duplicatedProofs = [...socialProofs, ...socialProofs];

  return (
    <section className="py-12 px-6 border-y border-border overflow-hidden bg-card">
      <div className="container mx-auto max-w-7xl">
        <div className="space-y-8">
          {/* Featured In - Auto-scrolling */}
          <div className="flex flex-col items-center gap-6">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Featured in:
            </span>
            <div className="w-full overflow-hidden relative">
              <motion.div
                className="flex items-center gap-12 will-change-transform"
                initial={{ x: 0 }}
                animate={{
                  x: -(socialProofs.length * 250), // Approximate width of first set (7 items * ~250px each)
                }}
                transition={{
                  x: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 50,
                    ease: "linear",
                  },
                }}
              >
                {duplicatedProofs.map((proof, index) => {
                  const Icon = proof.icon;
                  return (
                    <div
                      key={`${proof.name}-${index}`}
                      className="flex items-center gap-3 text-2xl font-bold text-muted-foreground opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap flex-shrink-0 px-4"
                    >
                      <Icon className="w-6 h-6" />
                      <span>{proof.name}</span>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
