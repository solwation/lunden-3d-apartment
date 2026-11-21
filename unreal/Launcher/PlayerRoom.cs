using System.Globalization;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Lunden.Launcher;

// The local game sends feet in centimetres and control rotation in degrees. Only public presence fields go on /players.
internal sealed record PresenceFrame(string Name, string Message, string Look, string Posture, double[] Position, double Yaw, double Pitch, double HeadYaw)
{
    internal bool ChangedFrom(PresenceFrame? previous)
    {
        if (previous == null || Name != previous.Name || Look != previous.Look || Posture != previous.Posture)
            return true;
        double distanceSquared = Position.Zip(previous.Position, (a, b) => (a - b) * (a - b)).Sum();
        static double Turn(double a, double b) => Math.Abs(Math.IEEERemainder(a - b, 2 * Math.PI));
        return distanceSquared > 0.02 * 0.02 || Turn(Yaw, previous.Yaw) > 0.03
            || Turn(Pitch, previous.Pitch) > 0.03 || Turn(HeadYaw, previous.HeadYaw) > 0.03;
    }

    internal static PresenceFrame? Read(string body)
    {
        string[] f = body.Split('\n');
        if (f.Length != 11 || f[0] != "1" || f[9] is not ("0" or "1" or "2")) return null;
        string name = PresencePacket.DecodeName(f[1]).Trim(), look = f[2];
        if (name.Length > 20 || name.Any(char.IsControl) || look.Length > 100 ||
            look.Any(c => !char.IsAsciiLetterOrDigit(c)) || f[8] is not ("0" or "1")) return null;
        var v = new double[6];
        for (int i = 0; i < v.Length; i++)
            if (!double.TryParse(f[i == 5 ? 10 : i + 3], NumberStyles.Float, CultureInfo.InvariantCulture, out v[i]) ||
                !double.IsFinite(v[i]) || Math.Abs(v[i]) > 1e7) return null;
        static double R(double x) => Math.Round(x, 3);
        double[] position = [R(v[0] / 100), R(v[2] / 100), R(v[1] / 100)];
        double yaw = R(Math.IEEERemainder(-90 - v[3], 360) * Math.PI / 180);
        double pitch = R(v[4] * Math.PI / 180);
        double headYaw = f[9] == "1" ? R(-v[5] * Math.PI / 180) : 0;
        var state = new Dictionary<string, object>
        {
            ["p"] = position,
            ["r"] = yaw,
        };
        if (f[9] != "2") state["look"] = new[] { headYaw, pitch };
        if (f[8] == "1") state["c"] = true;
        if (f[9] != "0") state["pose"] = int.Parse(f[9], CultureInfo.InvariantCulture);
        int digits = look.TakeWhile(char.IsAsciiDigit).Count();
        if (digits > 0)
        {
            state["av"] = look[..digits];
            if (digits < look.Length) state["ax"] = look[digits..];
        }
        string json = JsonSerializer.Serialize(state);
        return Encoding.UTF8.GetByteCount(json) <= 256 ? new(name, json, look, f[8] + f[9], position, yaw, pitch, headYaw) : null;
    }
}

internal sealed record RoomPeer(string Name = "", string Appearance = "", double[]? Position = null,
    double Yaw = 0, double Pitch = 0, bool Crouched = false, bool Away = false, int Pose = 0, double HeadYaw = 0)
{
    internal RoomPeer Update(JsonElement row)
    {
        string Text(string key, string fallback) => row.TryGetProperty(key, out var f) && f.ValueKind == JsonValueKind.String
            ? new string((f.GetString() ?? "").Where(c => !char.IsControl(c)).Take(120).ToArray()) : fallback;
        string name = Text("n", Name);
        bool away = row.TryGetProperty("aw", out var aw) && aw.ValueKind == JsonValueKind.Number && aw.TryGetInt32(out int a) && a == 1;
        if (!row.TryGetProperty("p", out var pos) || pos.ValueKind != JsonValueKind.Array || pos.GetArrayLength() != 3 ||
            !row.TryGetProperty("r", out var rot) || !rot.TryGetDouble(out double r)) return this with { Name = name, Away = away };
        double[] p = pos.EnumerateArray().Select(k => k.GetDouble()).ToArray();
        bool hasLook = row.TryGetProperty("look", out var look) && look.ValueKind == JsonValueKind.Array && look.GetArrayLength() == 2;
        double pitch = hasLook ? look[1].GetDouble() * 180 / Math.PI : 0;
        double headYaw = hasLook ? -look[0].GetDouble() * 180 / Math.PI : 0;
        string appearance = row.TryGetProperty("av", out _) ? Text("av", "") + Text("ax", "") : Appearance;
        return new(name, appearance, [p[0] * 100, p[2] * 100, p[1] * 100], Math.IEEERemainder(-90 - r * 180 / Math.PI, 360), pitch,
            row.TryGetProperty("c", out var c) && c.ValueKind == JsonValueKind.True, away,
            row.TryGetProperty("pose", out var s) && s.ValueKind == JsonValueKind.Number && s.TryGetInt32(out int pose) ? pose : 0, headYaw);
    }
}

