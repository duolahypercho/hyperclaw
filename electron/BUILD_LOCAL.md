# Building Local Electron App

## Quick Steps

Since the combined build command might hang, build in separate steps:

### Step 1: Build Next.js (from project root)

```bash
npm run build
```

### Step 2: Build Electron with Local Config (from electron directory)

```bash
cd electron
npm run electron:build:win:local
```

This will:

1. Set `app-config.json` to `"mode": "local"`
2. Build the Electron app with local configuration
3. Output: `dist-electron/Copanion-Setup-Local-{version}.exe`

## Alternative: Build from Root (if it works)

```bash
npm run electron:build:win:local
```

## What Gets Built

- **Local Mode**: App will start Next.js server locally on port 1000
- **Remote Mode**: App will connect to https://claw.hypercho.com

## Output Location

```
electron/dist-electron/
├── Copanion-Setup-Local-0.1.0.exe  (installer)
└── win-unpacked/                    (unpacked app for testing)
```

## Troubleshooting

If build hangs:

1. Build Next.js separately first: `npm run build`
2. Then build Electron: `cd electron && npm run electron:build:win:local`

If you get permission errors:

- Enable Windows Developer Mode (Settings → Privacy & Security → For developers)
- Or run PowerShell as Administrator
