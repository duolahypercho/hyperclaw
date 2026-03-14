import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { VirtualApprovals } from "$/components/Tool/Approvals";

const approvalsSEOSchema: SEOSchema = {
  title: "Approvals - Hyperclaw OS",
  description: "Review and approve dangerous operations on your devices",
  url: "https://www.app.claw.hypercho.com/Tool/Approvals",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={approvalsSEOSchema}>
      <VirtualApprovals />
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
