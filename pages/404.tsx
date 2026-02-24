import React from "react";
import { getLayout } from "../layouts/MainLayout";
import Link from "next/link";
import Head from "next/head";

const Index = () => {
  return (
    <>
      <Head>
        <title>404 Error</title>
      </Head>
      <div className="absolute top-0 left-0 w-full h-full bg-background">
        <div className="flex flex-col items-center gap-3 justify-center h-screen">
          <span className="text-4xl font-semibold text-foreground">
            404 Error
          </span>
          <span className="text-x text-muted-foreground">
            Glad you found this page but I didn&apos;t find this page
          </span>
          <span className="text-x text-muted-foreground">
            Try something else
          </span>
          <Link
            href="/"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/80 active:bg-primary/60 transition-all duration-300 active:scale-95"
          >
            Go to home
          </Link>
        </div>
      </div>
    </>
  );
};

Index.getLayout = getLayout;
export default Index;
