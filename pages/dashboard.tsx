import { getLayout } from "$/layouts/MainLayout";
import Home from "$/components/Home";
import SEO from "$/components/SEO";
import { useUser } from "$/Providers/UserProv";
import Loading from "$/components/Loading";

const Index = () => {
  const { status } = useUser();

  if (status !== "authenticated") {
    return <Loading text="Loading Hyperclaw..." />;
  }

  return (
    <>
      <SEO
        title="Hyperclaw OS - Your AI-Powered Workspace"
        description="Launch into your personal AI-first operating system. Access Todo List, Music Player, AI Chat, and productivity tools in one seamless interface. Start your intelligent workflow with Hyperclaw OS."
        url="https://www.app.claw.hypercho.com/"
        image="https://hypercho.com/hypercho_banner.png"
        author="Hypercho"
        keywords="Hyperclaw OS, AI workspace, productivity app, todo list, AI chat, productivity tools, Hypercho, interactive OS, smart workspace, AI assistant, task management"
        type="software"
        siteName="Hypercho Hyperclaw"
        twitterHandle="@hypercho"
        additionalMeta={[
          { name: "application-name", content: "Hyperclaw OS" },
          { name: "apple-mobile-web-app-title", content: "Hyperclaw" },
          {
            name: "msapplication-tooltip",
            content: "Launch your AI-powered productivity workspace",
          },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:image:type", content: "image/png" },
          {
            name: "apple-itunes-app",
            content: "app-argument=https://www.app.claw.hypercho.com/",
          },
        ]}
        additionalStructuredData={{
          "@type": "SoftwareApplication",
          name: "Hyperclaw OS",
          description:
            "AI-powered productivity workspace with integrated tools and applications",
          applicationCategory: "ProductivityApplication",
          operatingSystem: "Web Browser",
          softwareVersion: "1.0",
          releaseNotes:
            "Launch your personal AI workspace with integrated productivity tools",
          screenshot: "https://hypercho.com/hypercho_banner.png",
          featureList: [
            "Todo List & Task Management",
            "AI Chat Assistant (Hyperclaw)",
            "Prompt Library & Templates",
            "Settings & Customization",
            "Real-time Collaboration",
            "Cross-device Synchronization",
          ],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: "https://www.app.claw.hypercho.com/",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            ratingCount: "150",
            bestRating: "5",
            worstRating: "1",
          },
          creator: {
            "@type": "Organization",
            name: "Hypercho",
            url: "https://hypercho.com",
          },
          applicationSubCategory: "OfficeApplication",
          downloadUrl: "https://www.app.claw.hypercho.com/",
          installUrl: "https://www.app.claw.hypercho.com/",
          softwareRequirements: "Web Browser with JavaScript enabled",
          memoryRequirements: "Minimum 2GB RAM recommended",
          storageRequirements: "No local storage required - cloud-based",
          permissions: "Access to local storage for user preferences and data",
          browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
        }}
      />
      <Home />
    </>
  );
};
Index.getLayout = getLayout;
export default Index;
