import React, { useState, useMemo, useEffect } from "react";
import { InteractApp } from "@OS/InteractApp";
import { AppSchema, SidebarItem } from "@OS/Layout/types";
import { User, Shield, Bell, LogOut, Moon, CreditCard, Monitor } from "lucide-react";
import General from "./pages/general";
import Theme from "./pages/theme";
import Privacy from "./pages/privacy";
import Danger from "./pages/danger";
import Notifications from "./pages/notifications";
import Payment from "./pages/payment";
import DevicesSettings from "./pages/devices";
import { AnimatePresence } from "framer-motion";
import { useOS } from "@OS/Provider/OSProv";

const sectionList = [
  { id: "general", title: "General", icon: User },
  { id: "devices", title: "Devices", icon: Monitor },
  { id: "payment", title: "Subscription", icon: CreditCard },
  { id: "theme", title: "Theme", icon: Moon },
  { id: "privacy", title: "Privacy", icon: Shield },
  { id: "notifications", title: "Notifications", icon: Bell },
  { id: "logout", title: "Logout", icon: LogOut },
];

const sectionComponents: Record<string, React.ReactNode> = {
  general: <General />,
  devices: <DevicesSettings />,
  payment: <Payment />,
  theme: <Theme />,
  privacy: <Privacy />,
  notifications: <Notifications />,
  logout: <Danger />,
};

const SettingsApp = () => {
  const { currentAppSettings, updateAppSettings } = useOS();
  const [activeSection, setActiveSection] = useState(
    currentAppSettings?.currentActiveTab || "general"
  );

  const appSchema: AppSchema = {
    sidebar: {
      sections: [
        {
          id: "main",
          type: "default",
          items: sectionList.map(
            (section) =>
              ({
                ...section,
                onClick: () => setActiveSection(section.id),
                isActive: activeSection === section.id,
              } as SidebarItem)
          ),
        },
      ],
    },
  };

  useEffect(() => {
    if (activeSection) {
      updateAppSettings("settings", {
        currentActiveTab: activeSection,
      });
    }
  }, [activeSection]);

  return (
    <InteractApp appSchema={appSchema}>
      <div className="w-full h-full flex flex-col">
        <AnimatePresence mode="wait">
          <div key={activeSection} className="w-full h-full">
            {sectionComponents[activeSection]}
          </div>
        </AnimatePresence>
      </div>
    </InteractApp>
  );
};

export default SettingsApp;
