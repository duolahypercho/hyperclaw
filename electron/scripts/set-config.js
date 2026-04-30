/**
 * Switches the Electron build between "local" and "remote" mode.
 *
 *   node scripts/set-config.js local    # Community / OSS build (default)
 *   node scripts/set-config.js remote   # Cloud build pointing at HYPERCLAW_REMOTE_URL
 *
 * Remote mode requires HYPERCLAW_REMOTE_URL to be set in the environment so
 * the open-source repo never carries a hard-coded production hostname.
 */

const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'local';
const configPath = path.join(__dirname, '..', 'app-config.json');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

const remoteUrl = process.env.HYPERCLAW_REMOTE_URL || '';
if (mode === 'remote' && !remoteUrl) {
  console.error(
    'set-config.js: cannot build in "remote" mode without HYPERCLAW_REMOTE_URL.\n' +
    'Set HYPERCLAW_REMOTE_URL=https://your-cloud.example.com and re-run.'
  );
  process.exit(1);
}

const config = {
  mode,
  remoteUrl,
  localUrl: 'http://localhost:1000',
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

// Update package.json artifactName based on mode
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const suffix = mode === 'remote' ? 'Remote' : 'Local';
packageJson.build.nsis.artifactName = `Hyperclaw-Setup-${suffix}-\${version}.\${ext}`;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));