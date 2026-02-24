"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "What exactly is Copanion?",
      answer:
        "Copanion is your digital co-founder. It's an intelligent companion that actively partners with you throughout your startup journey—validating ideas, creating roadmaps, tracking progress, and holding you accountable like a real co-founder would.",
    },
    {
      question: "Do I need business experience to use Copanion?",
      answer:
        "Not at all. Copanion is built for first-time founders and experienced entrepreneurs alike. We guide you through validation, strategy, and execution step-by-step.",
    },
    {
      question: "What if my idea changes or pivots?",
      answer:
        "Perfect! Copanion adapts with you. Update your vision, re-validate assumptions, and adjust your roadmap anytime. Pivoting is part of the journey, and Copanion helps you navigate it.",
    },
    {
      question: "How does the accountability system work?",
      answer:
        "Daily check-ins ask about your progress on key milestones. No judgment, just honest tracking. Copanion learns your patterns and adapts its support level to what you need.",
    },
    {
      question: "Is my business idea and data private?",
      answer:
        "Absolutely. Your ideas, strategies, and business data are encrypted and never shared. We don't sell data or use your confidential information for anything other than helping you build.",
    },
  ];

  return (
    <section className="py-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            Frequently Asked Questions
          </h2>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
              >
                <span className="font-semibold text-foreground text-lg pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5 text-muted-foreground leading-relaxed">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
