using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

// #2420: the progress dialog's Swedish text.
public sealed class LauncherUiTests
{
    [Fact]
    public void SizesUseSwedishDecimalsAndWholeMegabytesAboveHundred()
    {
        Assert.Equal("12,5 MB", Ui.Size(25L << 19));
        Assert.Equal("442 MB", Ui.Size(463_898_610));
        Assert.Equal("1,5 GB", Ui.Size(3L << 29));
    }

    [Fact]
    public void ProgressShowsSpeedAndRemainingTimeOnceItHasASample()
    {
        var rate = new Ui.Rate();
        var start = new DateTime(2026, 11, 22, 10, 0, 0, DateTimeKind.Utc);
        long total = 400L << 20;
        Assert.Equal("0,0 MB av 400 MB", rate.Describe(0, total, start));
        Assert.Equal("20,0 MB av 400 MB · 10,0 MB/s · cirka 40 s kvar", rate.Describe(20L << 20, total, start.AddSeconds(2)));
        Assert.Equal("10,0 MB av 1000 MB · 10,0 MB/s · cirka 2 min kvar", Describe(0, 10L << 20, 1000L << 20, start));
        Assert.Equal("400 MB av 400 MB · 10,0 MB/s", Describe(390L << 20, 400L << 20, total, start));
    }

    static string Describe(long from, long to, long total, DateTime at)
    {
        var rate = new Ui.Rate();
        rate.Describe(from, total, at);
        return rate.Describe(to, total, at.AddSeconds(1));
    }
}
