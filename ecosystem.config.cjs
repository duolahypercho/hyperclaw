module.exports = {
  apps: [
    {
      name: 'hyperclaw-app-1000',
      cwd: '/Users/ziwenxu/Code/Hyperclaw_app',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev -p 1000',
      interpreter: 'node',
      env: { NODE_ENV: 'development' },
    },
    {
      name: 'hyperclaw-connector',
      cwd: '/Users/ziwenxu/code/hyperclaw-connector',
      script: './hyperclaw-connector',
      interpreter: 'none',
      env: { HOME: '/Users/ziwenxu' },
    },
  ],
};
