using System.Diagnostics;
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
    [Fact]
    public void SharedPacketsAdmitOnlySupportedCommandsAndForgetHistoryOnDisconnect()
    {
        var room = new SharedRoom();
        foreach (string input in new[] { "shared\tdr\tq1\t1", "shared\tdr\tw01\t0", "shared\tdr\tL3\t2",
            "shared\tk\tletters", "shared\tother\tignored", "shared\tfall\t1\tNaN\t4", "shared\tm\t " })
            Assert.False(room.Offer(input));
        Assert.Null(room.Next());
        Assert.True(room.Offer("shared\tm\t" + PresencePacket.EncodeName("å\\n   fUcK  fuchsia")));
        var msg = room.Next()!;
        using var payload = JsonDocument.Parse(msg.Json);
        Assert.Equal("å\\n *** fuchsia", payload.RootElement.GetProperty("m").GetString());
        Assert.Equal(2, payload.RootElement.EnumerateObject().Count());
        Assert.True(room.Offer("shared\tm\tHej")); Assert.True(room.Offer("shared\tm\tHej"));
        Assert.False(room.Offer("shared\tm\tHej"));
        Assert.Contains("\tmx", room.Snapshot("self"));
        room.Local("Gäst", "Hej");
        room.Reset();
        Assert.Null(room.Next());
        Assert.DoesNotContain("Hej", room.Snapshot(""));
    }

    [Fact]
    public async Task SharedChatDoorsAndFallUseTheSameLocalWorkerConnection()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var ct = deadline.Token;
        using var reservation = new TcpListener(IPAddress.Loopback, 0);
        reservation.Start();
        int port = ((IPEndPoint)reservation.LocalEndpoint).Port;
        reservation.Stop();
        var start = new ProcessStartInfo("node") { WorkingDirectory = Root(), UseShellExecute = false,
            CreateNoWindow = true, RedirectStandardOutput = true };
        start.ArgumentList.Add("cloudflare/dev.mjs"); start.ArgumentList.Add(port.ToString());
        using var worker = Process.Start(start)!;
        var dir = Directory.CreateTempSubdirectory("lunden-shared-");
        try
        {
            Assert.Contains("localhost", await worker.StandardOutput.ReadLineAsync(ct));
            var endpoint = new Uri($"ws://127.0.0.1:{port}/players");
            async Task<ClientWebSocket> Open(string name)
            {
                var ws = new ClientWebSocket();
                ws.Options.SetRequestHeader("Origin", "https://solwation.github.io");
                await ws.ConnectAsync(new Uri(endpoint + "?n=" + name), ct);
                return ws;
            }
            async Task Send(ClientWebSocket ws, string json) =>
                await ws.SendAsync(Encoding.UTF8.GetBytes(json).AsMemory(), WebSocketMessageType.Text, true, ct);
            Task<JsonElement> Receive(ClientWebSocket ws, string tag) => WaitFor(ws, m => m.GetProperty("t").GetString() == tag, ct);
            using var web = await Open("Webb");
            var welcome = await Receive(web, "w");
            int lives = welcome.GetProperty("c").GetProperty("lives").GetInt32();
            string webId = welcome.GetProperty("i").GetString()!;
            await Send(web, """{"t":"dr","i":"w1","o":1}""");
            await Receive(web, "dr");
            await using var bridge = PlayerBridge.Open(dir.FullName, endpoint);
            async Task<string[]> Shared(Func<string[], bool> ready)
            {
                while (true) {
                    await Sync(bridge, Frame());
                    try {
                        using var stream = new FileStream(Path.Combine(bridge.DirectoryPath, "peers.csv"), FileMode.Open,
                            FileAccess.Read, FileShare.Read | FileShare.Delete);
                        string[] rows = (PresencePacket.Read(stream, "Shared") ?? "").Split('\n');
                        if (ready(rows)) return rows;
                    } catch (FileNotFoundException) { }
                    await Task.Delay(60, ct);
                }
            }
            string[] initial = await Shared(rows => rows[0].EndsWith("\tw1", StringComparison.Ordinal));
            Assert.Equal(lives.ToString(), initial[0].Split('\t')[2]);
            await Sync(bridge, "shared\tk\t1");
            Assert.True((await Receive(web, "k")).GetProperty("on").GetBoolean());
            await Sync(bridge, "shared\tm\tHej FUCK");
            Assert.Equal("Hej ***", (await Receive(web, "m")).GetProperty("m").GetString());
            await Send(web, """{"t":"m","m":"Hallå från webben"}""");
            await Shared(rows => rows.Any(s => s.Contains($"\tm\t{webId}\tWebb\tHallå från webben")));
            await Sync(bridge, "shared\tdr\tw1\t0");
            var shut = await Receive(web, "dr");
            Assert.Equal("w1", shut.GetProperty("i").GetString());
            Assert.Equal(0, shut.GetProperty("o").GetInt32());
            await Sync(bridge, "shared\tdr\tq0\t1");
            await Receive(web, "dr");
            using var later = await Open("Sen");
            var doors = (await Receive(later, "w")).GetProperty("doors");
            Assert.Contains(doors.EnumerateArray(), row => row[0].GetString() == "q0" && row[1].GetInt32() == 1);
            await Sync(bridge, "shared\tfall\t1\t4\t4");
            await Shared(rows => rows[0].Split('\t')[2] == (lives / 2).ToString() && rows.Any(s => s.EndsWith($"\tfall\t1\t{lives / 2}\t0")));
            await Sync(bridge, "shared\tfall\t2\t7\t7");
            await Shared(rows => rows[0].Split('\t')[2] == lives.ToString() && rows.Any(s => s.EndsWith("\tfall\t2\t0\t1")));
        }
        finally
        {
            if (!worker.HasExited) worker.Kill();
            await worker.WaitForExitAsync();
            dir.Delete(true);
        }
    }
}
