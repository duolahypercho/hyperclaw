import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Memory from "$/components/Tool/Memory";
import { MemoryProvider } from "$/components/Tool/Memory/provider/memoryProvider";
import { SITE_URL } from "../../lib/site-url";

const memorySEOSchema: SEOSchema = {
  title: "Memory Viewer - Hyperclaw OS",
  description:
    "Browse and read memory files from your OpenClaw workspace. Access agent memories, logs, and stored information in one convenient location.",
  url: `${SITE_URL}/Tool/Memory`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Memory Viewer - Hyperclaw OS",
    description:
      "Browse and read memory files from your OpenClaw workspace. Access agent memories, logs, and stored information in one convenient location.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Memory Viewer - Hyperclaw OS",
    description:
      "Browse and read memory files from your OpenClaw workspace. Access agent memories, logs, and stored information in one convenient location.",
    url: `${SITE_URL}/Tool/Memory`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Memory Viewer",
    description:
      "Browse and read memory files from OpenClaw workspace",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Memory File Browser",
      "File Content Viewer",
      "Agent Memory Access",
      "Workspace Navigation",
      "Search Functionality",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/Memory`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: `${SITE_URL}/Tool/Memory`,
    installUrl: `${SITE_URL}/Tool/Memory`,
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage with local caching",
    permissions: "Access to local storage for offline functionality",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={memorySEOSchema}>
      <MemoryProvider>
          <Memory />
      </MemoryProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
