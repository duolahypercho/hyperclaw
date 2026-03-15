import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { VirtualDevices } from "$/components/Tool/Devices";
import { SITE_URL } from "../../lib/site-url";

const devicesSEOSchema: SEOSchema = {
  title: "Devices - Hyperclaw OS",
  description: "Manage your connected OpenClaw gateway devices",
  url: `${SITE_URL}/Tool/Devices`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={devicesSEOSchema}>
      <VirtualDevices />
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
