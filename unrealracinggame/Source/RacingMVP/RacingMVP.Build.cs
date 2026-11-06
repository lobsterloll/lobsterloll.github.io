using UnrealBuildTool;

public class RacingMVP : ModuleRules
{
    public RacingMVP(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] {
            "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "ChaosVehicles"
        });
    }
}
