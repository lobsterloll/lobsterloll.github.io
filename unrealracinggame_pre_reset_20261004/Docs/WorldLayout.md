# Open world drive map

`L_OpenWorldDrive` is a separate, editable first pass inspired by the broad play spaces of open-world Roblox driving games: a city arterial, a central car-meet/showroom hub, and a drag strip with paddock. It is a stylized procedural blockout built from project geometry. It does not reproduce either game's map or use their assets.

## Open and edit it

1. Open `RacingMVP.uproject` with Unreal Engine 5.8.3.
2. In the Content Drawer, open `/Game/RacingMVP/Maps/L_OpenWorldDrive`.
3. Select level actors in the viewport or World Outliner, move or resize them, and save the level.
4. To keep an untouched starting point, use **Save Current Level As** before editing.

The earlier `L_P3TorontoCity` level remains in the project as a separate version. The default editor and game map is `L_OpenWorldDrive`.

## Regenerate the blockout

`Tools/CreateOpenWorldDriveMap.py` recreates this map through the Unreal Editor Python plugin. Run it with `UnrealEditor-Cmd.exe` as shown in `Docs/Build.md`. Regeneration replaces the generated level, so save a copy first if you have made manual level edits.

This is a starting layout for hands-on map design. The roads, hub, and drag strip are blockout geometry; building variety, detailed props, terrain shaping, and art quality still need iteration in the Editor.
