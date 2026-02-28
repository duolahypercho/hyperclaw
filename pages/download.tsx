import { GetServerSideProps } from "next";
import { getLayout } from "$/layouts/AuthLayout";
import SEO from "$/components/SEO";
import DownloadPage from "$/components/Landing/DownloadPage";

const Download = () => {
  return (
    <>
      <SEO
        title="Download Copanion - Desktop App"
        description="Download the Copanion desktop app for a faster, more integrated experience. Available for Windows and macOS."
        url="https://app.claw.hypercho.com/download"
        image="https://app.claw.hypercho.com/copanion_X_1.png"
        author="Hypercho"
        keywords="Copanion download, desktop app, Windows app, productivity app download"
        type="website"
        siteName="Copanion"
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
