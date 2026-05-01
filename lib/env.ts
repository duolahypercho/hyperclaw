import { z } from "zod";

const LOCAL_NEXTAUTH_URL = "http://localhost:1000";
const LOCAL_NEXTAUTH_SECRET = "hyperclaw-local-community-secret";
const CLOUD_BUILD_FLAVORS = new Set(["cloud", "commercial", "remote"]);

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUrlWithDefault = (fallback: string) =>
  z.preprocess(
    blankToUndefined,
    z.string().url("NEXTAUTH_URL must be a valid URL").optional().default(fallback)
  );

const optionalSecretWithDefault = (fallback: string) =>
  z.preprocess(
    blankToUndefined,
    z.string().min(1, "NEXTAUTH_SECRET is required").optional().default(fallback)
  );

const requiredUrl = z.preprocess(
  blankToUndefined,
  z.string({ required_error: "Required" }).url("NEXTAUTH_URL must be a valid URL")
);

const requiredSecret = z.preprocess(
  blankToUndefined,
  z.string({ required_error: "Required" }).min(1, "NEXTAUTH_SECRET is required")
);

function isCloudRuntimeEnv(rawEnv: NodeJS.ProcessEnv): boolean {
  const flavor = String(
    rawEnv.BUILD_FLAVOR || rawEnv.HYPERCLAW_BUILD_FLAVOR || ""
  ).toLowerCase();

  return (
    CLOUD_BUILD_FLAVORS.has(flavor) ||
    !!rawEnv.HYPERCLAW_REMOTE_URL ||
    !!rawEnv.NEXT_PUBLIC_HUB_API_URL ||
    !!rawEnv.NEXT_PUBLIC_HUB_URL ||
    !!rawEnv.NEXT_PUBLIC_HYPERCHO_API
  );
}

/**
 * Server-side env validation. Only the vars the app truly cannot start without
 * are marked required — the rest are optional with sensible defaults.
 */
const baseServerSchema = z.object({
  // Google OAuth (optional — app works without Google login)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // OpenAI (optional — gateway chat won't work without it)
  OPENAI_API_KEY: z.string().optional(),

  // S3 (optional — file uploads won't work)
  S3_UPLOAD_KEY: z.string().optional(),
  S3_UPLOAD_SECRET: z.string().optional(),
  S3_UPLOAD_REGION: z.string().optional(),
  S3_UPLOAD_BUCKET: z.string().optional(),

  // Sentry (optional — error tracking disabled without DSN)
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),

  // Domain (optional — only needed in production for cookie domain)
  DOMAIN: z.string().optional(),

  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
});

const localServerSchema = baseServerSchema.extend({
  // Community/local builds can run in guest mode. The fallback only protects
  // NextAuth internals if an auth route is touched during local development.
  NEXTAUTH_URL: optionalUrlWithDefault(LOCAL_NEXTAUTH_URL),
  NEXTAUTH_SECRET: optionalSecretWithDefault(LOCAL_NEXTAUTH_SECRET),
});

const cloudServerSchema = baseServerSchema.extend({
  // Cloud builds issue real session cookies, so these must be explicit.
  NEXTAUTH_URL: requiredUrl,
  NEXTAUTH_SECRET: requiredSecret,
});

const serverSchema = isCloudRuntimeEnv(process.env)
  ? cloudServerSchema
  : localServerSchema;

export type ServerEnv = z.infer<typeof serverSchema>;

let _validatedEnv: ServerEnv | null = null;

export function validateEnv(): ServerEnv {
  if (_validatedEnv) return _validatedEnv;

  const result = serverSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`\n❌ Environment validation failed:\n${formatted}\n`);
    throw new Error(`Missing or invalid environment variables:\n${formatted}`);
  }

  _validatedEnv = result.data;
  return _validatedEnv;
}

export const env = validateEnv();
