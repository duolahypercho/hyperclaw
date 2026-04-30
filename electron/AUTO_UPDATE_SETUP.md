# Auto-Update Setup Guide

This guide explains how to configure auto-updates for the Hyperclaw Electron app.

## Overview

The app now includes auto-update functionality using `electron-updater`. Updates are checked automatically when the app starts, and users can download and install updates seamlessly.

## Update Server Options

You need to host your app updates on a server. Here are the recommended options:

### Option 1: GitHub Releases (Recommended)

This is the easiest and most common approach:

1. **Update `electron/package.json`** with your GitHub repository details:

```json
"publish": [
  {
    "provider": "github",
    "owner": "your-github-username",
    "repo": "your-repo-name",
    "releaseType": "release"
  }
]
```

2. **Create a GitHub Personal Access Token**:

   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create a token with `repo` scope
   - Set it as an environment variable: `GH_TOKEN=your_token_here`

3. **Build and publish**:

```bash
cd electron
npm run electron:build:win
```

The build will automatically create a GitHub release and upload the update files.

### Option 2: Custom Server (AWS S3, Your Own Server, etc.)

If you want to host updates on your own server:

1. **Update `electron/main.js`** to set your update server URL:

```javascript
// In main.js, find the auto-updater configuration section
autoUpdater.setFeedURL({
  url: "https://your-update-server.com/updates",
  // Or use a custom provider
});
```

2. **Set up your update server** to serve:

   - `latest.yml` (or `latest-mac.yml` for Mac)
   - The installer/update files

3. **Update `electron/package.json`**:

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://your-update-server.com/updates"
  }
]
```

### Option 3: AWS S3

1. Create an S3 bucket for updates
2. Configure it for public read access
3. Update the publish configuration:

```json
"publish": [
  {
    "provider": "s3",
    "bucket": "your-update-bucket",
    "region": "us-east-1"
  }
]
```

## How It Works

1. **Automatic Check**: When the app starts, it automatically checks for updates after 3 seconds
2. **User Notification**: If an update is available, a notification appears in the top-right corner
3. **Download**: User can click "Download Update" to download the new version
4. **Install**: Once downloaded, user can click "Restart & Install" to apply the update

## Manual Update Check

Users can also manually check for updates by calling:

```javascript
window.electronAPI?.checkForUpdates();
```

## Development Mode

Auto-updates are **disabled** in development mode. They only work in production builds (`app.isPackaged === true`).

## Code Signing

For production releases, code signing is recommended (especially for macOS and Windows). However, updates can work without code signing, though users may see security warnings.

To enable code signing:

1. **Windows**: Set up code signing certificate and configure in `electron/package.json`
2. **macOS**: Set up Apple Developer certificate
3. **Linux**: Generally not required

## Testing Updates

1. Build version 1.0.0: `npm run electron:build:win`
2. Install and run the app
3. Build version 1.0.1: Update version in `electron/package.json` and rebuild
4. Publish the new version to your update server
5. Launch the app - it should detect the update

## Troubleshooting

### Updates not being detected

- Check that your update server is accessible
- Verify the `latest.yml` file is correctly formatted
- Check the Electron console for error messages
- Ensure you're testing with a production build (not dev mode)

### Download fails

- Check network connectivity
- Verify update server URL is correct
- Check file permissions on update server
- Review error messages in the update notification

### Update notification not showing

- Ensure `UpdateNotification` component is added to `pages/_app.tsx`
- Check that the app is running in Electron (not web browser)
- Verify `window.electronAPI` is available

## Configuration Files

- **Main updater logic**: `electron/main.js`
- **IPC handlers**: `electron/main.js` (IPC handlers section)
- **Preload script**: `electron/preload.js`
- **React component**: `components/UpdateNotification.tsx`
- **Type definitions**: `types/electron.d.ts`
- **Builder config**: `electron/package.json` (publish section)

## Next Steps

1. Choose your update server option (GitHub Releases recommended)
2. Update the `publish` configuration in `electron/package.json`
3. Set up authentication tokens if using GitHub
4. Build and test your first update
5. Deploy and monitor update adoption
