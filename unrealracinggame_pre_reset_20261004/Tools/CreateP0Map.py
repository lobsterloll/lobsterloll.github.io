"""Regenerate the visible P0 daylight smoke-test level in UnrealEditor-Cmd."""
import unreal

MAP_PATH = "/Game/RacingMVP/Maps/L_P0Test"
MATERIAL_PATH = "/Game/RacingMVP/Materials/M_P0Ground"


def solid_material(name, rgb, roughness_value):
    path = "/Game/RacingMVP/Materials/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    material = tools.create_asset(
        name, "/Game/RacingMVP/Materials", unreal.Material,
        unreal.MaterialFactoryNew()
    )
    if not material:
        raise RuntimeError("Could not create " + name)
    color = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant3Vector, -360, 0
    )
    color.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    unreal.MaterialEditingLibrary.connect_material_property(
        color, "", unreal.MaterialProperty.MP_BASE_COLOR
    )
    roughness = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -360, 200
    )
    roughness.set_editor_property("r", roughness_value)
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness, "", unreal.MaterialProperty.MP_ROUGHNESS
    )
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


material = solid_material("M_P0Ground", (0.12, 0.17, 0.13), 0.88)
solid_material("M_P0VehicleBlue", (0.025, 0.16, 0.48), 0.32)
solid_material("M_P0VehicleDark", (0.018, 0.022, 0.03), 0.85)
solid_material("M_P0VehicleGlass", (0.20, 0.32, 0.42), 0.25)
if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    if not unreal.EditorLevelLibrary.load_level(MAP_PATH):
        raise RuntimeError("Could not load existing L_P0Test")
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if isinstance(actor, (unreal.StaticMeshActor, unreal.PlayerStart,
                              unreal.DirectionalLight, unreal.SkyLight,
                              unreal.SkyAtmosphere, unreal.ExponentialHeightFog)):
            unreal.EditorLevelLibrary.destroy_actor(actor)
else:
    if not unreal.EditorLevelLibrary.new_level(MAP_PATH):
        raise RuntimeError("Could not create L_P0Test")

ground = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.StaticMeshActor, unreal.Vector(0, 0, -70)
)
ground.set_actor_label("P0_MatteGround")
ground_mesh = ground.get_component_by_class(unreal.StaticMeshComponent)
ground_mesh.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube.Cube"))
ground_mesh.set_material(0, material)
ground.set_actor_scale3d(unreal.Vector(500, 500, 1))

start = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, unreal.Vector(0, 0, 170), unreal.Rotator(0, 0, 0)
)
start.set_actor_label("P0_ChaosVehicleStart")

sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, unreal.Vector(0, 0, 1000), unreal.Rotator(-42, -30, 0)
)
sun.set_actor_label("P0_DaylightSun")
sun_component = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sun_component.set_editor_property("intensity", 5.0)
sun_component.set_editor_property("atmosphere_sun_light", True)

atmosphere = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyAtmosphere, unreal.Vector(0, 0, 0)
)
atmosphere.set_actor_label("P0_BlueSkyAtmosphere")

sky = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyLight, unreal.Vector(0, 0, 500)
)
sky.set_actor_label("P0_DaylightSkylight")
sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
sky_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sky_component.set_editor_property("real_time_capture", True)

fog = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0)
)
fog.set_actor_label("P0_DaylightHorizonFog")

if not unreal.EditorLevelLibrary.save_current_level():
    raise RuntimeError("Could not save L_P0Test")
unreal.log("P0 daylight map rebuilt: " + MAP_PATH)
