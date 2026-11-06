using UnrealBuildTool;

public class RacingMVP : ModuleRules
{
    public RacingMVP(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicIncludePaths.Add(ModuleDirectory);
        PublicDependencyModuleNames.AddRange(new[] {
            "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "UMG", "ChaosVehicles", "PhysicsCore", "Niagara"
        });
    }
}
