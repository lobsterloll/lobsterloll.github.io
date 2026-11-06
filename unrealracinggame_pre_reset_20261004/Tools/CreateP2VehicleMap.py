"""Create a P2 vehicle test map with three surfaces and simple daylight."""
import unreal

MAP_PATH = "/Game/RacingMVP/Maps/L_P2VehicleTest"
ASSET_ROOT = "/Game/RacingMVP/Materials"


def solid_material(name, rgb, roughness):
    path = ASSET_ROOT + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, ASSET_ROOT, unreal.Material, unreal.MaterialFactoryNew()
    )
    color = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant3Vector, -360, 0
    )
    color.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    unreal.MaterialEditingLibrary.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -360, 180
    )
    rough.set_editor_property("r", roughness)
    unreal.MaterialEditingLibrary.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


def physical_material(name, friction, surface_value):
    path = ASSET_ROOT + "/PM_" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    physical = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        "PM_" + name, ASSET_ROOT, unreal.PhysicalMaterial, unreal.PhysicalMaterialFactoryNew()
    )
    physical.set_editor_property("friction", friction)
    physical.set_editor_property("restitution", 0.05)
    physical.set_editor_property("surface_type", surface_value)
    unreal.EditorAssetLibrary.save_loaded_asset(physical)
    return physical


surface_enum = next((getattr(unreal, candidate) for candidate in ("SurfaceType", "PhysicalSurface", "EPhysicalSurface")
                     if hasattr(unreal, candidate)), None)
if surface_enum:
    values = [getattr(surface_enum, key) for key in dir(surface_enum) if key.upper().endswith(("TYPE1", "TYPE2", "TYPE3"))]
    surface_values = sorted(values, key=lambda item: str(item))[:3]
else:
    surface_values = [1, 2, 3]
if len(surface_values) < 3:
    surface_values = [1, 2, 3]

assets = {
    "Asphalt": (solid_material("M_P2Asphalt", (0.16, 0.17, 0.18), 0.92), physical_material("Asphalt", 1.0, surface_values[0])),
    "Gravel": (solid_material("M_P2Gravel", (0.28, 0.24, 0.16), 0.98), physical_material("Gravel", 0.62, surface_values[1])),
    "Grass": (solid_material("M_P2Grass", (0.11, 0.23, 0.08), 0.95), physical_material("Grass", 0.42, surface_values[2])),
}

if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    if not unreal.EditorLevelLibrary.load_level(MAP_PATH):
        raise RuntimeError("Could not load existing P2 vehicle map")
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if isinstance(actor, (unreal.StaticMeshActor, unreal.PlayerStart,
                              unreal.DirectionalLight, unreal.SkyLight,
                              unreal.SkyAtmosphere, unreal.ExponentialHeightFog)):
            unreal.EditorLevelLibrary.destroy_actor(actor)
else:
    if not unreal.EditorLevelLibrary.new_level(MAP_PATH):
        raise RuntimeError("Could not create P2 vehicle map")

cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
ground = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, -70))
ground.set_actor_label("P2_GrassGround")
ground_component = ground.get_component_by_class(unreal.StaticMeshComponent)
ground_component.set_static_mesh(cube)
ground_component.set_material(0, assets["Grass"][0])
ground_component.set_phys_material_override(assets["Grass"][1])
ground.set_actor_scale3d(unreal.Vector(60, 60, 1))
for lane_name, y in (("Asphalt", 0), ("Gravel", 1000), ("Grass", -1000)):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, y, -65))
    actor.set_actor_label("P2_" + lane_name + "Surface")
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    component.set_static_mesh(cube)
    component.set_material(0, assets[lane_name][0])
    component.set_phys_material_override(assets[lane_name][1])
    actor.set_actor_scale3d(unreal.Vector(50, 5, 1))

for y, label in ((3200, "North"), (-3200, "South")):
    wall = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, y, 80))
    wall.set_actor_label("P2_" + label + "Barrier")
    comp = wall.get_component_by_class(unreal.StaticMeshComponent)
    comp.set_static_mesh(cube)
    comp.set_material(0, assets["Asphalt"][0])
    wall.set_actor_scale3d(unreal.Vector(50, 0.5, 1.5))

start = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(-1800, 0, 165), unreal.Rotator(0, 0, 0))
start.set_actor_label("P2_PlayerStart_Asphalt")
sun = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000), unreal.Rotator(-42, -30, 0))
sun.set_actor_label("P2_DaylightSun")
sun_component = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sun_component.set_editor_property("intensity", 5.0)
sun_component.set_editor_property("atmosphere_sun_light", True)
atmosphere = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
atmosphere.set_actor_label("P2_BlueSkyAtmosphere")
sky = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 500))
sky.set_actor_label("P2_DaylightSkylight")
sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
sky_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sky_component.set_editor_property("real_time_capture", True)
if not unreal.EditorLevelLibrary.save_current_level():
    raise RuntimeError("Could not save P2 vehicle map")
unreal.log("P2 test map created: three material and physical surface lanes")
