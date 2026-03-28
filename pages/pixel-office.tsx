import Head from "next/head";
import { getLayout } from "$/layouts/MainLayout";
import { PixelOfficeProvider, usePixelOffice, FullOfficeView } from "$/components/PixelOffice";
import { motion } from "framer-motion";

function PixelOfficeContent() {
  const { loading, error } = usePixelOffice();

  if (loading) {
    return (
      <div className="flex h-full w-full min-h-0 flex-1 items-center justify-center bg-black-100">
        <p className="font-mono text-sm text-muted-foreground">Loading team...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full w-full min-h-0 flex-1 items-center justify-center bg-black-100 text-muted-foreground">
        <p className="font-mono text-sm">{error}</p>
      </div>
    );
  }
  return (
    <motion.div
      className="flex flex-1 h-full w-full min-h-0 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <FullOfficeView />
    </motion.div>
  );
}

const PixelOfficePage = () => {
  return (
    <>
      <Head>
        <title>AI Agent Office | Hypercho</title>
      </Head>
      <PixelOfficeProvider>
        <div className="h-screen w-full bg-black-100">
          <PixelOfficeContent />
        </div>
      </PixelOfficeProvider>
    </>
  );
};

PixelOfficePage.getLayout = getLayout;
export default PixelOfficePage;
