// Lunden (#2243): minimal Automation Test so tools/ue/ue-test.ps1 has a project test to run (filter "Lunden.").
#include "Misc/AutomationTest.h"
#include "Modules/ModuleManager.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLundenSmokeModuleLoadedTest, "Lunden.Smoke.ModuleLoaded",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLundenSmokeModuleLoadedTest::RunTest(const FString& Parameters)
{
	TestTrue(TEXT("The Lunden game module is loaded"), FModuleManager::Get().IsModuleLoaded(TEXT("Lunden")));
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
