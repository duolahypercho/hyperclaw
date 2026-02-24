import { PromptProps } from "../types";

type ReadingLevelType =
  | "Kindergarten"
  | "Elementary School"
  | "Middle School"
  | "Current"
  | "High School"
  | "College"
  | "Graduate School";

/**
 * Generates a prompt configuration for adjusting text to a specific reading level
 * @param {ReadingLevelType} level - The target reading level to adjust the text to with the following options: "Kindergarten", "Elementary School", "Middle School", "High School", "College", "Graduate School"
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory } = readingLevelPrompt("Elementary School");
 * // Returns prompt config for adjusting text to elementary school reading level
 */
const readingLevelPrompt = (level: ReadingLevelType): PromptProps => {
  
  const detailPrompt = () => {
    if (level === "Kindergarten") {
      return `Guidelines for Kindergarten (Ages 5-6):
      • Use very simple words and short sentences
      • Focus on concrete concepts 
      • Avoid complex vocabulary
      • Use repetition when helpful
      • Keep sentences to 5-7 words
      • Use simple sentence structures
      • This will be provided to a Kindergarten student`;
    }
    if (level === "Elementary School") {
      return `Guidelines for Elementary School (Ages 7-11):
      • Use straightforward language
      • Include some compound sentences
      • Introduce basic academic vocabulary 
      • Maintain clear paragraph structure
      • Explain new concepts simply
      • This will be provided to an Elementary School student`;
    }
    if (level === "Middle School") {
      return `Guidelines for Middle School (Ages 12-14):
      • Use moderate vocabulary complexity
      • Include compound and complex sentences
      • Introduce field-specific terminology with context
      • Develop more detailed explanations
      • Include cause and effect relationships
      • This will be provided to a Middle School student`;
    }
    if (level === "High School") {
      return `Guidelines for High School (Ages 14-18):
      • Use advanced vocabulary appropriately
      • Vary sentence structure
      • Include abstract concepts
      • Develop complex arguments
      • Reference broader contexts
      • This will be provided to a High School student`;
    }
    if (level === "College") {
      return `Guidelines for College (Undergraduate):
      • Use sophisticated vocabulary
      • Employ complex sentence structures
      • Include theoretical concepts
      • Develop nuanced arguments
      • Reference academic frameworks
      • This will be provided to a College student`;
    }
    if (level === "Graduate School") {
      return `Guidelines for Graduate School:
      • Use specialized academic vocabulary
      • Create complex analytical content
      • Include theoretical frameworks
      • Develop sophisticated arguments
      • Reference advanced research concepts
      • This will be provided to a Graduate School student`;
    }
    return "";
  };

  const systemPrompt = `You are an expert educator and writer specializing in adapting content for ${level} reading level. Your task is to thoughtfully modify the text inside the <EnhancedText> tag to match the ${level} reading level while preserving the core message and meaning which will be used to help a student learn.

  ${detailPrompt()}

  Always ensure:
  • Maintain the original message and key points
  • Keep the text engaging for the target level
  • Use age-appropriate examples and analogies
  • Maintain logical flow and coherence
  • Preserve essential technical accuracy
  • Simply return the enhanced text without any additional text, comments or <EnhancedText>`;

  const relatedHistory = (level: ReadingLevelType) => {
    if (level === "Kindergarten") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The caterpillar eats lots of leaves and then builds a chrysalis. Inside the chrysalis, it changes into a beautiful butterfly with colorful wings.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Look at the hungry caterpillar! Munch, munch, munch - it eats lots of yummy leaves. Then it makes a cozy blanket called a chrysalis. After a nap, something magical happens! The caterpillar turns into a pretty butterfly! It has beautiful wings with lots of colors. Now it can fly in the sky!",
        },
      ];
    }

    if (level === "Elementary School") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The process of photosynthesis enables plants to convert solar energy into chemical energy, which is stored in glucose molecules. This complex biological process involves chlorophyll, carbon dioxide, and water as key components.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Plants make their own food using sunlight! They take in water from the soil and a gas called carbon dioxide from the air. Special green parts in their leaves called chlorophyll help them turn these things into food. It's like having a tiny kitchen inside each leaf where plants cook their meals using sunlight!",
        },
      ];
    }

    if (level === "Middle School") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The electromagnetic spectrum encompasses all forms of electromagnetic radiation, including visible light, radio waves, microwaves, infrared, ultraviolet, X-rays and gamma rays. These waves differ in their wavelengths and frequencies.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Light and other types of energy travel in waves. These waves make up what we call the electromagnetic spectrum. Think of it like a big family of waves - some we can see (like the colors of the rainbow), and others we can't see but still use every day (like the waves that carry radio music or heat up food in the microwave). Each type of wave has its own special size and speed, which makes it useful for different things.",
        },
      ];
    }

    if (level === "High School") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The principles of supply and demand form the foundation of market economics. When demand increases while supply remains constant, prices typically rise. Conversely, when supply increases while demand remains constant, prices generally fall.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Supply and demand are key concepts that determine prices in the market. When more people want something (higher demand) but there isn't more of it available (same supply), sellers can charge higher prices. Think of it like popular concert tickets - when lots of people want them but there are only a limited number available, prices go up. On the other hand, when there's more of something available (higher supply) but the same number of people want it, sellers usually have to lower prices to sell everything. This happens with things like winter clothes being cheaper in spring.",
        },
      ];
    }

    if (level === "College") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>Cognitive dissonance theory posits that individuals experience psychological discomfort when they hold contradictory beliefs or ideas. This discomfort motivates them to reduce the dissonance by changing their attitudes, beliefs, or behaviors to achieve consistency.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Cognitive dissonance describes the mental tension we experience when our beliefs and actions don't align. For example, someone might believe in environmental conservation but regularly use single-use plastics. This inconsistency creates psychological discomfort, leading them to either modify their behavior (reduce plastic use) or adjust their beliefs (rationalize why their plastic use is acceptable). This psychological mechanism plays a crucial role in how we maintain our self-concept and make decisions.",
        },
      ];
    }

    if (level === "Graduate School") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>Quantum entanglement, a fundamental principle of quantum mechanics, describes a phenomenon where particles become correlated in such a way that the quantum state of each particle cannot be described independently, even when separated by large distances.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "Quantum entanglement represents a cornerstone phenomenon in quantum mechanical theory, wherein two or more particles establish intrinsic correlations that persist regardless of spatial separation. This non-local characteristic challenges classical physics paradigms and has profound implications for quantum information theory. The entangled state manifests as a superposition that cannot be factored into individual particle states, demonstrating what Einstein famously termed 'spooky action at a distance.' This property has significant applications in quantum computing, quantum cryptography, and quantum teleportation protocols.",
        },
      ];
    }

    return [
      {
        id: "2",
        role: "user" as const,
        content: `<EnhancedText>The task list shows all your tasks organized by list. You can drag tasks between lists, mark them as complete, star important tasks, and set due dates. Completed tasks appear at the bottom of each list.</EnhancedText>`,
      },
      {
        id: "3",
        role: "assistant" as const,
        content:
          "The task list helps you organize your tasks into different groups. You can move tasks around by dragging them, check them off when done, mark important ones with a star, and add due dates. When you finish a task, it moves to the bottom of the list with other completed tasks.",
      },
    ];
  };

  return { systemPrompt, relatedHistory: relatedHistory(level) };
};

export default readingLevelPrompt;
