using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Lunden.Launcher;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed partial class PlayerBridgeTests
{
    // Both the stock launcher CI checkout and a local checkout contain these same wire fixtures.
    static string Root()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "tools/unreal-engine/wire/players.json"))) return dir.FullName;
        throw new FileNotFoundException("The repository wire fixtures are required.");
    }

    static string Frame(string name = "Klara", string appearance = "120310101175u1",
        double x = -450, double y = 725, double z = 120, double yaw = 0, double pitch = 0,
        bool crouched = false, int pose = 0, double headYaw = 0) =>
        FormattableString.Invariant($"1\n{name}\n{appearance}\n{x}\n{y}\n{z}\n{yaw}\n{pitch}\n{(crouched ? 1 : 0)}\n{pose}\n{headYaw}");

    [Fact]
    public void BothDirectionsUseTheSharedRoomCoordinates()
    {
        using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(Root(), "tools/unreal-engine/wire/players.json")));
        foreach (var row in fixtures.RootElement.GetProperty("coordinates").GetProperty("cases").EnumerateArray())
        {
            var web = row.GetProperty("web");
            var ue = row.GetProperty("unreal");
            var peer = new RoomPeer().Update(web);
            var feet = ue.GetProperty("feetCm").EnumerateArray().Select(v => v.GetDouble()).ToArray();
            Assert.Equal(feet, peer.Position!);
            Assert.InRange(Math.Abs(peer.Yaw - ue.GetProperty("yawDeg").GetDouble()), 0, .01);
            double pitch = ue.TryGetProperty("pitchDeg", out var a) ? a.GetDouble() : 0;
            double headYaw = ue.TryGetProperty("headYawDeg", out var b) ? b.GetDouble() : 0;
            Assert.InRange(Math.Abs(pitch - peer.Pitch), 0, .01);
            Assert.InRange(Math.Abs(headYaw - peer.HeadYaw), 0, .01);
            var local = Frame(x: feet[0], y: feet[1], z: feet[2], yaw: peer.Yaw, pitch: pitch,
                pose: headYaw == 0 ? 0 : 1, headYaw: headYaw);
            var state = PresenceFrame.Read(local)!;
            using var payload = JsonDocument.Parse(state.Message);
            var m = payload.RootElement;
            Assert.Equal(web.GetProperty("p").EnumerateArray().Select(v => v.GetDouble()), state.Position);
            Assert.InRange(Math.Abs(web.GetProperty("r").GetDouble() - state.Yaw), 0, .001);
            if (web.TryGetProperty("look", out var look))
                for (int i = 0; i < 2; i++) Assert.InRange(Math.Abs(look[i].GetDouble() - m.GetProperty("look")[i].GetDouble()), 0, .001);
            Assert.InRange(Encoding.UTF8.GetByteCount(state.Message), 1, 256);
        }
        var first = PresenceFrame.Read(Frame())!;
        Assert.False(PresenceFrame.Read(Frame(x: -449))!.ChangedFrom(first));
        Assert.True(PresenceFrame.Read(Frame(x: -447))!.ChangedFrom(first));
        Assert.Null(PresenceFrame.Read(Frame(x: double.NaN)));
        Assert.Null(PresenceFrame.Read(Frame(name: "not\na\nname")));
    }

    [Fact]
    public void ListenerReceivesValidJsonThroughTheStockStringTableEscapes()
    {
        const string name = "Åsa ' \" " + @"literal\n" + " and a tab\t";
        var source = JsonSerializer.SerializeToElement(new { t = "j", i = "1234abcd", n = name, unrelated = "omitted" });
        string payload = PlayerRoom.EventPayload(source);
        string text = PresencePacket.Write("1\tself", "1\tj\t1234abcd\t" + payload);
        using var table = new MemoryStream(Encoding.UTF8.GetBytes(text));
        var row = PresencePacket.Read(table, "Events")!.Split('\t');
        Assert.Equal(4, row.Length);
        using var result = JsonDocument.Parse(row[3]);
        Assert.Equal(name, result.RootElement.GetProperty("n").GetString());
        Assert.False(result.RootElement.TryGetProperty("unrelated", out _));
    }

    static int nextPacket;

    static async Task<string> Sync(PlayerBridge bridge, string body)
    {
        string input = Path.Combine(bridge.DirectoryPath, $"game-{Interlocked.Increment(ref nextPacket)}.csv");
        await File.WriteAllTextAsync(input, PresencePacket.Write(body), Encoding.Unicode);
        string output = Path.Combine(bridge.DirectoryPath, "peers.csv");
        try {
            using var stream = new FileStream(output, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
            return PresencePacket.Read(stream) ?? "";
        } catch (FileNotFoundException) { return ""; }
    }

    [Fact]
    public void ReadsNativeEditorAndShippingStringTables()
    {
        string name = "Åsa, O'Neil %25 " + (char)92 + "n";
        Assert.Equal(name, PresencePacket.DecodeName(PresencePacket.EncodeName(name)));
        string packet = Frame(name: PresencePacket.EncodeName(name));
        string csv = PresencePacket.Write(packet);
        foreach (Encoding encoding in new[] { Encoding.UTF8, Encoding.Unicode }) {
            foreach (string file in new[] { csv, csv.Replace("Key,SourceString", "Key,SourceString,DevNotes").TrimEnd() + ",\"\"\n" }) {
                using var stream = new MemoryStream(encoding.GetPreamble().Concat(encoding.GetBytes(file)).ToArray());
                Assert.Equal(packet, PresencePacket.Read(stream));
                Assert.Equal(name, PresenceFrame.Read(packet)!.Name);
            }
        }
    }

    static async Task<string[]> Until(Func<Task<string>> sample, Func<string[], bool> accept, CancellationToken ct)
    {
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var rows = (await sample()).Split('\n');
            if (accept(rows)) return rows;
            await Task.Delay(80, ct);
        }
    }

    static async Task<JsonElement> WaitFor(ClientWebSocket ws, Func<JsonElement, bool> accept, CancellationToken ct)
    {
        var buffer = new byte[4096];
        using var packet = new MemoryStream();
        while (true)
        {
            var result = await ws.ReceiveAsync(buffer.AsMemory(), ct);
            Assert.Equal(WebSocketMessageType.Text, result.MessageType);
            packet.Write(buffer, 0, result.Count);
            if (!result.EndOfMessage) continue;
            string text = Encoding.UTF8.GetString(packet.ToArray());
            packet.SetLength(0);
            if (text == "q") continue;
            using var doc = JsonDocument.Parse(text);
            if (accept(doc.RootElement)) return doc.RootElement.Clone();
        }
    }

    [Fact]
    public async Task LauncherAndWebPeerExchangeMovementAndResumeOneIdentityOnLocalWorker()
    {
        string? engine = Environment.GetEnvironmentVariable("LUNDEN_TEST_UE_EDITOR");
        bool browsers = engine != null || Environment.GetEnvironmentVariable("LUNDEN_TEST_BROWSER_PEERS") == "1";
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(engine != null ? 300 : browsers ? 120 : 25));
        var ct = deadline.Token;
        using var reservation = new TcpListener(IPAddress.Loopback, 0);
        reservation.Start();
        int port = ((IPEndPoint)reservation.LocalEndpoint).Port;
        reservation.Stop();
        var start = new ProcessStartInfo("node")
        {
            WorkingDirectory = Root(),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true
        };
        start.Environment["LUNDEN_DEV_LOOPBACK"] = "1";
        start.ArgumentList.Add("cloudflare/dev.mjs");
        start.ArgumentList.Add(port.ToString(CultureInfo.InvariantCulture));
        using var worker = Process.Start(start)!;
        var dir = Directory.CreateTempSubdirectory("lunden-players-");
        try
        {
            Assert.Contains("localhost", await worker.StandardOutput.ReadLineAsync(ct));
            var endpoint = new Uri($"ws://127.0.0.1:{port}/players");
            await using (var bridge = PlayerBridge.Open(dir.FullName, endpoint))
            {
                using var web = new ClientWebSocket();
                web.Options.SetRequestHeader("Origin", "https://solwation.github.io");
                await web.ConnectAsync(new Uri(endpoint + "?n=" + Uri.EscapeDataString(@"Webb\n")), ct);
                var welcome = await WaitFor(web, e => e.GetProperty("t").GetString() == "w", ct);
                Assert.Empty(welcome.GetProperty("ps").EnumerateArray());
                string webId = welcome.GetProperty("i").GetString()!;
                var rows = await Until(() => Sync(bridge, Frame()), r => r[0].Length > 2, ct);
                string nativeId = rows[0][2..];
                var other = await WaitFor(web, e => e.GetProperty("t").GetString() == "s" && e.GetProperty("i").GetString() == nativeId, ct);
                Assert.Equal(new[] { -4.5, 1.2, 7.25 }, other.GetProperty("p").EnumerateArray().Select(n => n.GetDouble()));
                Assert.Equal("120310101175", other.GetProperty("av").GetString());
                Assert.Equal("u1", other.GetProperty("ax").GetString());
                await web.SendAsync(Encoding.UTF8.GetBytes("""{"p":[1,0.45,1],"r":3.14,"pose":1,"look":[0.4,-0.3],"av":"1203101"}""").AsMemory(), WebSocketMessageType.Text, true, ct);
                rows = await Until(() => Sync(bridge, Frame()), r => r.Length == 2, ct);
                var peer = rows[1].Split('\t');
                Assert.Equal(new[] { webId, @"Webb%5Cn", "1203101", "100", "100", "45" }, peer[..6]);
                Assert.Equal("1", peer[10]);
                using (var stream = File.Open(Path.Combine(bridge.DirectoryPath, "peers.csv"), FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete)) {
                    var eventRows = PresencePacket.Read(stream, "Events")!.Split('\n').Select(row => row.Split('\t')).ToArray();
                    Assert.All(eventRows, row => Assert.Equal(4, row.Length));
                    Assert.Contains(eventRows, row => row[1] == "w" && row[2] == nativeId);
                    var movement = eventRows.Last(row => row[1] == "s" && row[2] == webId);
                    using var payload = JsonDocument.Parse(movement[3]);
                    Assert.Equal("1203101", payload.RootElement.GetProperty("av").GetString());
                }
                Assert.InRange(double.Parse(peer[11], CultureInfo.InvariantCulture), -22.93, -22.90);
                await Sync(bridge, "away");
                await WaitFor(web, e => e.TryGetProperty("aw", out var value) && value.GetInt32() == 1, ct);
                rows = await Until(() => Sync(bridge, Frame(x: 210)), r => r[0] == "1\t" + nativeId && r.Length == 2, ct);
                Assert.Equal(nativeId, rows[0][2..]);
                await WaitFor(web, e => e.GetProperty("t").GetString() == "s" && e.GetProperty("i").GetString() == nativeId &&
                    e.GetProperty("p")[0].GetDouble() == 2.1, ct);
                await web.CloseAsync(WebSocketCloseStatus.NormalClosure, "", ct);
                await Until(() => Sync(bridge, Frame(x: 210)), r => r.Length == 1, ct);
            }
            if (browsers) {
                await using var bridge = PlayerBridge.Open(dir.FullName, endpoint);
                using var editor = engine == null ? null : new LiveNetworkEditor(engine, Root(), dir.FullName, bridge);
                if (editor != null) await editor.Ready(bridge.DirectoryPath, ct);
                var test = new ProcessStartInfo("node") { WorkingDirectory = Root(), UseShellExecute = false, CreateNoWindow = true };
                test.ArgumentList.Add("tools/unreal-engine/tests/network-browser-peers.cjs");
                test.ArgumentList.Add(port.ToString(CultureInfo.InvariantCulture));
                test.ArgumentList.Add(bridge.DirectoryPath);
                if (editor != null) test.ArgumentList.Add("pie");
                using var browserTest = Process.Start(test)!;
                try {
                    await browserTest.WaitForExitAsync(ct);
                    Assert.Equal(0, browserTest.ExitCode);
                    if (editor != null) await editor.Verify(ct);
                } finally {
                    if (!browserTest.HasExited) browserTest.Kill(entireProcessTree: true);
                }
            }
        }
        finally
        {
            if (!worker.HasExited) worker.Kill();
            await worker.WaitForExitAsync();
            dir.Delete(true);
        }
    }
}
