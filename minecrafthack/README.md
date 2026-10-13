# Lobster Client — Minecraft 26.3

A small Fabric client mod for single-player and permitted private servers.
This MVP provides 13 toggles, a module menu, saved settings, and an all-off key.

## Install

1. Run Minecraft **Java Edition 26.3** once and close it.
2. Install **Fabric Loader 0.19.5 or newer** for **26.3** using the [Fabric installer](https://fabricmc.net/use/installer/).
3. Download [Fabric API **0.162.0+26.3**](https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.162.0%2B26.3/fabric-api-0.162.0%2B26.3.jar).
4. Set the Fabric profile's game directory to a folder on D:, such as `D:\Minecraft\Lobster-26.3`. Put that Fabric API JAR and `lobster-client-0.1.0.jar` in its `mods` folder.
5. Launch the **Fabric 26.3** profile and enter a world. Use the launcher's bundled **Java 25**, or configure a Java 25 runtime in a third-party launcher.

The mod JAR is in `build/libs/`. Do not install the `-sources.jar`. This is a client-only mod; do not place it in a dedicated server's mods folder.

## Controls

| Control | Action |
| --- | --- |
| Right Shift | Open/close module menu |
| F6 | Toggle Freecam |
| End | Disable every module |
| Escape / Done | Close menu |
| WASD / Space / Shift | Move, ascend, descend in Freecam or Flight |
| Ctrl while using Freecam | Move camera faster |

Rebind the three mod shortcuts under Options → Controls → Key Binds → Lobster Client. Movement uses your existing Minecraft key bindings. Hover over a module for its description. Only HUD is enabled on first launch. Settings are saved in `config/lobster-client.properties`; Freecam is never restored on launch and switches off when the world changes or the player dies.

## Modules and MVP limits

| Module | Behavior |
| --- | --- |
| Fullbright | Brightens the client lightmap, including dark caves. Does not change block light or apply a potion effect. |
| ESP | Vanilla glowing outlines on loaded mobs and other players, visible through walls. |
| Ore Locator | Scans a 49 × 49 × 49 cube centered on the player, spread over about two seconds. Shows coordinates and screen markers for up to eight nearest ore types, including ancient debris. Requires HUD enabled. |
| Freecam | A detached, noclip camera with independent mouse look. Player movement input and attack/use actions are suppressed; the body remains affected by gravity, damage, and the world. Only already loaded chunks are visible. |
| Auto Sprint | Automatically sprints while moving forward when normal hunger and movement conditions allow. |
| Faster Sprint | Increases horizontal sprint velocity to about 0.42 blocks per tick. Enable Auto Sprint or hold your sprint key. |
| Flight | Sets movement velocity for directional flight and hovering; 0.65 blocks per tick. |
| Water Walk | Holds the player near the water surface. Hold sneak to dive. Does not lift a player from deep underwater. |
| No Fall | Marks outgoing movement as grounded while falling more than two blocks. This is a server-dependent packet technique, not guaranteed damage immunity. |
| Veinminer | Hold attack on an ore block to queue up to 64 face-connected blocks of the same ore. Mines sequentially with the held tool, within normal reach, at normal mining speed. Release attack to stop. |
| Kill Aura | Attacks the closest living mob or other player within normal entity reach and line of sight, at full attack cooldown. Skips teammates/allies. Includes passive mobs. |
| Hitbox Increase | Adds a 0.35-block margin to client targeting boxes for mobs and other players. Does not change server collision boxes or server reach validation. |
| HUD | Coordinates, active modules, ore results, and projected ore markers. |

Servers remain authoritative. Flight, speed, water walking, no-fall packets, targeting, mining, and combat can be corrected or rejected by server rules. Client-only code cannot guarantee those behaviors on arbitrary servers. Ore Locator can only see block information sent to the client; it cannot recover hidden or replaced ore data. This MVP does not provide Meteor's full feature set or anti-cheat bypasses.

## Build and test

Requires a **JDK 25**. The project pins Minecraft 26.3, Fabric Loader 0.19.5, Fabric API 0.162.0+26.3, Loom 1.17.21, and Gradle 9.6.0. See [Fabric's 26.3 compatibility guidance](https://fabricmc.net/2026/09/15/263.html).

```powershell
$env:JAVA_HOME = 'D:\path\to\jdk-25' # Optional when using the downloaded workspace JDK.
.\build.ps1 build
.\build.ps1 runClientGameTest
.\build.ps1 runPackagedClientTest
```

`build` compiles the mod, creates the JAR, and runs settings tests. The separate client game test starts Minecraft, creates a disposable single-player world, exercises modules, and captures menu/HUD screenshots. `runPackagedClientTest` runs those checks against the packaged mod JAR in a production Fabric launch. Test code is excluded from the installable mod JAR; do not install the `-gametest.jar`. A graphical desktop and supported graphics driver are required for the client tests.

For this workspace, the downloaded development JDK is in `work/tools/jdk-25.0.4.1+1`; it is not included in the mod or committed. `build.ps1` uses that JDK when `JAVA_HOME` is unset and keeps Gradle downloads/caches in `work/gradle-user-home` and temporary files in `work/tmp`, all on D:. Use this script instead of invoking Gradle directly. Build caches, downloaded tools, and test worlds are ignored. Run `graft build` after significant code changes to refresh the repository graph.
