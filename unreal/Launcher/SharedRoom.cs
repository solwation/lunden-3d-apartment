using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Lunden.Launcher;

// Transient commands and results for the current /players connection. PlayerRoom owns the lock and socket.
// The game writes through its existing numbered string-table files. Only the listed commands can leave it.
internal sealed class SharedRoom
{
    internal sealed record Command(string Json, string? LocalChat = null);
    readonly Queue<Command> outgoing = new();
    readonly Queue<(long At, string Row)> events = new();
    readonly Dictionary<string, (string Name, long Until)> typing = new();
    double chatTokens = 3;
    long refilled = Environment.TickCount64;
    readonly SortedSet<string> doors = new(StringComparer.Ordinal);
    long sequence, doorRevision;
    int life = -1, maxLife = -1;
    static readonly JsonSerializerOptions Wire = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    static readonly Regex Invisible = new(@"[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u206f\ufeff\ufff9-\ufffb]|\s+", RegexOptions.CultureInvariant);
    // Whole words as in src/chatfilter.js. The room independently filters every received line.
    static readonly Regex Rough = new(@"(?<![\p{L}\p{N}])(?:fitta|fittan|fittor|kuk|kuken|kukar|hora|horan|horor|horunge|slyna|neger|negern|negrer|fuck|fucking|fucker|motherfucker|cunt|bitch|nigger|nigga)(?![\p{L}\p{N}])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    static bool Door(string id)
    {
        if (id.Length is < 2 or > 4 || (id.Length > 2 && id[1] == '0')) return false;
        int max = id[0] switch { 'w' or 'A' or 'B' or 'C' => 40, 'L' => 4, 'g' => 200, 'q' => 1, _ => 0 };
        return int.TryParse(id.AsSpan(1), NumberStyles.None, CultureInfo.InvariantCulture, out int n) && n < max;
    }

    static string Clean(string value)
    {
        var text = string.Join(' ', Invisible.Replace(value, " ").Split(' ', StringSplitOptions.RemoveEmptyEntries));
        return Rough.Replace(string.Concat(text.EnumerateRunes().Take(140)).Trim(), "***");
    }

    internal bool Offer(string packet)
    {
        string[] f = packet.Split('\t');
        if (f.Length < 3 || f[0] != "shared" || outgoing.Count >= 32) return false;
        Command command;
        switch (f[1])
        {
            case "m" when f.Length == 3:
                string text = Clean(PresencePacket.DecodeName(f[2]));
                if (text.Length == 0) return false;
                string json = JsonSerializer.Serialize(new { t = "m", m = text }, Wire);
                while (json.Length > 250) {
                    text = text[..(text.Length - (char.IsLowSurrogate(text[^1]) ? 2 : 1))];
                    json = JsonSerializer.Serialize(new { t = "m", m = text }, Wire);
                }
                long now = Environment.TickCount64;
                chatTokens = Math.Min(3, chatTokens + (now - refilled) / 1000.0);
                refilled = now;
                if (chatTokens < 1) { Add("mx"); return false; }
                chatTokens--;
                command = new(json, text);
                break;
            case "k" when f.Length == 3 && f[2] is "1" or "0":
                command = new(JsonSerializer.Serialize(new { t = "k", on = f[2] == "1" })); break;
            case "dr" when f.Length == 4 && Door(f[2]) && f[3] is "1" or "0":
                command = new(JsonSerializer.Serialize(new { t = "dr", i = f[2], o = f[3] == "1" ? 1 : 0 })); break;
            case "fall" when f.Length == 5 && int.TryParse(f[2], NumberStyles.None, CultureInfo.InvariantCulture, out int id) && id > 0
                && double.TryParse(f[3], NumberStyles.Float, CultureInfo.InvariantCulture, out double drop) && double.IsFinite(drop) && drop >= 0
                && double.TryParse(f[4], NumberStyles.Float, CultureInfo.InvariantCulture, out double gap) && double.IsFinite(gap) && gap >= 0:
                command = new(JsonSerializer.Serialize(new { t = "fall", id, drop, gap })); break;
            default: return false;
        }
        outgoing.Enqueue(command);
        return true;
    }

    internal Command? Next() => outgoing.TryDequeue(out var command) ? command : null;

    internal void Reset()
    {
        outgoing.Clear(); events.Clear(); doors.Clear(); typing.Clear(); life = maxLife = -1; doorRevision++;
        chatTokens = 3; refilled = Environment.TickCount64;
    }

    void Add(string kind, params string[] data)
    {
        if (events.Count == 64) events.Dequeue();
        events.Enqueue((Environment.TickCount64, string.Join('\t', [(++sequence).ToString(CultureInfo.InvariantCulture), kind, ..data.Select(PresencePacket.EncodeName)])));
    }
    internal void Local(string name, string text) => Add("m", "", name, text);

    internal string Snapshot(string own)
    {
        while (events.TryPeek(out var oldest) && Environment.TickCount64 - oldest.At >= 60_000) events.Dequeue();
        long now = Environment.TickCount64;
        foreach (var id in typing.Where(pair => pair.Value.Until <= now).Select(pair => pair.Key).ToArray())
            typing.Remove(id);
        var rows = new List<string> { $"1\t{own}\t{life}\t{maxLife}\t{doorRevision}\t{string.Join(',', doors)}" };
        if (typing.Count > 0)
            rows.Add("typing\t" + PresencePacket.EncodeName(string.Join(", ", typing.Values.Select(v => v.Name))));
        rows.AddRange(events.Select(e => e.Row));
        return string.Join('\n', rows);
    }

    internal void Receive(string kind, JsonElement m, Func<string, string> peerName)
    {
        static int? Number(JsonElement obj, string key) => obj.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out int n) ? n : null;
        static string Text(JsonElement obj, string key, int limit) => obj.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String
            ? new string(p.GetString()!.Where(c => !char.IsControl(c)).Take(limit).ToArray()) : "";
        string id = Text(m, "i", 80);
        switch (kind)
        {
            case "w":
                Reset();
                if (m.TryGetProperty("c", out var config) && config.ValueKind == JsonValueKind.Object)
                    maxLife = Number(config, "lives") ?? -1;
                life = Number(m, "l") ?? -1;
                if (m.TryGetProperty("doors", out var list) && list.ValueKind == JsonValueKind.Array)
                    foreach (var row in list.EnumerateArray())
                        if (row.ValueKind == JsonValueKind.Array && row.GetArrayLength() == 2 && row[0].ValueKind == JsonValueKind.String &&
                            row[1].ValueKind == JsonValueKind.Number && row[1].TryGetInt32(out int o) && o == 1 && Door(row[0].GetString()!))
                            doors.Add(row[0].GetString()!);
                break;
            case "dr" when Door(id) && Number(m, "o") is 0 or 1:
                if (Number(m, "o") == 1) doors.Add(id); else doors.Remove(id);
                doorRevision++;
                break;
            case "x": typing.Remove(id); break;
            case "m" when id.Length > 0:
                typing.Remove(id);
                string text = Clean(Text(m, "m", 512));
                if (text.Length > 0) Add("m", id, Text(m, "n", 20), text);
                break;
            case "mx": Add("mx"); break;
            case "k" when id.Length > 0 && m.TryGetProperty("on", out var on) && on.ValueKind is JsonValueKind.True or JsonValueKind.False:
                string name = peerName(id);
                if (on.GetBoolean()) typing[id] = (name.Length > 0 ? name : "Anonym", Environment.TickCount64 + 15_000); // CHAT.typingStale
                else typing.Remove(id);
                Add("k", id, name, on.GetBoolean() ? "1" : "0"); break;
            case "life" when Number(m, "l") is int l && l >= 0 && l <= maxLife:
                life = l; break;
            case "fall": case "hurt":
                if (Number(m, "l") is int left && left >= 0 && left <= maxLife && m.TryGetProperty("dead", out var dead)
                    && dead.ValueKind is JsonValueKind.True or JsonValueKind.False) {
                    life = dead.GetBoolean() ? maxLife : left;
                    Add(kind, (Number(m, "id") ?? 0).ToString(CultureInfo.InvariantCulture),
                        left.ToString(CultureInfo.InvariantCulture), dead.GetBoolean() ? "1" : "0");
                }
                break;
        }
    }
}
