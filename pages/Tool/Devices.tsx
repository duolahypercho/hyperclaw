import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { VirtualDevices } from "$/components/Tool/Devices";

const devicesSEOSchema: SEOSchema = {
  title: "Devices - Hyperclaw OS",
  description: "Manage your connected OpenClaw gateway devices",
  url: "https://www.app.claw.hypercho.com/Tool/Devices",
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
