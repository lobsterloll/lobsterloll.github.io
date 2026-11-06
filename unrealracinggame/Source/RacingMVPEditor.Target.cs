using UnrealBuildTool;

public class RacingMVPEditorTarget : TargetRules
{
    public RacingMVPEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("RacingMVP");
    }
}
