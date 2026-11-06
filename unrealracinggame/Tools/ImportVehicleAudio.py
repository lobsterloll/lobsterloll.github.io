import unreal
from pathlib import Path


source = Path(__file__).resolve().parents[1] / "SourceAssets" / "Audio"
destination = "/Game/Audio"
for name, extension, loop in (("SW_EngineIdle", ".wav", True),
                              ("SW_EngineHigh", ".wav", True),
                              ("SW_Wind", ".ogg", True),
                              ("SW_TireSkid", ".wav", True),
                              ("SW_Collision", ".ogg", False)):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(source / (name + extension)))
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    sound = unreal.EditorAssetLibrary.load_asset(destination + "/" + name)
    if not sound:
        raise RuntimeError("Audio import failed: " + name)
    sound.set_editor_property("looping", loop)
    unreal.EditorAssetLibrary.save_loaded_asset(sound)
