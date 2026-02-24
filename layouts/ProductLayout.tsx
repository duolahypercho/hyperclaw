import { NextPage } from "next/types";
import { useSession } from "next-auth/react";

const ProductLayout = ({ children }: any) => {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div id={"layout"} className={`Layout customScrollbar`}>
        <div className={`mainContainer`}>
          <div className="pageLoading">
            <div className="loading">Loading&#8230;</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={"layout"} className={`ProductLayout customScrollbar`}>
      <div className={`mainContainer`}>
        <div className="appContainer">
          <div className={`mainBody`}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export default ProductLayout;
export const getLayout = (page: NextPage | JSX.Element) => (
  <ProductLayout>{page}</ProductLayout>
);
