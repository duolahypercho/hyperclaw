import React, { lazy } from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Statistics from "$/components/Tool/Statistics";
import { StatisticsProvider } from "$/components/Tool/Statistics/provider/statisticsProvider";

const statisticsSEOSchema: SEOSchema = {
  title: "Statistics - Copanion OS",
  description:
    "View your activity and contribution statistics. Track your productivity, contributions, and engagement over time with detailed analytics and visualizations.",
  url: "https://www.copanion.hypercho.com/Tool/Statistics",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Statistics - Copanion OS",
    description:
      "View your activity and contribution statistics. Track your productivity, contributions, and engagement over time with detailed analytics and visualizations.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Statistics - Copanion OS",
    description:
      "View your activity and contribution statistics. Track your productivity, contributions, and engagement over time with detailed analytics and visualizations.",
    url: "https://www.copanion.hypercho.com/Tool/Statistics",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Statistics",
    description:
      "Activity and contribution statistics with detailed analytics and visualizations",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Activity Heatmap",
      "Contribution Tracking",
      "Productivity Analytics",
      "Time-based Visualizations",
      "Engagement Metrics",
      "Historical Data",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.copanion.hypercho.com/Tool/Statistics",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "AnalyticsApplication",
    downloadUrl: "https://www.copanion.hypercho.com/Tool/Statistics",
    installUrl: "https://www.copanion.hypercho.com/Tool/Statistics",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage with local caching",
    permissions: "Access to local storage for offline functionality",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={statisticsSEOSchema}>
      <StatisticsProvider>
        <Statistics />
      </StatisticsProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
