"""Create the simple P1 driving course with UnrealEditor-Cmd's Python runner."""
import unreal

MAP_PATH = "/Game/RacingMVP/Maps/L_P1Test"

if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    unreal.log("P1 map exists; preserving it")
else:
    if not unreal.EditorLevelLibrary.new_level(MAP_PATH):
        raise RuntimeError("Could not create L_P1Test")

    cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")

    def block(name, location, scale):
        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
            unreal.StaticMeshActor, unreal.Vector(*location)
        )
        actor.set_actor_label(name)
        actor.get_component_by_class(unreal.StaticMeshComponent).set_static_mesh(cube)
        actor.set_actor_scale3d(unreal.Vector(*scale))
        return actor

    block("P1_DrivingPad", (0, 0, -65), (80, 80, 1))
    # Large straight braking run and a turn around boundary markers.
    block("P1_NorthBarrier", (0, 3900, 35), (80, 1, 2))
    block("P1_SouthBarrier", (0, -3900, 35), (80, 1, 2))
    block("P1_EastBarrier", (3900, 0, 35), (1, 80, 2))
    block("P1_WestBarrier", (-3900, 0, 35), (1, 80, 2))
    for index, x in enumerate(range(700, 3500, 700)):
        block("P1_BrakeMarker_" + str(index), (x, -1200, 0), (0.15, 0.8, 0.3))

    start = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.PlayerStart, unreal.Vector(0, 0, 180), unreal.Rotator(0, 0, 0)
    )
    start.set_actor_label("P1_PlayerStart")
    sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.DirectionalLight, unreal.Vector(0, 0, 1200), unreal.Rotator(-40, -35, 0)
    )
    sun.set_actor_label("P1_Sun")
    sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property(
        "mobility", unreal.ComponentMobility.MOVABLE
    )
    sky = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0, 0, 800)
    )
    sky.set_actor_label("P1_SkyLight")
    sky.get_component_by_class(unreal.SkyLightComponent).set_editor_property(
        "mobility", unreal.ComponentMobility.MOVABLE
    )
    if not unreal.EditorLevelLibrary.save_current_level():
        raise RuntimeError("Could not save L_P1Test")
    unreal.log("Created P1 driving map: " + MAP_PATH)
