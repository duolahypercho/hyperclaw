import * as Sentry from "@sentry/nextjs";
import type { NextPageContext } from "next";

interface ErrorProps {
  statusCode?: number;
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
        {statusCode ? `${statusCode} — Server Error` : "Client Error"}
      </h1>
      <p style={{ color: "#666" }}>Something went wrong. Please try again later.</p>
    </div>
  );
}

ErrorPage.getInitialProps = async (ctx: NextPageContext) => {
  await Sentry.captureUnderscoreErrorException(ctx);
  const statusCode = ctx.res?.statusCode ?? ctx.err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
