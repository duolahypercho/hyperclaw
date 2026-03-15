import React, { lazy } from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import TodoList from "$/components/Tool/TodoList";
import { TodoListProvider } from "$/components/Tool/TodoList/provider/todolistProvider";
import { SITE_URL } from "../../lib/site-url";

const todoSEOSchema: SEOSchema = {
  title: "Todo List - Hyperclaw OS",
  description:
    "Organize your tasks and boost productivity with our intelligent todo list. Features smart categorization, priority management, due dates, progress tracking, and seamless integration with your AI workspace.",
  url: `${SITE_URL}/Tool/TodoList`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Todo List - Hyperclaw OS",
    description:
      "Organize your tasks and boost productivity with our intelligent todo list. Features smart categorization, priority management, due dates, progress tracking, and seamless integration with your AI workspace.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Todo List - Hyperclaw OS",
    description:
      "Organize your tasks and boost productivity with our intelligent todo list. Features smart categorization, priority management, due dates, progress tracking, and seamless integration with your AI workspace.",
    url: `${SITE_URL}/Tool/TodoList`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Todo List",
    description: "Intelligent task management and productivity tool",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Smart Task Categorization",
      "Priority Management",
      "Due Date Tracking",
      "Progress Monitoring",
      "Task Templates",
      "Recurring Tasks",
      "Task Dependencies",
      "Time Tracking",
      "Goal Setting",
      "Productivity Analytics",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/TodoList`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: `${SITE_URL}/Tool/TodoList`,
    installUrl: `${SITE_URL}/Tool/TodoList`,
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based task storage with local sync",
    permissions: "Access to local storage for offline task management",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={todoSEOSchema}>
      <TodoListProvider>
          <TodoList />
      </TodoListProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;

