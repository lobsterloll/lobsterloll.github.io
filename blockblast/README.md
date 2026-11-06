# Aster Blocks

An original, ad-free 8×8 block puzzle. It runs entirely in the browser, saves your current game and best score on your device, and works offline after installation. No account, network calls, or external libraries are used during play.

## Play on a computer

Serve the `dist` folder with any static web server. For example, from this folder:

```powershell
python -m http.server 8000 -d dist
```

Open `http://localhost:8000` in a browser. You can also open `dist/index.html` directly to play, but browser security rules prevent offline app installation from a `file://` address.

## Add to an iPhone Home Screen

1. Upload **the contents of `dist`** to an HTTPS static web host. All files must stay together, including `icons`, `manifest.webmanifest`, and `sw.js`.
2. Open the HTTPS address in **Safari** on your iPhone while connected to the internet.
3. Tap **Share → Add to Home Screen → Add**.
4. Open Aster Blocks from the Home Screen once while online. After that, you can play with Airplane Mode on.

The download is a ready-to-host web app. iOS cannot install a PWA directly from a ZIP or the Files app; the initial Safari visit requires HTTPS. A native `.ipa` would require a separate iOS build and Apple signing/deployment, which this package does not include.

## How to play

Drag one of the three pieces onto the board. For a precise move, tap a piece and then tap the board. Filled rows or columns clear and earn bonus points. Use all three pieces to get a fresh set. The game ends when none of the available pieces fits. **New game** restarts while retaining your best score.
