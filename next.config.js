/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

function buildCSP() {
  const connectParts = [
    "connect-src 'self'",
    "https://api.hypercho.com",
    "https://hub.hypercho.com",
    "wss://hub.hypercho.com",
  ];

  if (isDev) {
    connectParts.push("http://127.0.0.1:9979", "http://localhost:9979");
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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    connectParts.join(" "),
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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "d3hv93ovhtsi9a.cloudfront.net",
        pathname: "/**",
      },
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

    // Keep better-sqlite3 as external on server — it's a native addon that can't be bundled
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("better-sqlite3");
    }

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
