/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mui/material", "geist", "ai", "@ai-sdk/react"],
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
