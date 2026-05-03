import { NextPage } from "next";
import Head from "next/head";
import HomeContent from "$/components/Landing/HomeContent";
import { getLayout } from "$/layouts/AuthLayout";

const Index: NextPage & { getLayout?: (page: NextPage) => JSX.Element } = () => {
  return (
    <>
      <Head>
        <title>HyperClaw - Local-first mission control for AI agents</title>
        <meta
          name="description"
          content="Run Claude Code, Codex, OpenClaw, Hermes, projects, workflows, knowledge, data, and channels from one local-first AI agent command center."
        />
      </Head>
      <HomeContent />
    </>
  );
};

Index.getLayout = getLayout;

export default Index;
