import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Agents from "$/components/Tool/Agents";
import { AgentsProvider } from "$/components/Tool/Agents/provider/agentsProvider";

const agentsSEOSchema: SEOSchema = {
  title: "Agents - Hyperclaw OS",
  description:
    "List OpenClaw agents and edit agent config files (memory.md, agents.md, soul.md, tools.md, and more) from your workspace.",
  url: "https://www.app.claw.hypercho.com/Tool/Agents",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Agents - Hyperclaw OS",
    description:
      "List OpenClaw agents and edit agent config files from your workspace.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Agents - Hyperclaw OS",
    description:
      "List OpenClaw agents and edit agent config files from your workspace.",
    url: "https://www.app.claw.hypercho.com/Tool/Agents",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Agents",
    description:
      "List agents and edit agent files (memory.md, soul.md, etc.) in OpenClaw workspace",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Agent list from OpenClaw",
      "Agent file browser",
      "Edit memory.md, agents.md, soul.md, tools.md",
      "Save changes to workspace",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.app.claw.hypercho.com/Tool/Agents",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: "https://www.app.claw.hypercho.com/Tool/Agents",
    installUrl: "https://www.app.claw.hypercho.com/Tool/Agents",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "OpenClaw workspace (~/.openclaw)",
    permissions: "Access to OpenClaw CLI and workspace",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={agentsSEOSchema}>
      <AgentsProvider>
        <Agents />
      </AgentsProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
