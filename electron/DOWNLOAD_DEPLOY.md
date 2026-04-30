# Build Mac app (remote) and allow others to download

## 1. Build

From the **project root** (Hyperclaw_app):

```bash
npm run electron:build:mac:remote
```

- Uses **remote** mode (app loads from `https://your-domain.example.com`).
- Output is in `**electron/dist-electron/`**:
  - `Hyperclaw-0.1.0-arm64-mac.zip` (Apple Silicon)
  - `Hyperclaw-0.1.0-x64-mac.zip` (Intel)

(Exact names may include `${version}` and `${arch}` from electron-builder; list the folder after building to confirm.)

## 2. Upload to AWS

Upload the zip(s) to your S3 bucket (or wherever you host files) and make them publicly reachable (e.g. via CloudFront). Example:

- `https://your-cloudfront.net/file/Hyperclaw-0.1.0-arm64-mac.zip`
- `https://your-cloudfront.net/file/Hyperclaw-0.1.0-x64-mac.zip`

Or use a single “Mac” link (e.g. arm64 for Apple Silicon, or a universal build if you add one).

## 3. Point the app to the download URL

**Option A – This repo (Hyperclaw_app)**

Set in `.env`:

```env
NEXT_PUBLIC_HYPERCLAW_MAC_DOWNLOAD_URL=https://your-cloudfront.net/file/Hyperclaw-0.1.0-arm64-mac.zip
NEXT_PUBLIC_HYPERCLAW_WINDOWS_DOWNLOAD_URL=https://your-cloudfront.net/file/Hyperclaw-Setup-Remote-0.1.0.exe
```

The **Download** page (`/download` and `components/Landing/DownloadPage.tsx`) uses these when set; otherwise it falls back to `getMediaUrl("file/...")` paths.

**Option B – Other repo (e.g. hyperclaw `homeContent.tsx`)**

Use the same public URL. Example:

```tsx
// In ~/code/hyperclaw/src/component/homeContent.tsx (or equivalent)
const HYPERCLAW_MAC_DOWNLOAD = process.env.NEXT_PUBLIC_HYPERCLAW_MAC_DOWNLOAD_URL
  || "https://your-cloudfront.net/file/Hyperclaw-0.1.0-arm64-mac.zip";

// Then in your JSX:
<a href={HYPERCLAW_MAC_DOWNLOAD} target="_blank" rel="noopener noreferrer">
  Download for Mac
</a>
```

Or a button:

```tsx
<button
  type="button"
  onClick={() => window.open(HYPERCLAW_MAC_DOWNLOAD, "_blank", "noopener,noreferrer")}
>
  Download Hyperclaw for Mac
</button>
```

Set `NEXT_PUBLIC_HYPERCLAW_MAC_DOWNLOAD_URL` in that repo’s env (e.g. Vercel) so you can change the URL without code changes.

## 4. DMG instead of ZIP (optional)

To ship a `.dmg` (avoids macOS “damaged” warnings with unsigned zip), run the build on a **Mac** with:

```bash
npm run electron:build:mac:remote:dmg
```

Then upload the generated `.dmg` from `electron/dist-electron/` and use its URL as `NEXT_PUBLIC_HYPERCLAW_MAC_DOWNLOAD_URL`.