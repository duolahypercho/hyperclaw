// PM2 process manifest for running Hyperclaw locally as a long-lived dev stack.
//
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs hyperclaw-app-1000
//
// `cwd` defaults to the directory you run PM2 from. Override paths via env
// vars when running from somewhere else:
//   HYPERCLAW_APP_DIR=/abs/path/to/Hyperclaw_app \
//   HYPERCLAW_CONNECTOR_DIR=/abs/path/to/hyperclaw-connector \
//   pm2 start ecosystem.config.cjs

const path = require("path");

const APP_DIR = process.env.HYPERCLAW_APP_DIR || __dirname;
const CONNECTOR_DIR =
  process.env.HYPERCLAW_CONNECTOR_DIR ||
  path.resolve(__dirname, "../hyperclaw-connector");

module.exports = {
  apps: [
    {
      name: "hyperclaw-app-1000",
      cwd: APP_DIR,
      script: "node_modules/next/dist/bin/next",
      args: "dev -p 1000",
      interpreter: "node",
      env: { NODE_ENV: "development" },
    },
    {
      name: "hyperclaw-connector",
      cwd: CONNECTOR_DIR,
      script: "./hyperclaw-connector",
      interpreter: "none",
      env: { HOME: process.env.HOME },
    },
  ],
};
