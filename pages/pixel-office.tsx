import Head from "next/head";
import { getLayout } from "$/layouts/MainLayout";
import { PixelOfficeProvider, usePixelOffice, PixelOfficeCanvas } from "$/components/PixelOffice";
import { motion } from "framer-motion";

function PixelOfficeContent() {
  const { agents, statuses, currentTasks, loading, error, roomLabels, officeName } = usePixelOffice();

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-border bg-black-100 text-muted-foreground">
        <p className="font-mono text-sm">Loading team...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-border bg-black-100 text-muted-foreground">
        <p className="font-mono text-sm">{error}</p>
      </div>
    );
  }
  return (
    <PixelOfficeCanvas
      agents={agents}
      statuses={statuses}
      currentTasks={currentTasks}
      officeName={officeName}
      roomLabels={roomLabels}
    />
  );
}

const PixelOfficePage = () => {
  return (
    <>
      <Head>
        <title>AI Agent Office | Hypercho</title>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <PixelOfficeProvider>
        <motion.div
          className="min-h-screen bg-black-100 p-4 md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mx-auto max-w-[1100px]">
            <h1 className="mb-2 font-mono text-lg font-medium text-white-100">
              AI Agent Office
            </h1>
            <p className="mb-4 font-mono text-sm text-muted-foreground">
              Your AI team in a retro office sim. Data from{" "}
              <code className="rounded bg-black-200 px-1.5 py-0.5 text-primary">
                bridge
              </code>{" "}
              (get-team + get-crons). Polls every 5s.
            </p>
            <PixelOfficeContent />
          </div>
        </motion.div>
      </PixelOfficeProvider>
    </>
  );
};

PixelOfficePage.getLayout = getLayout;
export default PixelOfficePage;
