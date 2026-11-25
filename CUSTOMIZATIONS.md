# KeyboardPet customizations

This fork builds on [qianyiai/kurocat](https://github.com/qianyiai/kurocat), under its existing [MIT license](LICENSE).

The custom **我家龙猫** (`my-chinchilla`) desktop pet has a warm gray coat, ivory chin and belly, rounded spotted ears, a short pink muzzle, dark glossy eyes, long pale whiskers, and a fuller tail. Its dedicated shape and ear markings are rendered in 3D; the 2D engine uses the matching skin colors. Existing skins remain selectable.

The keyboard's rear edge is raised toward the viewer and the camera is slightly higher, making the key rows and legends easier to see. The pet also has more compact proportions, with its idle paws raised to clear the keyboard.

## Build on macOS

Install Node.js 18+, the stable Rust toolchain, and Xcode Command Line Tools, then run from the repository root:

```sh
npm ci
npm run tauri:build -- --bundles app
```

The application is generated at `src-tauri/target/release/bundle/macos/KuroCat.app`. Quit any running copy before copying the new app to Applications. For development with live reload, run `npm run tauri:dev`.

## Select the chinchilla

Open the pet's right-click menu or tray menu, choose **我家龙猫**, and keep **3D 立体** enabled for the custom model. Its reproducible color configuration is in [`customizations/my-chinchilla.json`](customizations/my-chinchilla.json); the `my-chinchilla` ID enables the dedicated renderer.

The upstream in-app updater installs official KuroCat releases and can replace these customizations. To keep the custom model, update this fork's source and rebuild it instead. Reference photos, local settings, credentials, and generated app bundles are not part of the source changes.
