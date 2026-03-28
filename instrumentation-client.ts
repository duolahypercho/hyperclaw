import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";
const hasDsn = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

if (isProduction && hasDsn) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart =
  isProduction && hasDsn
    ? Sentry.captureRouterTransitionStart
    : undefined;
