# How to Build and Download Your Electron App

## Step 1: Test in Development (Optional)

Before building, test that everything works:

```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Electron (in a new terminal)
npm run electron:dev
```

You should see your app open in an Electron window!

## Step 2: Build the Distributable File

### For Windows (.exe installer)

```bash
npm run electron:build:win
```

This will:

1. Build your Next.js app (creates `.next` folder)
2. Package everything into an Electron app
3. Create an installer file

### Output Location

After building, you'll find your files in:

```
electron/dist-electron/
```

You'll see:

- **`Hypercho Copanion Setup 0.1.0.exe`** - The installer (share this!)
- **`win-unpacked/`** - Unpacked app folder (for testing)

### What to Share

Share the **`.exe` file** - users can double-click it to install your app!

## Step 3: Install and Test

1. Navigate to `electron/dist-electron/`
2. Double-click `Hypercho Copanion Setup 0.1.0.exe`
3. Follow the installer
4. Launch the app from Start Menu

## Build Options

### Windows (NSIS Installer)

```bash
npm run electron:build:win
```

### Mac (DMG)

```bash
npm run electron:build:mac
```

### Linux (AppImage)

```bash
npm run electron:build:linux
```

## File Sizes

- **Installer:** ~80-120MB (compressed)
- **Installed app:** ~150-200MB (uncompressed)

## Troubleshooting

### Build fails with "Cannot create symbolic link" error?

This is a Windows permissions issue. Here are permanent fixes:

**Solution 1: Enable Windows Developer Mode (RECOMMENDED - Permanent Fix)**

This allows creating symbolic links without admin privileges:

1. Open **Settings** (Windows + I)
2. Go to **Privacy & Security** → **For developers**
3. Enable **Developer Mode**
4. Restart your terminal/PowerShell
5. Run `npm run electron:build:win` again

This is the best solution as it permanently fixes the issue for all future builds.

**Solution 2: Run PowerShell as Administrator (Quick Fix)**

1. Right-click PowerShell
2. Select "Run as Administrator"
3. Navigate to project directory: `cd C:\Code\Codebase\Hypercho\Copanion\electron`
4. Run `npm run electron:build:win`

**Solution 3: Use portable build (No installer, no code signing)**

```bash
npm run electron:build:win:portable
```

This creates an unpacked app in `dist-electron/win-unpacked/` that you can run directly. No installer, no code signing required.

**Solution 4: Clear cache and retry**

```bash
# In PowerShell (run from electron directory)
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
npm run electron:build:win
```

### Build fails?

- Make sure Next.js builds successfully first: `npm run build`
- Check that all dependencies are installed

### App doesn't start?

- Check that port 1000 is available
- Look at the console for errors

### Need to rebuild?

- Delete `electron/dist-electron/` folder
- Clear electron-builder cache: `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache"`
- Run build command again

## Quick Commands Reference

```bash
# Development
npm run dev              # Start Next.js
npm run electron:dev     # Start Electron

# Production Build
npm run electron:build:win   # Windows installer
npm run electron:build:mac   # Mac DMG
npm run electron:build:linux # Linux AppImage
```

## Next Steps

After building, you can:

1. **Test the installer** on a clean machine
2. **Sign the app** (for Windows/Mac distribution)
3. **Set up auto-updates** (advanced)
4. **Distribute** via your website or app stores
