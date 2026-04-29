# Building Secret Sauce — .dmg & .exe

## Prerequisites

```bash
npm install
```

---

## 🍎 macOS (.dmg)

Run this on a Mac:

```bash
# Apple Silicon (M1/M2/M3/M4)
npm run make -- --platform=darwin --arch=arm64

# Intel Mac
npm run make -- --platform=darwin --arch=x64
```

Output: `out/make/Secret Sauce-0.7.0-arm64.dmg`

### Installing on Mac (for the person receiving the .dmg)

Since the app is **unsigned**, macOS will block it by default. Tell them to:

1. Open the `.dmg` and drag "Secret Sauce" to Applications
2. **Don't double-click to open!** Instead:
    - Right-click → Open → Click "Open" in the warning dialog
3. If it says "app is damaged", open Terminal and run:
    ```bash
    xattr -cr /Applications/Secret\ Sauce.app
    ```
    Then right-click → Open again.

---

## 🪟 Windows (.exe)

> ⚠️ You need a **Windows machine** to build the .exe (cross-compile from Mac is unreliable)

```bash
npm run make -- --platform=win32 --arch=x64
```

Output: `out/make/squirrel.windows/x64/Secret Sauce-0.7.0 Setup.exe`

### Installing on Windows (for the person receiving the .exe)

Since the app is **unsigned**, Windows SmartScreen will show a warning:

1. Double-click the `.exe` installer
2. SmartScreen says "Windows protected your PC"
3. Click **"More info"** → then **"Run anyway"**
4. App installs normally after that

---

## 🐧 Linux (.AppImage)

```bash
npm run make -- --platform=linux --arch=x64
```

Output: `out/make/Secret Sauce.AppImage`

---

## Quick Reference

| Command                                          | What it does        |
| ------------------------------------------------ | ------------------- |
| `npm start`                                      | Run in dev mode     |
| `npm run make`                                   | Build all platforms |
| `npm run make -- --platform=darwin --arch=arm64` | macOS Apple Silicon |
| `npm run make -- --platform=darwin --arch=x64`   | macOS Intel         |
| `npm run make -- --platform=win32 --arch=x64`    | Windows             |
| `npm run make -- --platform=linux --arch=x64`    | Linux               |

---

## What was configured for unsigned distribution

In `forge.config.js`, these fuses are set to `false` so the app works without code signing:

```js
EnableEmbeddedAsarIntegrityValidation: false; // requires signing
OnlyLoadAppFromAsar: false; // requires signing
```

If you ever get an Apple Developer certificate, you can enable `osxSign` and `osxNotarize` in the config and set these back to `true`.
