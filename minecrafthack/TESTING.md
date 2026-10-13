# Validation — Lobster Client 0.1.0

Tested with Minecraft 26.3, Fabric Loader 0.19.5, Fabric API 0.162.0+26.3, Java 25, and Windows graphics rendering.

## Passed

- `build`: Java compilation, mod packaging, four JUnit settings tests.
- `runClientGameTest`: automated in-game checks in a disposable single-player world.
- `runPackagedClientTest`: the same checks using the actual release JAR in a production Fabric launch.
- JAR inspection: correct mod ID/version/dependencies; no test classes in the installable JAR.
- Menu and HUD screenshot inspection: readable controls, all 13 modules, no clipped buttons at the tested 854 × 480 window size.

## In-game assertions

- ESP marks a spawned pig for outline rendering.
- Hitbox Increase adds its client targeting margin.
- Ore Locator finds the placed diamond ore.
- Freecam responds to forward movement while leaving the player body stationary; the rendered camera follows the detached position.
- The GUI's Disable all button clears every module.
- Kill Aura defeats a nearby pig with a diamond sword.
- Veinminer breaks two face-connected diamond ore blocks in creative mode.
- Auto Sprint and Faster Sprint activate sprinting and increase travel distance.
- Water Walk keeps a survival player at the water surface.
- No Fall prevents health loss on a ten-block survival fall in the test world.
- Flight ascends in survival mode.
- No Fall modifies the outgoing movement packet only while enabled; Disable all restores normal packet flags.

Fullbright was enabled during rendered gameplay without a mixin/rendering failure; its brightness was not compared against a reference image. The automated suite does not verify every visual condition, player-versus-player combat, survival veinmining timing, other mods, or dedicated/private servers. These results do not guarantee acceptance by server movement/combat validation.

The production run emits vanilla OS performance-counter and dummy-account/Realms warnings in this environment. It nevertheless completes the single-player tests and exits successfully. No Minecraft account credentials were used by the tests.

Local logs: `work/test3.log` and `work/packaged-test.log`. Screenshots: `build/run/packagedClientTest/screenshots/`. JUnit report: `build/reports/tests/test/index.html`.
