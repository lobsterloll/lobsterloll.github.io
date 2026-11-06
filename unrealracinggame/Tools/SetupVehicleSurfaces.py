"""Assign road and grass friction used by the Chaos vehicle wheels."""
import unreal


folder = "/Game/Materials"
for name, material_name, friction in (
    ("PM_CityAsphalt", "M_CityAsphalt", 1.1),
    ("PM_CityGrass", "M_CityGrass", 0.55),
):
    path = folder + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        physical = unreal.EditorAssetLibrary.load_asset(path)
    else:
        physical = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            name, folder, unreal.PhysicalMaterial, unreal.PhysicalMaterialFactoryNew())
    physical.set_editor_property("friction", friction)
    unreal.EditorAssetLibrary.save_loaded_asset(physical)

    material = unreal.EditorAssetLibrary.load_asset(folder + "/" + material_name)
    material.set_editor_property("phys_material", physical)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
