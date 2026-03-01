import { GetServerSideProps } from "next";

// Root redirects to dashboard (landing removed)
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/dashboard",
      permanent: false,
    },
  };
};

const Index = () => null;

export default Index;
