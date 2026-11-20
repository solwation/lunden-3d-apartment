// Lunden (#2243): primary game module. Add dependencies here as features are ported (#2247).
using UnrealBuildTool;

public class Lunden : ModuleRules
{
	public Lunden(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
	}
}
