import { GetServerSideProps } from "next";
import { getLayout } from "$/layouts/AuthLayout";
import SEO from "$/components/SEO";
import DownloadPage from "$/components/Landing/DownloadPage";

const Download = () => {
  return (
    <>
      <SEO
        title="Download Hyperclaw - Desktop App"
        description="Download the Hyperclaw desktop app for Mac (remote mode). Available for Apple Silicon and Intel."
        url="https://app.claw.hypercho.com/download"
        image="https://app.claw.hypercho.com/copanion_X_1.png"
        author="Hypercho"
        keywords="Hyperclaw download, desktop app, Mac app, productivity app download"
        type="website"
        siteName="Hypercho"
        twitterHandle="@hypercho"
      />
      <DownloadPage />
    </>
  );
};

Download.getLayout = getLayout;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};

export default Download;
