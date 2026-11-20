// Lunden (#2243): editor target, built by tools/ue/ue-build-editor.ps1.
using UnrealBuildTool;
using System.Collections.Generic;

public class LundenEditorTarget : TargetRules
{
	public LundenEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Lunden");
	}
}
