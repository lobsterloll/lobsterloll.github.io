# Validation — Lobster Client 0.1.6

Tested with Minecraft 26.3, Fabric Loader 0.19.5, Fabric API 0.162.0+26.3, Java 25, and Windows graphics rendering.

## Passed

- `build`: Java compilation, mod packaging, four JUnit settings tests.
- `runPackagedClientTest`: automated in-game checks using the actual release JAR in a production Fabric launch.
- JAR inspection: correct mod ID/version/dependencies; no test classes in the installable JAR.
- Menu and HUD screenshot inspection: readable controls, all 13 modules, no clipped buttons at the tested 854 × 480 window size.

## In-game assertions

- ESP marks a spawned pig for outline rendering.
- Hitbox Increase adds a 4-block client targeting margin and draws the enlarged box in the captured gameplay screenshot.
- Ore Locator finds the placed diamond ore and an emerald ore beyond the old 24-block radius while scanning loaded chunks; its HUD screenshot has no side list of ore coordinates.
- Freecam responds to forward movement while leaving the player body stationary; the rendered camera follows the detached position.
- The GUI's Disable all button clears every module.
- Kill Aura defeats a nearby pig within 30 game ticks in survival mode with a diamond sword while the player faces away and never presses attack.
- With the matching server mod, Veinminer breaks a twelve-block diamond ore vein within five game ticks after the first ore breaks. The vein includes diagonal and distant blocks; adjacent stone remains, and the pickaxe takes normal wear.
- Without server support, Veinminer automatically mines reachable ore at normal speed after the first block, while keeping distant ore queued until the player moves closer. This fallback was checked in the earlier packaged run logged at `work/vein-auto-test.log`.
- Auto Sprint and Faster Sprint activate sprinting and increase travel distance.
- Water Walk keeps a survival player at the water surface with less than 0.04 blocks of vertical movement while walking for 30 game ticks.
- No Fall prevents health loss on a ten-block survival fall in the test world.
- Flight ascends in survival mode, holds height with the module menu open for 40 game ticks, and ascends again after closing it.
- No Fall modifies the outgoing movement packet only while enabled; Disable all restores normal packet flags.

Fullbright was enabled during rendered gameplay without a mixin/rendering failure; its brightness was not compared against a reference image. The automated suite does not verify every visual condition, player-versus-player combat, other mods, or a remote dedicated/private server. These results do not guarantee acceptance by server movement/combat validation.

The production run emits vanilla OS performance-counter and dummy-account/Realms warnings in this environment. It nevertheless completes the single-player tests and exits successfully. No Minecraft account credentials were used by the tests.

Local logs: `work/ore-locator-test.log` and `work/vein-auto-test.log`. Screenshots: `build/run/packagedClientTest/screenshots/`. JUnit report: `build/reports/tests/test/index.html`.
