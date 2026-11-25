# KeyboardPet customizations

This fork builds on [qianyiai/kurocat](https://github.com/qianyiai/kurocat), under its existing [MIT license](LICENSE).

The custom **我家龙猫** (`my-chinchilla`) is a cream sticker-style chinchilla, drawn the same way in 2D and 3D: a one-piece dumpling body with a scalloped chest, freckled ears, pale brow dots, glossy eyes, a pink nose, a cloud tail, a thin cocoa outline and a white die-cut border. It tucks its paws up in front of its chest when idle, hugs a heart while being petted, and covers its eyes while a password is typed. It also brings a milk-tea keyboard and mouse, cream headphones and matching key bubbles; other skins keep the original desk.

Its body is one rigid plush that rocks and nods but never stretches, so its shape and belly stay the same in every pose. It leans back to look up at the raised 3D camera, which keeps the face level and the drawn proportions. Ears and tail sit behind the silhouette, the arms are one piece with their paws and run straight into them without a pinched wrist, and each paw presses the keys on its own side, so parts do not poke through one another. In smart tail mode the tail only presses nearby keys on the right: the cloud swings round the outside of the body on a stalk and pats the key. Keys chosen for the tail on the left are pressed from the left: the tail crosses over behind the body, so it never sweeps across the belly.

At launch the desktop window draws nothing until the saved pet is known, so the default cat no longer flashes by first.

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

The upstream in-app updater installs official KuroCat releases and can replace these customizations. To keep the custom model, update this fork's source and rebuild it instead. Reference photos, local settings, credentials, and generated app bundles are not part of the source changes.