// One game process, one opaque away token, one socket and one writer. A complete local snapshot makes repeated game ticks idempotent.
internal sealed class PlayerRoom(Uri endpoint, string capFile) : IAsyncDisposable
{
    readonly object gate = new();
    readonly Dictionary<string, RoomPeer> peers = [];
    readonly Queue<string> events = new();
    long eventNumber;
    internal string Events() { lock (gate) return string.Join('\n', events); }

    readonly CancellationTokenSource stop = new();
    readonly string awayToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
    static readonly int[] RetrySeconds = [2, 5, 15, 30, 60, 300];
    PresenceFrame? frame;
    Task? pump;
    const int MissingGameMs = 3000;
    const int StillnessMs = 120000;
    long touched, changed, generation;
    string ownId = "";
    string cappedMonth = LoadCap(capFile);
    static string LoadCap(string file) { try { return File.ReadAllText(file).Trim(); } catch (IOException) { return ""; } catch (UnauthorizedAccessException) { return ""; } }
    static string Month => DateTime.UtcNow.ToString("yyyy-MM", CultureInfo.InvariantCulture);

    internal string Sync(PresenceFrame next)
    {
        lock (gate)
        {
            long now = Environment.TickCount64;
            if (frame != null && now - touched >= MissingGameMs) generation++;
            if (now - touched >= MissingGameMs || next.ChangedFrom(frame)) {
                changed = now;
                frame = next;
            }
            touched = now;
            pump ??= Task.Run(Run);
            var result = new StringBuilder("1\t").Append(ownId);
            foreach (var (id, p) in peers)
            {
                if (p.Position is not { } xyz) continue;
                result.Append('\n').Append(id).Append('\t').Append(PresencePacket.EncodeName(p.Name)).Append('\t').Append(p.Appearance);
                foreach (double n in xyz.Append(p.Yaw).Append(p.Pitch))
                    result.Append('\t').Append(n.ToString("G15", CultureInfo.InvariantCulture));
                result.Append('\t').Append(p.Crouched ? '1' : '0').Append('\t').Append(p.Away ? '1' : '0').Append('\t').Append(p.Pose).Append('\t').Append(p.HeadYaw.ToString("G15", CultureInfo.InvariantCulture));
            }
            return result.ToString();
        }
    }

    internal void Away() { lock (gate) { if (frame != null) generation++; frame = null; peers.Clear(); events.Clear(); ownId = ""; } }
    PresenceFrame? Active() { lock (gate) return Environment.TickCount64 - touched < MissingGameMs && Environment.TickCount64 - changed < StillnessMs ? frame : null; }
    void ClearPeers() { lock (gate) { peers.Clear(); events.Clear(); ownId = ""; } }

    internal static string EventPayload(JsonElement message)
    {
        // Only the co-presence fields are exposed. The room's welcome contains other gameplay
        // state as well; the local roster already represents its initial players.
        var exposed = new Dictionary<string, JsonElement>();
        foreach (var property in message.EnumerateObject())
            if (property.Name is "t" or "i" or "n" or "p" or "r" or "look" or "av" or "ax" or "c" or "pose" or "aw")
                exposed[property.Name] = property.Value;
        return JsonSerializer.Serialize(exposed)
            .Replace(@"\\", @"\u005C").Replace(@"\n", @"\u000A").Replace(@"\r", @"\u000D").Replace(@"\t", @"\u0009");
    }

    void Received(string text, long connectionGeneration)
    {
        // Other game features share this socket and some have their own text framing.
        if (!text.StartsWith('{')) return;
        using var data = JsonDocument.Parse(text);
        var m = data.RootElement;
        if (m.ValueKind != JsonValueKind.Object || !m.TryGetProperty("t", out var tag) || tag.ValueKind != JsonValueKind.String || !m.TryGetProperty("i", out var key) || key.ValueKind != JsonValueKind.String) return;
        string id = key.GetString()!;
        if (id.Length > 80 || id.Any(char.IsControl)) return;
        lock (gate)
        {
            if (frame == null || generation != connectionGeneration) return;
            void Upsert(string k, JsonElement row)
            {
                if (k.Length is 0 or > 80 || k.Any(char.IsControl) || k == ownId || (!peers.ContainsKey(k) && peers.Count >= 30)) return;
                peers[k] = (peers.GetValueOrDefault(k) ?? new RoomPeer()).Update(row);
            }
            string? kind = tag.GetString();
            if (kind is not ("w" or "j" or "s" or "x")) return;
            if (kind == "w") events.Clear();
            if (events.Count == 64) events.Dequeue();
            string json = EventPayload(m);
            events.Enqueue($"{++eventNumber}\t{kind}\t{id}\t{json}");
            switch (kind)
            {
                case "w":
                    peers.Clear(); ownId = id;
                    if (m.TryGetProperty("ps", out var list) && list.ValueKind == JsonValueKind.Array)
                        foreach (var row in list.EnumerateArray())
                            if (row.TryGetProperty("i", out var i) && i.ValueKind == JsonValueKind.String) Upsert(i.GetString()!, row);
                    break;
                case "s": case "j": Upsert(id, m); break;
                case "x": peers.Remove(id); break;
            }
        }
    }

