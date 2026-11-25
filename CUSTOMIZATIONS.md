# KeyboardPet customizations

This fork builds on [qianyiai/kurocat](https://github.com/qianyiai/kurocat), under its existing [MIT license](LICENSE).

The custom **我家龙猫** (`my-chinchilla`) is a cream sticker-style chinchilla, drawn the same way in 2D and 3D: a one-piece, egg-shaped body with a scalloped chest, freckled ears, pale brow dots, glossy eyes, a pink nose, a cloud tail, a thin cocoa outline and a white die-cut border. It tucks its paws up in front of its chest when idle, hugs a heart while being petted, and covers its eyes while a password is typed. It also brings a milk-tea keyboard and mouse, cream headphones and matching key bubbles; other skins keep the original desk.

Its body is one rigid plush that rocks and nods but never stretches, so its shape and belly stay the same in every pose. It leans back to look up at the raised 3D camera, which keeps the face level and the drawn proportions. Ears and tail sit behind the silhouette, the arms are one piece with their paws and run straight into them without a pinched wrist, and each paw presses the keys on its own side, so parts do not poke through one another. An arm hangs from the chest right above its paw, so for keys in the middle it stays short and never reaches across the belly; only for keys out to the side does the shoulder slide round to the flank. In smart tail mode the tail only presses nearby keys on the right: the cloud swings round the outside of the body on a stalk and pats the key. Keys chosen for the tail on the left are pressed from the left: the tail crosses over behind the body, so it never sweeps across the belly. Keys right in front of the belly, such as the space bar, are always pressed by a paw, even when they are tail keys.

How slim it is comes from `BODY_WIDTH` in `src/chinchillaStyle.ts` (hips and head as a share of the first, rounder design); the outline, the 3D sculpt, ears, whiskers, blush, shoulders and tail all follow it.

At launch the desktop window draws nothing until the saved pet is known, so the default cat no longer flashes by first.

In 2D the chinchilla's outlines, white border and drop shadow are painted as a few combined paths instead of one call per shape, which halves the drawing work of each frame (about 6 ms to 3 ms in macOS WebKit at its usual size) without changing its look.

Shared palette and outlines live in `src/chinchillaStyle.ts`; the 2D renderer is `src/chinchilla2d.ts`, the 3D sculpt is `src/chinchillaModel.ts`, and the 3D sticker border is `src/stickerPass3d.ts`. Existing skins remain selectable.

The keyboard's rear edge is raised toward the viewer and the camera is slightly higher, making the key rows and legends easier to see. The pet also has more compact proportions, with its idle paws raised to clear the keyboard.

## Build on macOS

Install Node.js 18+, the stable Rust toolchain, and Xcode Command Line Tools, then run from the repository root:

```sh
npm ci
npm run tauri:build -- --bundles app
```

The application is generated at `src-tauri/target/release/bundle/macos/KuroCat.app`. Quit any running copy before copying the new app to Applications. For development with live reload, run `npm run tauri:dev`.

macOS ties the Accessibility and Input Monitoring grants to the app's signature. Sign every build with the same self-signed certificate (kept outside the repository, created once with `scripts/macos-codesign.sh create-cert`) before installing it, and the grants survive updates; an unsigned or ad hoc build has to be granted again.

## Select the chinchilla

Open the pet's right-click menu or tray menu and choose **我家龙猫**; it looks the same with **3D 立体** on or off. Its reproducible color configuration is in [`customizations/my-chinchilla.json`](customizations/my-chinchilla.json); the `my-chinchilla` ID enables the dedicated renderer.

An official KuroCat release would replace the whole app, chinchilla included, so this fork's updater only announces new releases and opens their page; it never installs them. Bring upstream changes in by merging them into this source and rebuilding. Reference photos, local settings, credentials, and generated app bundles are not part of the source changes.

## Changes taken from upstream v5.1.2

Only the fixes that matter here were merged, adapted where they touch the chinchilla:

- macOS: keyboard and mouse input reconnects after the Mac wakes from sleep, and the event tap no longer waits on a blocked keyboard driver;
- macOS: dragging the pet starts straight from the mouse press, so it no longer fails silently;
- a second copy of the app quits instead of showing a second pet;
- the tail no longer buzzes while tail keys are typed in quick succession;
- switching between 2D and 3D recovers when the GPU drops the 3D canvas, and 3D's memory is given back after 8 seconds in 2D;
- an optional 30 fps cap (**帧率上限** in the menu) for battery life.

Left out: the AI companion hooks, MCP face and ear shaping, the five interface languages, removing the cats' 2D shadows, the smaller 3D key textures (their letters break up at small sizes), the grumpy wake-up, the automatic macOS permission reset (it is for ad hoc builds), and fixes for Windows and Linux only.

## Local servers

The MCP server (`127.0.0.1:27420`, on by default) and the OBS browser source (`127.0.0.1:27421`, off by default, streams every key press) only answer programs on this computer. Requests a web page makes are refused with 403: they carry a foreign `Origin`, a cross-site `Sec-Fetch-Site`, or, for a site that points its own name at 127.0.0.1, a foreign `Host`.
