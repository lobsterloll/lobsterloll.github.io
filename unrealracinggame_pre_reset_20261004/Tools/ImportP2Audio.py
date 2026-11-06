"""Import generated P2 WAV loops into the game's runtime content."""
import os
import unreal

project_root = unreal.Paths.project_dir()
source_dir = os.path.join(project_root, "Content", "RacingMVP", "Audio", "Sources")
assets = unreal.AssetToolsHelpers.get_asset_tools()
for name in ("SW_EngineLoop", "SW_TireLoop", "SW_WindLoop", "SW_GravelLoop"):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.join(source_dir, name + ".wav"))
    task.set_editor_property("destination_path", "/Game/RacingMVP/Audio")
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    assets.import_asset_tasks([task])
    if not unreal.EditorAssetLibrary.does_asset_exist("/Game/RacingMVP/Audio/" + name):
        raise RuntimeError("Failed to import " + name)
unreal.log("P2 audio imported: engine, tire, wind and gravel loops")
