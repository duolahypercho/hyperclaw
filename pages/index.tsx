import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import HomeContent from "$/components/Landing/HomeContent";
import { getLayout } from "$/layouts/AuthLayout";
import { isHubConfigured } from "$/lib/hub-direct";

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

export const getServerSideProps: GetServerSideProps = async () => {
  if (!isHubConfigured()) {
    return {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    };
  }

  return { props: {} };
};
