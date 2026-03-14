/** @type {import('next').NextConfig} */
// OpenClaw gateway: allow WS connections for remote/VPS connections
// Use NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS=18789,9999 to allow multiple ports (comma-separated). Defaults to 18789.
// For production: allows any IP address for maximum flexibility (gateway auth provides security)
const OPENCLAW_WS_PORTS = (process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS || "18789")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

function buildConnectSrc() {
  // Build WebSocket origins for each configured gateway port
  const wsOrigins = OPENCLAW_WS_PORTS.flatMap((p) => [
    `ws://127.0.0.1:${p}`,
    `ws://localhost:${p}`,
    `wss://127.0.0.1:${p}`,
    `wss://localhost:${p}`,
  ]);
  const parts = [
    "connect-src 'self'",
    "https://api.hypercho.com",
    "https://hub.hypercho.com",
    "wss://hub.hypercho.com",
    "http://127.0.0.1:9979 http://localhost:9979",
    ...wsOrigins,
  ];
  return parts.join(" ");
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mui/material", "geist", "ai", "@ai-sdk/react"],
  // Root → dashboard (landing removed)
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
  // OpenClaw gateway WS: ports from NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS (default 18789).
  // Copanion/User backend: allow localhost:9979 for local runtime and /User/info/.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildConnectSrc(),
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
});
