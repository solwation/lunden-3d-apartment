using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Lunden.Launcher.Tests;

public sealed class PlayerRoomBudgetTests
{
    // Give the real ClientWebSocket a deterministic room that records frames and can signal its monthly cap.
    static async Task<(IHost, Uri)> Open(Func<WebSocket,Task> handle)
    {
        var host = new HostBuilder().ConfigureWebHost(web => web.UseKestrel(opts => opts.Listen(IPAddress.Loopback,0))
            .Configure(app => {
                app.UseWebSockets();
                app.Run(async ctx => {
                    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
                    using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
                    try { await handle(socket); } catch (WebSocketException) { }
                });
            })).Build();
        await host.StartAsync();
        var http = host.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        return (host, new UriBuilder(http) { Scheme = "ws", Path = "/players" }.Uri);
    }

    static PresenceFrame Frame(int cm) => PresenceFrame.Read($"1\nKlara\n1203101\n{cm}\n0\n0\n0\n0\n0\n0\n0")!;

    [Fact]
    public async Task MonthlyCapSurvivesLauncherRestart()
    {
        int attempts = 0;
        var (server, endpoint) = await Open(async socket => {
            Interlocked.Increment(ref attempts);
            await socket.CloseOutputAsync((WebSocketCloseStatus)4001, "cap", CancellationToken.None);
        });
        using var host = server;
        var dir = Directory.CreateTempSubdirectory();
        string cap = Path.Combine(dir.FullName, "cap");
        try {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            await using (var first = new PlayerRoom(endpoint, cap)) {
                first.Sync(Frame(0));
                while (!File.Exists(cap)) await Task.Delay(25, deadline.Token);
            }
            await using (var second = new PlayerRoom(endpoint, cap)) {
                for (int i = 0; i < 8; i++) { second.Sync(Frame(i)); await Task.Delay(70, deadline.Token); }
            }
            Assert.Equal(1, attempts);
        } finally { await host.StopAsync(); dir.Delete(true); }
    }

    [Fact]
    public async Task ServerRestartReplacesTheRosterAndSendsTheLatestMovement()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        var ct = deadline.Token;
        var disconnect = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var resumed = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        int attempts = 0;
        var (server, endpoint) = await Open(async socket => {
            int attempt = Interlocked.Increment(ref attempts);
            string welcome = attempt == 1
                ? """{"t":"w","i":"self-old","ps":[{"i":"peer-old","n":"Bord","p":[1,0,1],"r":0}]}"""
                : """{"t":"w","i":"self-new","ps":[{"i":"peer-new","n":"Stol","p":[2,0,2],"r":0}]}""";
            await socket.SendAsync(Encoding.UTF8.GetBytes(welcome).AsMemory(), WebSocketMessageType.Text, true, ct);
            var buffer = new byte[512];
            var frame = await socket.ReceiveAsync(buffer.AsMemory(), ct);
            if (attempt == 1) {
                await disconnect.Task.WaitAsync(ct);
                await socket.CloseOutputAsync((WebSocketCloseStatus)1012, "restart", ct);
            } else {
                resumed.TrySetResult(Encoding.UTF8.GetString(buffer, 0, frame.Count));
                await socket.ReceiveAsync(buffer.AsMemory(), ct);
            }
        });
        using var host = server;
        var dir = Directory.CreateTempSubdirectory();
        try {
            await using var room = new PlayerRoom(endpoint, Path.Combine(dir.FullName,"cap"));
            while (!room.Sync(Frame(0)).Contains("peer-old",StringComparison.Ordinal)) await Task.Delay(30,ct);
            disconnect.SetResult();
            // Move while the transport is down. Keep the game active to exercise the reconnection path.
            while (!resumed.Task.IsCompleted) { room.Sync(Frame(250)); await Task.Delay(30,ct); }
            using var json = System.Text.Json.JsonDocument.Parse(await resumed.Task);
            Assert.Equal(2.5, json.RootElement.GetProperty("p")[0].GetDouble());
            string snapshot;
            do {
                snapshot = room.Sync(Frame(250));
                if (!snapshot.Contains("peer-new",StringComparison.Ordinal)) await Task.Delay(30,ct);
            } while (!snapshot.Contains("peer-new",StringComparison.Ordinal));
            Assert.StartsWith("1\tself-new",snapshot);
            Assert.DoesNotContain("peer-old",snapshot);
            Assert.Equal(2,snapshot.Split('\n').Length);
            Assert.Equal(2,attempts);
        } finally { await host.StopAsync(); dir.Delete(true); }
    }

    [Fact]
    public async Task RapidGameTicksRespectRateSizeAndStillnessBudget()
    {
        var frames = new ConcurrentQueue<(TimeSpan At, string Text)>();
        var clock = Stopwatch.StartNew();
        var (server, endpoint) = await Open(async socket => {
            var buffer = new byte[1024];
            while (socket.State == WebSocketState.Open) {
                var received = await socket.ReceiveAsync(buffer.AsMemory(), CancellationToken.None);
                if (received.MessageType == WebSocketMessageType.Close) break;
                frames.Enqueue((clock.Elapsed, Encoding.UTF8.GetString(buffer, 0, received.Count)));
            }
        });
        using var host = server;
        var dir = Directory.CreateTempSubdirectory();
        try {
            await using var room = new PlayerRoom(endpoint, Path.Combine(dir.FullName, "cap"));
            var stop = TimeSpan.FromSeconds(18);
            while (clock.Elapsed < stop && !frames.Any(f => f.Text == "p")) {
                int moving = (int)Math.Min(2000, clock.ElapsedMilliseconds);
                room.Sync(Frame(moving));
                await Task.Delay(35);
            }
            var recorded = frames.ToArray();
            Assert.Contains(recorded, f => f.Text == "p");
            Assert.All(recorded, f => Assert.InRange(Encoding.UTF8.GetByteCount(f.Text), 1, 256));
            Assert.All(recorded, f => Assert.InRange(recorded.Count(t => t.At >= f.At && t.At < f.At + TimeSpan.FromSeconds(1)), 1, 6));
            var states = recorded.Where(f => f.Text != "p").ToArray();
            Assert.InRange(states.Length, 3, 14);
            Assert.Equal(states[^2].Text, states[^1].Text);
            Assert.True(states[^1].At - states[^2].At >= TimeSpan.FromSeconds(2.8));
        } finally { await host.StopAsync(); dir.Delete(true); }
    }
}
