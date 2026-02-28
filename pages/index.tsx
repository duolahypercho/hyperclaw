import { GetServerSideProps } from "next";
import { getLayout } from "$/layouts/AuthLayout";
import SEO from "$/components/SEO";
import Hero from "$/components/Landing/Hero";
import SocialProof from "$/components/Landing/SocialProof";
import Solution from "$/components/Landing/Solution";
import Features from "$/components/Landing/Features";
import Pricing from "$/components/Landing/Pricing";
import FinalCTA from "$/components/Landing/FinalCTA";
import Footer from "$/components/Landing/Footer";

const Index = () => {
  return (
    <>
      <SEO
        title="Copanion - Build alone. Finish together."
        description="Copanion is where solo achievers and their AI partners turn vague ideas into missions, block out noise, and conquer the grind. Now building, studying, or working by yourself feels like shipping with a world-class team."
        url="https://app.claw.hypercho.com/"
        image="https://app.claw.hypercho.com/copanion_X_1.png"
        author="Hypercho"
        keywords="Copanion, productivity app, task completion, focus app, procrastination solution, AI accountability, work sessions, finish tasks, productivity tool, remote work, study app, time management, focus timer, solo achievement, AI partner, mission control, block out noise, conquer the grind"
        type="software"
        siteName="Copanion"
        twitterHandle="@hypercho"
        additionalMeta={[
          {
            name: "msapplication-tooltip",
            content:
              "Copanion is where solo achievers and their AI partners turn vague ideas into missions, block out noise, and conquer the grind. Now building, studying, or working by yourself feels like shipping with a world-class team.",
          },
          {
            name: "apple-itunes-app",
            content: "app-argument=https://app.claw.hypercho.com/",
          },
          { name: "theme-color", content: "#BFD7FF" },
          { name: "msapplication-TileColor", content: "#BFD7FF" },
        ]}
        additionalStructuredData={{
          "@type": "SoftwareApplication",
          name: "Copanion",
          description:
            "AI-powered accountability partner that actively checks on you to help you finish what you start. Proactive check-ins, session commitment, and visual presence.",
          applicationCategory: "ProductivityApplication",
          operatingSystem: "Web Browser",
          softwareVersion: "1.0",
          releaseNotes:
            "Launch your accountability partner that won't let you quit mid-task",
          screenshot: "https://app.claw.hypercho.com/copanion_X_1.png",
          featureList: [
            "Proactive Check-ins",
            "Session Commitment",
            "Visual Presence",
            "Context-Aware Notifications",
            "Adaptive Intensity",
            "Progress Tracking",
            "Quit Protection",
            "AI-Powered Responses",
            "Focus Timer",
            "Streak System",
          ],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: "https://app.claw.hypercho.com/",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            ratingCount: "4200",
            bestRating: "5",
            worstRating: "1",
          },
          creator: {
            "@type": "Organization",
            name: "Hypercho",
            url: "https://hypercho.com",
          },
          applicationSubCategory: "ProductivityApplication",
          downloadUrl: "https://app.claw.hypercho.com/",
          installUrl: "https://app.claw.hypercho.com/",
          softwareRequirements: "Web Browser with JavaScript enabled",
          memoryRequirements: "Minimum 2GB RAM recommended",
          storageRequirements: "No local storage required - cloud-based",
          permissions: "Access to local storage for user preferences and data",
          browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
        }}
      />
      <>
        {/* Landing Page Content */}
        <Hero />
        <SocialProof />
        <Solution />
        <Features />
        {/* <Testimonials /> */}
        <FinalCTA />
        <Pricing />
        <Footer />
      </>
    </>
  );
};

Index.getLayout = getLayout;

// Use getServerSideProps to ensure meta tags are rendered on each request
// This is critical for Twitter and other crawlers to see the meta tags
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};

export default Index;