    async Task<int> ReadSocket(ClientWebSocket ws, long connectionGeneration, CancellationToken ct)
    {
        var buffer = new byte[4096];
        using var packet = new MemoryStream();
        bool skipMessage = false;
        while (!ct.IsCancellationRequested)
        {
            var r = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
            if (r.MessageType == WebSocketMessageType.Close) return (int?)r.CloseStatus ?? 1000;
            if (r.MessageType != WebSocketMessageType.Text || packet.Length + r.Count > 128 * 1024) skipMessage = true;
            if (!skipMessage) packet.Write(buffer, 0, r.Count);
            if (!r.EndOfMessage) continue;
            if (!skipMessage) Received(Encoding.UTF8.GetString(packet.GetBuffer(), 0, (int)packet.Length), connectionGeneration);
            skipMessage = false;
            packet.SetLength(0);
        }
        return 1000;
    }

    async Task<int> Connect(PresenceFrame first, long startingGeneration, CancellationToken ct)
    {
        using var ws = new ClientWebSocket();
        using var session = CancellationTokenSource.CreateLinkedTokenSource(ct);
        session.CancelAfter(TimeSpan.FromSeconds(10));
        var uri = new UriBuilder(endpoint) { Query = "n=" + Uri.EscapeDataString(first.Name) + "&a=" + awayToken };
        await ws.ConnectAsync(uri.Uri, session.Token);
        session.CancelAfter(Timeout.Infinite);
        Task<int> receiver = ReadSocket(ws, startingGeneration, session.Token);
        try
        {
            string? last = null;
            long lastWrite = 0;
            bool needsRepeat = false;
            while (!receiver.IsCompleted)
            {
                var current = Active();
                if (current == null || Interlocked.Read(ref generation) != startingGeneration || current.Name != first.Name)
                {
                    using var closing = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    closing.CancelAfter(TimeSpan.FromSeconds(2));
                    await ws.CloseOutputAsync((WebSocketCloseStatus)(current?.Name == first.Name || current == null ? 4100 : 1000), "", closing.Token);
                    return await receiver.WaitAsync(closing.Token);
                }
                long now = Environment.TickCount64;
                bool fresh = current.Message != last;
                bool repeat = !fresh && needsRepeat && now - lastWrite >= 3000;
                string? outgoing = fresh || repeat ? current.Message : now - lastWrite >= 10000 ? "p" : null;
                if (outgoing != null)
                {
                    await ws.SendAsync(Encoding.UTF8.GetBytes(outgoing).AsMemory(), WebSocketMessageType.Text, true, session.Token);
                    needsRepeat = fresh;
                    last = current.Message; lastWrite = now;
                }
                await Task.WhenAny(receiver, Task.Delay(210, ct));
                ct.ThrowIfCancellationRequested();
            }
            return await receiver;
        }
        finally
        {
            session.Cancel(); ws.Abort();
            try { await receiver; } catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
            ClearPeers();
        }
    }

    async Task Run()
    {
        int attempts = 0;
        var ct = stop.Token;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                long version = Interlocked.Read(ref generation);
                var current = Active();
                if (current == null || cappedMonth == Month) { await Task.Delay(200, ct); continue; }
                int code = 0; long opened = Environment.TickCount64;
                try { code = await Connect(current, version, ct); }
                catch (Exception e) when (e is WebSocketException or OperationCanceledException or IOException or JsonException or InvalidOperationException or FormatException) { ClearPeers(); }
                if (ct.IsCancellationRequested) break;
                if (code == 4001)
                {
                    cappedMonth = Month;
                    try { File.WriteAllText(capFile, cappedMonth); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                    continue;
                }
                if (code == 4100 || Environment.TickCount64 - opened > 30000) attempts = 0;
                int delay = code switch { 4100 => 0, 4003 => 600, 4029 => 60, _ => RetrySeconds[Math.Min(attempts++, RetrySeconds.Length - 1)] };
                await Task.Delay(TimeSpan.FromSeconds(delay), ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
    }

    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        if (pump != null) await pump;
        stop.Dispose();
    }
}
