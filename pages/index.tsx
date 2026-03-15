import { NextPage } from "next";
import Head from "next/head";
import HomeContent from "$/components/Landing/HomeContent";
import { getLayout } from "$/layouts/AuthLayout";

const Index: NextPage & { getLayout?: (page: NextPage) => JSX.Element } = () => {
  return (
    <>
      <Head>
        <title>HyperClaw - OpenClaw Mission Control</title>
        <meta
          name="description"
          content="Your local command center for AI assistants. Download OpenClaw Dashboard and manage your AI deployment."
        />
      </Head>
      <HomeContent />
    </>
  );
};

Index.getLayout = getLayout;

export default Index;
