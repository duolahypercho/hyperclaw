import { z } from "zod";

/**
 * Server-side env validation. Only the vars the app truly cannot start without
 * are marked required — the rest are optional with sensible defaults.
 */
const serverSchema = z.object({
  // NextAuth (required — auth breaks without these)
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),

  // Google OAuth (optional — app works without Google login)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Twitter OAuth (optional)
  TWITTER_CLIENT_ID: z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  TWITTER_CALLBACK_URL: z.string().optional(),

  // OpenAI (optional — gateway chat won't work without it)
  OPENAI_API_KEY: z.string().optional(),

  // Stripe (optional — billing features won't work)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MONTHLY_PLAN_ID: z.string().optional(),
  STRIPE_ANNUAL_PLAN_ID: z.string().optional(),

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
