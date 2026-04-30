# Troubleshooting Electron App Issues

## App Doesn't Open After Installation

### Problem

The app installs but doesn't open when launched.

### Solutions

1. **Check Console Logs**

   - Right-click the app shortcut → Properties
   - Check if there are any error messages
   - The app now shows error dialogs if the server fails to start

2. **Verify Next.js Build**

   - Make sure you ran `npm run build` before building the Electron app
   - The `.next` folder must exist in the project root

3. **Check Port 1000**

   - Ensure port 1000 is not already in use
   - The app tries to start Next.js server on `http://localhost:1000`

4. **Run from Command Line**
   - Navigate to the installed app directory
   - Run the `.exe` from command line to see error messages
   - Example: `cd "C:\Program Files\Hyperclaw" && "Hyperclaw.exe"`

## Installer Doesn't Launch / Nothing Happens When Clicked

### Problem

Double-clicking the installer `.exe` file does nothing - no window appears, no error message.

### Why This Happens

1. **Windows SmartScreen is blocking it** (most common)
   - Windows blocks unsigned executables by default
   - No error message is shown, it just silently blocks

2. **Antivirus software is blocking it**
   - Some antivirus software silently blocks unsigned executables

3. **File corruption**
   - The installer file might be corrupted or incomplete

4. **Missing dependencies**
   - Windows might be missing required runtime libraries

### Solutions

**Solution 1: Right-Click and "Run as Administrator"**
1. Right-click the installer file
2. Select "Run as administrator"
3. If Windows shows a security prompt, click "More info" then "Run anyway"

**Solution 2: Unblock the File (Windows SmartScreen)**
1. Right-click the installer file → Properties
2. If you see an "Unblock" checkbox at the bottom, check it
3. Click OK, then try running the installer again

**Solution 3: Check Windows Security**
1. Open Windows Security (Windows + I → Privacy & Security → Windows Security)
2. Go to "Virus & threat protection"
3. Click "Protection history"
4. Look for any blocked entries related to your installer
5. If found, click "Actions" → "Allow on device"

**Solution 4: Run from Command Line**
1. Open PowerShell or Command Prompt
2. Navigate to the installer location:
   ```powershell
   cd "C:\Code\Codebase\Hypercho\Hyperclaw\electron\dist-electron"
   ```
3. Run the installer:
   ```powershell
   .\Hyperclaw-Setup-Local-0.1.0.exe
   ```
4. This will show any error messages that might be hidden

**Solution 5: Check Event Viewer for Errors**
1. Press Windows + X → Event Viewer
2. Go to Windows Logs → Application
3. Look for errors around the time you tried to run the installer
4. This can reveal what's blocking it

**Solution 6: Use Portable Build Instead**
If the installer continues to have issues, use the portable build:
```bash
cd electron
npm run electron:build:win:portable
```
This creates an unpacked app in `dist-electron/win-unpacked/` that you can run directly without an installer.

## Installer Looks Suspicious

### Problem

Windows Defender or antivirus flags the installer as suspicious.

### Why This Happens

- Unsigned executable (no code signing certificate)
- Generic Electron installer appearance
- Missing publisher information

### Solutions

1. **Code Signing** (Recommended for Distribution)

   - Get a code signing certificate
   - Add certificate to `electron/package.json`:

   ```json
   "win": {
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "your-password"
   }
   ```

2. **Add to Windows Defender Exclusions** (For Testing)

   - Windows Security → Virus & threat protection
   - Manage settings → Exclusions
   - Add the installer folder

3. **Use Portable Build** (No Installer)
   ```bash
   npm run electron:build:win:portable
   ```
   This creates an unpacked app without an installer.

## Build Process

### Correct Build Order

1. **Build Next.js App**

   ```bash
   npm run build
   ```

2. **Build Electron App**

   ```bash
   cd electron
   npm run electron:build:win
   ```

   Or use the combined command:

   ```bash
   npm run electron:build:win
   ```

### What Gets Packaged

- `.next/` folder (Next.js build output)
- `node_modules/` (all dependencies)
- `public/` folder (all public assets)
- `package.json` (app configuration)
- Electron runtime and Chromium

## Common Errors

### "Server failed to start"

- **Cause**: Next.js server couldn't start
- **Fix**: Check that `.next` folder exists and port 1000 is available

### "Cannot find module"

- **Cause**: Missing dependencies in packaged app
- **Fix**: Ensure `node_modules` is included in build files

### "Port 1000 already in use"

- **Cause**: Another process is using port 1000
- **Fix**: Close other instances or change port in `package.json`

## Development vs Production

### Development

- Uses `npm run dev` (Next.js dev server)
- Hot reload enabled
- DevTools open automatically

### Production

- Uses `npm run start` (Next.js production server)
- Optimized build
- No DevTools (unless enabled)

## Getting Help

If issues persist:

1. Check the console output when launching the app
2. Verify all files are included in the build
3. Test the Next.js app separately: `npm run start`
4. Check Electron logs in the app directory
