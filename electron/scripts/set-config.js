const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'local';
const configPath = path.join(__dirname, '..', 'app-config.json');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Update app config
const config = {
  mode: mode,
  remoteUrl: 'https://copanion.hypercho.com',
  localUrl: 'http://localhost:1000'
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

// Update package.json artifactName based on mode
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const suffix = mode === 'remote' ? 'Remote' : 'Local';
packageJson.build.nsis.artifactName = `Copanion-Setup-${suffix}-\${version}.\${ext}`;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));