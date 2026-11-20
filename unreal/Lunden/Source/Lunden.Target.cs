// Lunden (#2243): game target (packaged Windows client).
using UnrealBuildTool;
using System.Collections.Generic;

public class LundenTarget : TargetRules
{
	public LundenTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		// ASSUMPTION: "Latest" is safe because the engine is locked to one 5.8 hotfix (ENGINE_VERSION). If UBT
		// suggests an explicit BuildSettingsVersion/EngineIncludeOrderVersion on first build, pin it here.
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Lunden");
	}
}
