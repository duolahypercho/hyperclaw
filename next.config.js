/** @type {import('next').NextConfig} */
// OpenClaw gateway: allow WS to localhost. Port comes from env so custom gateway.port (e.g. in ~/.openclaw/openclaw.json) can be allowed.
// Use NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS=18789,9999 to allow multiple ports (comma-separated). Defaults to 18789.
const OPENCLAW_WS_PORTS = (process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_PORTS || "18789")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

function buildConnectSrc() {
  const parts = [
    "connect-src 'self' https:",
    "http://127.0.0.1:9979 http://localhost:9979",
  ];
  for (const port of OPENCLAW_WS_PORTS) {
    parts.push(
      `ws://127.0.0.1:${port} ws://localhost:${port}`,
      `wss://127.0.0.1:${port} wss://localhost:${port}`
    );
  }
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

    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
