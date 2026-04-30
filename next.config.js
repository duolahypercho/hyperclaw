/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// CSP allowlist is built from env. Community Edition (no env set) only allows
// self + local bridge + dev hosts. Cloud builds set NEXT_PUBLIC_HYPERCHO_API
// and NEXT_PUBLIC_HUB_API_URL / NEXT_PUBLIC_HUB_URL at build time so the
// browser is allowed to talk to the production hub.
function deriveHubOrigin(value, scheme) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${scheme}://${url.host}`;
  } catch {
    return null;
  }
}

function buildCSP() {
  const connectParts = [
    "connect-src 'self'",
    "https://cdn.jsdelivr.net",
    "https://raw.githack.com",
    "https://*.ingest.us.sentry.io",
  ];

  // Allow the configured backend API host (e.g. api.hypercho.com in Cloud builds).
  const hyperchoOrigin = deriveHubOrigin(process.env.NEXT_PUBLIC_HYPERCHO_API, "https");
  if (hyperchoOrigin) connectParts.push(hyperchoOrigin);

  // Allow the configured hub HTTP + WS origins.
  const hubHttpOrigin = deriveHubOrigin(process.env.NEXT_PUBLIC_HUB_API_URL, "https");
  if (hubHttpOrigin) connectParts.push(hubHttpOrigin);
  const hubWsOrigin = deriveHubOrigin(process.env.NEXT_PUBLIC_HUB_URL, "wss");
  if (hubWsOrigin) connectParts.push(hubWsOrigin);

  if (isDev) {
    connectParts.push("http://127.0.0.1:9979", "http://localhost:9979");
    // Cursor debug ingest in local development. This is not part of the
    // connector path, but allowing it keeps dev-only instrumentation from
    // flooding the console with CSP violations.
    connectParts.push("http://127.0.0.1:7509", "http://localhost:7509");
    // Local connector bridge
    connectParts.push("http://127.0.0.1:18790", "http://localhost:18790");
    // Local OpenClaw gateway WebSocket ports
    const ports = (process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS || "18789")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of ports) {
      connectParts.push(`ws://127.0.0.1:${p}`, `ws://localhost:${p}`, `wss://127.0.0.1:${p}`, `wss://localhost:${p}`);
    }
  }

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    connectParts.join(" "),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mui/material", "geist", "ai", "@ai-sdk/react"],
  async redirects() {
    return [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildCSP(),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
  images: {
    // Allowlist of external image hosts that next/image can optimize.
    // The CloudFront/CDN hostname is derived from NEXT_PUBLIC_CLOUD_FRONT_URL
    // so the OSS repo doesn't carry a proprietary distribution ID; Cloud builds
    // pin their own CDN at build time.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        pathname: "/**",
      },
      ...(() => {
        const cdn = process.env.NEXT_PUBLIC_CLOUD_FRONT_URL;
        if (!cdn) return [];
        try {
          const url = new URL(cdn);
          return [
            {
              protocol: url.protocol.replace(":", ""),
              hostname: url.hostname,
              pathname: "/**",
            },
          ];
        } catch {
          return [];
        }
      })(),
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    const path = require("path");

    config.resolve.alias = {
      ...config.resolve.alias,
      buffer: path.join(__dirname, "node_modules/buffer/index.js"),
    };

    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG || "",
  project: process.env.SENTRY_PROJECT || "",
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  webpack: {
    excludeServerRoutes: ["/api/auth/[...nextauth]"],
  },
});
