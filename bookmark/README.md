# PageCraft bookmarklet

PageCraft opens a Minecraft-style voxel world over the current webpage. The world keeps generating as you explore: it loads your 16×16 chunk and the 24 surrounding chunks, with rolling hills, dirt and stone layers, sandy lowlands, and trees. Webpage elements no longer become block structures. It uses block textures from a real Minecraft resource pack, a first-person camera, gravity, jumping, collision, block breaking and placing, a nine-slot hotbar, and a creative inventory with 15 block types. It is a browser bookmarklet, not the Minecraft game or an official Mojang product.

## Install the game bookmark for other websites

1. Open `installer.html` in your browser.
2. Show the bookmarks bar and drag **⛏ Play Minecraft-style world** onto it. Alternatively, use **Copy the game bookmark URL**, create a new bookmark, and paste the copied text into its **URL/address** field. The full URL is also in `bookmarklet.txt`.
3. Visit a different website and click **⛏ Play Minecraft-style world** in the bookmarks bar. The voxel world opens over that website. Click the 3D view to lock the mouse. Press **Q** or **Exit** to return to the website.

Save the **game link**, not the address of `installer.html` or `demo.html`. A normal website bookmark navigates back to that site; it cannot launch the game on the current page. The game link is a `javascript:` bookmarklet that runs on the page you are visiting. If your browser removes the `javascript:` prefix when pasting, edit the bookmark URL field directly. You can click the game bookmark a second time to close PageCraft.

To try the game locally before installing, open `demo.html` and click **Launch voxel world**. The demo page is only a place to test the game.

| Control | Action |
| --- | --- |
| Click view | Lock mouse for looking around |
| Mouse / arrow keys | Look |
| W A S D | Move |
| Space | Jump |
| Shift | Sneak: move slowly, lower your view, and avoid walking off ledges |
| Ctrl | Sprint |
| Left click | Break targeted block |
| Right click | Place selected block |
| Mouse wheel or 1–9 | Select a hotbar slot |
| E | Open or close creative inventory; gravity continues while it is open. Click a hotbar slot, then a block to fill it |
| Esc | Close inventory or unlock mouse |
| Q or Exit | Close and restore webpage |

## Implementation plan and structure

1. **Terrain and chunks:** Generate deterministic grass, sand, dirt, stone, and trees in 16×16 chunks. Keep a 5×5 grid loaded around the player; unload chunks that leave the grid and generate new ones on entry. Block changes are reapplied when a chunk reloads during the same play session.
2. **Texture:** Load sixteen 16×16 PNGs from the Pixel Perfection Community Edition Minecraft resource pack at build time. Fifteen are selectable blocks; the extra tile is grass sides. The build embeds their pixels in the bookmarklet, so runtime uses no network requests.
3. **Render:** Build exposed cube faces and draw them through a WebGL 1 texture atlas. Pixelated sampling, face shading, and distance fog give the scene its block-game look.
4. **Play:** Use a first-person camera, pointer lock, AABB collision, gravity, jumping, a short raycast to break or place blocks, and a creative inventory to fill hotbar slots.
5. **Restore:** Remove the overlay and event listeners on exit. Refreshing the page also clears the world.

Editable source is `src/voxel-world.js`. `scripts/build.js` combines it with `textures/*.png` and writes `voxel-bookmarklet.js`, `bookmarklet.txt`, and `installer.html`. `demo.html` is a local example page.

To rebuild with Node.js:

```sh
npm install
npm run build
```

`voxel-bookmarklet.js` is the standalone readable build. `bookmarklet.txt` is the one-line URL to install; it is long because textures are included. No runtime dependencies, external scripts, cookies, or network calls are used.

## Browser and page limits

- A website's **Content Security Policy** can block `javascript:` bookmarklets. If clicking the bookmark does nothing, try the local demo or a page you control. PageCraft cannot override that policy. [MDN: JavaScript URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/javascript), [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- Browsers do not run bookmarklets on some internal pages, extension pages, PDF viewers, or privileged tabs. Desktop Chrome/Edge style browsers with WebGL are the intended target; mobile touch controls are not implemented.
- Mouse look needs a click because browsers require a user action for pointer lock. Sandboxed frames may block it; arrow keys still look. [MDN: Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)
- Terrain is generated as you move, but only 25 chunks are loaded at once. Faraway chunks reload when you return. Block edits remain in memory during play and are lost when you exit or reload the page.
- Game changes exist only in the overlay. They do not modify the website.

## Texture credit and license

The sixteen block PNGs in `textures/` are copied from [Pixel Perfection Community Edition](https://github.com/Athemis/PixelPerfectionCE), originally by XSSheep with community updates. That pack is published under [Creative Commons Attribution-ShareAlike 4.0](https://github.com/Athemis/PixelPerfectionCE/blob/master/LICENSE.md). The copied license is in `textures/LICENSE-PixelPerfectionCE.md`. The embedded atlas is a repackaging of those licensed pixels, and the texture portions of the generated files remain under CC BY-SA 4.0. This project does not bundle Mojang's default game textures.
