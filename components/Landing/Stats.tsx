"use client";

import { motion } from "framer-motion";

interface StatItem {
  value: string;
  label: string;
}

const Stats = () => {
  const stats: StatItem[] = [
    { value: "3,400+", label: "Ideas Validated" },
    { value: "1,000+", label: "Solo Founders" },
    { value: "100+", label: "Businesses Launched" },
    { value: "70%", label: "Still Building After 3 Months" },
  ];

  return (
    <section className="py-20 px-6">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-8">
          {/* Main Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl font-medium text-foreground"
          >
            Empowering Solo Founders Worldwide
          </motion.h2>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mt-12">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2">
                  {stat.value}
                </div>
                <div className="text-sm md:text-base text-muted-foreground">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Stats;

