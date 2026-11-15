# TurboWarp Plus Editor Sprite Panes

[日本語](README.ja.md)

The panes inside a sprite or stage editing tab of TurboWarp Plus Editor. Each pane is a React component that receives the selected target's data and reports edits through callbacks. Arranging the panes into tabs and splits is the job of `@kubohiroya/turbowarp-plus-editor-layout`.

## Panes

| Export | Role |
| --- | --- |
| `./sprite-asset-pane` | `SpriteAssetPane` previews costumes or sounds and keeps the selection while the pane is inactive. In the variables section it lists variables, commits a value edit once, and opens a Scratch-style dialog to create, rename or delete a variable. `NativeAssetPanel` hosts the GUI's own asset list |
| `./sprite-message-pane` | `SpriteMessagePane` lists, in a sent group and a received group, which message each block broadcasts and which hat waits for it. Messages that are only sent, only received, or unused by this target are marked. On the stage it also draws the whole project as target, message, target, and renames a message from the list or the diagram |
| `./sprite-function-pane` | `SpriteFunctionPane` lists the custom block definitions (functions) of a sprite or the stage as an accordion, ordered by name, in Z order (rows) or in N order (columns), or as a call graph that flows left to right (LR) or top to bottom (TD), where a function opens in a dialog. Each open item gives the host an element to mount an editor of that definition script; `readTargetFunctions` reads the definitions from a VM target |
| `./sprite-properties` | `SpritePropertiesPanel` is the properties form. It reflows with the pane width, rejects stale edits when the selected sprite changes, and applies updates to the VM. `createSpriteInfoAdapter` connects it to the GUI's sprite info |
| `./sprite-editor-toolbar` | `SpriteEditorToolbar` is the vertical rail that switches between Code, Costumes or Backdrops, Sounds, Variables and Messages, with a search box for the active section |
| `./temporary-variables` | `readTemporaryVariables` collects the variables of the Temporary Variables extension (`lmsTempVars2`) that the code names with fixed text: thread variables, and on the stage also runtime variables, with their read and write counts and the functions (custom blocks) that set them. For runtime variables it also collects, across sprites, the functions that read them and the functions that change or delete them. While the debugger has paused the project, it adds the values at that moment, including variables whose names are built at run time. `watchTemporaryVariables` reports pauses, resumes and value changes during a pause. `SpriteAssetPane` lists them as Thread Variables and Runtime Variables after the sprite or global variables |
| `./native-tile-title` | `observeTileNameTitles` gives each tile of the GUI's sprite list a tooltip with its full name, also when the list replaces its tiles later |

Each pane with a stylesheet exports it as `<pane>.css`. Load it as a global stylesheet. Labels are in English, or in Japanese when `locale` starts with `ja`.

Reading messages and editing variables come from `@kubohiroya/turbowarp-plus-editor-project-model`, so these panes and the Editor's project search judge a project the same way.

React 16.14 or later is supported, because the Editor mounts these panes in the GUI's React 16.

## Verification

Run `npm test` to build the package, check that it uses no React API newer than 16.14, and test the message pane and the sprite info adapter. Run `npm run test:browser` to drive the asset pane, the properties form and the toolbar in Chromium.

`.github/workflows/release.yml` publishes to npm when the version in `package.json` is not on npm yet, after the tests pass. It authenticates with npm's trusted publisher (OIDC), so npm's configuration records this workflow's filename.

## License

MPL-2.0. These panes were split out of `@kubohiroya/turbowarp-plus-editor-layout`, whose history this repository keeps. The properties form came from the previous sprite properties source at `80825f7`. They carry no GPL code and import no GPL module.
