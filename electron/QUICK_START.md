# Quick Start: Electron with Next.js

## How It Works (Simple Explanation)

Think of Electron as a **custom browser** that:

1. **Wraps your Next.js app** in a desktop window
2. **Runs your app locally** (no browser address bar)
3. **Gives you native OS features** (notifications, file access, etc.)

## The Flow

```
1. User double-clicks "Hypercho Copanion.exe"
   ↓
2. Electron starts (like opening Chrome)
   ↓
3. Electron starts your Next.js server (localhost:1000)
   ↓
4. Electron opens a window pointing to localhost:1000
   ↓
5. Your Next.js app loads (just like in a browser)
   ↓
6. User sees your app in a desktop window!
```

## Key Files

- **`electron/main.js`** - The "brain" that controls everything
- **`electron/preload.js`** - Bridge between Electron and your app
- **Your Next.js app** - Runs exactly as it does now, just in Electron window

## Installation

```bash
# 1. Install Electron in the electron folder
cd electron
npm install electron electron-builder cross-env --save-dev

# 2. Go back to root
cd ..
```

## Running

### Development Mode

**Option 1: Two terminals (recommended)**

```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Electron
npm run electron:dev
```

**Option 2: Single command (auto-starts both)**

```bash
npm run electron:dev
```

### Production Build

```bash
# Build everything
npm run electron:build:win
```

Output will be in `electron/dist-electron/`

## What Changes in Your Code?

**Almost nothing!** Your Next.js app works the same.

**Optional:** You can detect if running in Electron:

```typescript
// In any component
if (typeof window !== "undefined" && window.electronAPI) {
  // Running in Electron - can use native features
  window.electronAPI.showNotification("Hello!", "From Electron");
}
```

## Benefits

✅ **Native app feel** - Appears in taskbar, system tray  
✅ **No browser UI** - Clean, focused experience  
✅ **Offline capable** - Can work without internet  
✅ **File system access** - Can read/write files  
✅ **System integration** - Notifications, shortcuts, etc.  
✅ **Easy distribution** - Single .exe file to share

## Common Questions

**Q: Do I need to change my Next.js code?**  
A: No! It works as-is.

**Q: Can I still deploy to web?**  
A: Yes! Electron is separate. Your web version stays the same.

**Q: How big is the final app?**  
A: ~100-150MB (includes Chromium + Node.js)

**Q: Does it work on Mac/Linux?**  
A: Yes! Just change the build command.

**Q: Can users update automatically?**  
A: Yes, with `electron-updater` package.

## Next Steps

1. Customize window appearance
2. Add native menus
3. Implement auto-updates
4. Add system tray icon
5. Handle file associations

See `electron/README.md` for detailed documentation.
