# HyperClaw OpenClaw Plugin

OpenClaw plugin that bridges agent tools to the HyperClaw desktop cockpit. Registers tools like `hyperclaw_add_task`, `hyperclaw_get_tasks`, `hyperclaw_notify`, `hyperclaw_read_commands`, memory/journal helpers, and channel (Discord/Telegram) CRUD.

## Prerequisites

- [OpenClaw](https://docs.openclaw.ai/) installed and configured
- HyperClaw desktop app (optional; plugin works standalone and writes to `~/.hyperclaw/`)

## How to install (for others)

### Install from Vercel (recommended when the app is published)

When the app is **deployed on Vercel** (e.g. claw.hypercho.com or your-app.vercel.app), every build automatically packs the plugin and serves it at a stable URL. Users run:

```bash
# Use your actual Vercel domain
curl -sL https://claw.hypercho.com/hyperclaw-plugin.tgz -o /tmp/hyperclaw.tgz && openclaw plugins install /tmp/hyperclaw.tgz
openclaw gateway restart
```

The root `build` script runs `plugin:pack`, which creates `public/hyperclaw-plugin.tgz` from `extensions/hyperclaw`. Vercel serves `public/` as static files, so the tarball is available at `https://<your-domain>/hyperclaw-plugin.tgz`. No manual upload—each deploy serves the latest plugin.

---

### Install from claw.hypercho.com (hosted tarball)

If you host the plugin at **https://claw.hypercho.com** (e.g. as a tarball):

OpenClaw does **not** accept a raw URL like `openclaw plugins install https://...`. Users must **download** the tarball, then install from the **local file**:

```bash
# One-liner: download from your host, then install
curl -sL https://claw.hypercho.com/hyperclaw-0.1.0.tgz -o /tmp/hyperclaw.tgz && openclaw plugins install /tmp/hyperclaw.tgz
openclaw gateway restart
```

**Hosting the tarball:**

1. Build the tarball (from this repo):
   ```bash
   npm pack extensions/hyperclaw
   # → hyperclaw-0.1.0.tgz
   ```
2. Upload `hyperclaw-0.1.0.tgz` to your server so it’s available at e.g.:
   - `https://claw.hypercho.com/hyperclaw-0.1.0.tgz` or  
   - `https://claw.hypercho.com/releases/hyperclaw-latest.tgz`

Use a redirect or copy the file to `hyperclaw-latest.tgz` so users can pin to “latest” without changing the URL in docs.

Use a redirect or copy the file to `hyperclaw-latest.tgz` so users can pin to "latest" without changing the URL in docs.

**Alternative: private npm registry at claw.hypercho.com**  
If you run an npm-compatible registry (e.g. [Verdaccio](https://verdaccio.org/)) at claw.hypercho.com and publish this package there (e.g. as `@hypercho/hyperclaw`), users can use a single command after configuring the scope:

```bash
npm config set @hypercho:registry https://claw.hypercho.com/
openclaw plugins install @hypercho/hyperclaw
openclaw gateway restart
```

OpenClaw uses npm under the hood for `plugins install <name>`, so it will respect the scope registry.

---

### Option 1: Install from this repo (clone + local path)

1. Clone the HyperClaw app repo (or download the `extensions/hyperclaw` folder):

   ```bash
   git clone https://github.com/YOUR_ORG/Hyperclaw_app.git
   cd Hyperclaw_app
   ```

2. Install the plugin into OpenClaw’s extensions directory:

   ```bash
   openclaw plugins install ./extensions/hyperclaw
   ```

   Or with an absolute path:

   ```bash
   openclaw plugins install /full/path/to/Hyperclaw_app/extensions/hyperclaw
   ```

3. Restart the OpenClaw Gateway:

   ```bash
   openclaw gateway restart
   ```

4. (Optional) Configure the plugin data directory in your OpenClaw config under `plugins.entries.hyperclaw.config`, e.g.:

   ```yaml
   plugins:
     entries:
       hyperclaw:
         enabled: true
         config:
           dataDir: "~/.hyperclaw"   # default
   ```

### Option 2: Install from a tarball (e.g. GitHub Release)

1. Download a tarball of the plugin (e.g. `hyperclaw-0.1.0.tgz` from a GitHub Release, or create one from the repo):

   ```bash
   cd /path/to/Hyperclaw_app
   npm pack extensions/hyperclaw
   # creates hyperclaw-0.1.0.tgz
   ```

2. Install from the tarball:

   ```bash
   openclaw plugins install ./hyperclaw-0.1.0.tgz
   ```

3. Restart the Gateway: `openclaw gateway restart`.

### Option 3: Install from npm (if you publish the package)

If this plugin is published to npm (e.g. as `@your-org/hyperclaw-openclaw` or `hyperclaw-openclaw`):

1. Publish (maintainers, one-time):

   - In `extensions/hyperclaw/package.json` remove `"private": true` (or set to `false`).
   - From repo root or `extensions/hyperclaw`: `npm publish` (with scoped name and access if needed).

2. Users install:

   ```bash
   openclaw plugins install @your-org/hyperclaw-openclaw
   # or
   openclaw plugins install hyperclaw-openclaw
   ```

3. Restart the Gateway: `openclaw gateway restart`.

**Note:** OpenClaw only accepts **registry** npm specs (package name + optional version/tag). Git/URL specs are not supported.

## Verify installation

```bash
openclaw plugins list
```

You should see `hyperclaw` in the list. After restart, agents can use tools such as `hyperclaw_add_task`, `hyperclaw_get_tasks`, `hyperclaw_notify`, and `hyperclaw_read_commands`.

## Development (symlink)

To develop the plugin in place without copying:

```bash
openclaw plugins install -l /full/path/to/Hyperclaw_app/extensions/hyperclaw
```

Changes in `extensions/hyperclaw` are picked up after restarting the Gateway.
