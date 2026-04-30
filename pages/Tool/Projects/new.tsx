import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";

/**
 * Legacy entry-point. Project creation now lives inside a right-side drawer
 * mounted on /Tool/Projects. We keep this route for back-compat (deep links,
 * bookmarks) and forward through with `?new=1` so the index auto-pops the
 * drawer on arrival.
 */
const NewProjectPage = () => {
  const router = useRouter();

  React.useEffect(() => {
    if (!router.isReady) return;
    void router.replace("/Tool/Projects?new=1");
  }, [router, router.isReady]);

  return null;
};

NewProjectPage.getLayout = getLayout;
export default NewProjectPage;
