"""Create a bright amber material for the SportsCar turn signals."""
import unreal


folder = "/Game/Materials"
name = "M_VehicleIndicator"
path = folder + "/" + name
if unreal.EditorAssetLibrary.does_asset_exist(path):
    material = unreal.EditorAssetLibrary.load_asset(path)
else:
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, folder, unreal.Material, unreal.MaterialFactoryNew())
    base = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant3Vector, -350, 0)
    base.set_editor_property("constant", unreal.LinearColor(0.8, 0.3, 0.01, 1))
    unreal.MaterialEditingLibrary.connect_material_property(
        base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    glow = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant3Vector, -350, 150)
    glow.set_editor_property("constant", unreal.LinearColor(6, 1.8, 0.02, 1))
    unreal.MaterialEditingLibrary.connect_material_property(
        glow, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
