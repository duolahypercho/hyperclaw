import React from "react";
import { getLayout } from "$/layouts/MainLayout";
import SettingsApp from "$/components/Tool/Setting";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import SEO from "$/components/SEO";

const Index = () => {
  return (
    <>
      <SEO
        title="Settings - Copanion OS"
        description="Customize your Copanion OS experience. Manage account settings, themes, privacy preferences, notifications, and AI assistant configurations. Personalize your AI-powered workspace."
        url="https://www.copanion.hypercho.com/Settings"
        image="https://hypercho.com/hypercho_banner.png"
        author="Hypercho"
        keywords="Copanion OS settings, account settings, theme customization, privacy settings, notification preferences, AI assistant settings, user preferences, workspace customization, profile management, security settings"
        type="website"
        siteName="Hypercho Copanion"
        twitterHandle="@hypercho"
        additionalMeta={[
          { name: "application-name", content: "Copanion OS Settings" },
          { name: "apple-mobile-web-app-title", content: "Settings" },
          {
            name: "msapplication-tooltip",
            content: "Customize your Copanion OS experience",
          },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:image:type", content: "image/png" },
        ]}
        additionalStructuredData={{
          "@type": "WebPage",
          name: "Settings - Copanion OS",
          description: "Settings and configuration page for Copanion OS",
          url: "https://www.copanion.hypercho.com/Settings",
          mainEntity: {
            "@type": "SoftwareApplication",
            name: "Copanion OS",
            applicationCategory: "ProductivityApplication",
          },
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://www.copanion.hypercho.com/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Settings",
                item: "https://www.copanion.hypercho.com/Settings",
              },
            ],
          },
          about: [
            {
              "@type": "Thing",
              name: "General Settings",
              description:
                "Manage account settings, username, and email preferences",
            },
            {
              "@type": "Thing",
              name: "Theme Settings",
              description:
                "Customize appearance, colors, and visual preferences",
            },
            {
              "@type": "Thing",
              name: "Privacy Settings",
              description:
                "Control data privacy, security, and sharing preferences",
            },
            {
              "@type": "Thing",
              name: "Notification Settings",
              description: "Manage notification preferences and alerts",
            },
            {
              "@type": "Thing",
              name: "Copanion AI Settings",
              description: "Configure AI assistant behavior and preferences",
            },
          ],
        }}
      />
      <CopanionProvider>
        <SettingsApp />
      </CopanionProvider>
    </>
  );
};

Index.getLayout = getLayout;
export default Index;
