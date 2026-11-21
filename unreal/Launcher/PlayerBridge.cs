using System.Text;
using Microsoft.VisualBasic.FileIO;

namespace Lunden.Launcher;

// KismetStringTableLibrary is part of the signed stock Shipping image. UE emits the additional
// DevNotes CSV column in the editor and uses UTF-16 with a BOM for non-ASCII text.
internal static class PresencePacket
{
    static readonly (string Plain, string Escaped)[] Escapes = [
        ("\\", "\\\\"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t"), ("'", "\\'"), ("\"", "\\\"")
    ];

    internal static string EncodeName(string name) =>
        name.Replace("%", "%25").Replace("\\", "%5C").Replace("'", "%27").Replace("\"", "%22");

    internal static string DecodeName(string name) =>
        name.Replace("%22", "\"").Replace("%27", "'").Replace("%5C", "\\").Replace("%25", "%");

    internal static string Write(string packet, string? events = null) =>
        "Key,SourceString\n" + Row("Packet", packet) + (events == null ? "" : Row("Events", events));

    static string Row(string key, string packet)
    {
        foreach (var (plain, escaped) in Escapes) packet = packet.Replace(plain, escaped);
        return "\"" + key + "\",\"" + packet.Replace("\"", "\"\"") + "\"\n";
    }

    internal static string? Read(Stream stream, string key = "Packet")
    {
        using var parser = new TextFieldParser(stream, Encoding.UTF8, true, true);
        parser.SetDelimiters(",");
        parser.TrimWhiteSpace = false;
        var header = parser.ReadFields();
        if (header == null || header.Length < 2 || header[0] != "Key" || header[1] != "SourceString") return null;
        while (!parser.EndOfData) {
            var row = parser.ReadFields();
            if (row == null || row.Length != header.Length) return null;
            if (row[0] != key) continue;
            string value = row[1];
            foreach (var (plain, escaped) in Escapes.Reverse()) value = value.Replace(escaped, plain);
            return value;
        }
        return null;
    }
}

internal sealed class PlayerBridge : IAsyncDisposable
{
    static readonly Uri Players = new("wss://lunden-l1007.olw.workers.dev/players");
    readonly PlayerRoom room;
    readonly CancellationTokenSource stop = new();
    readonly Task exchange;
    internal string DirectoryPath { get; }
    // FParse::Value also treats comma and ')' as separators in an unquoted value.
    internal string GameArgument => "-LundenPlayersBridge=" + DirectoryPath.Replace("%", "%25")
        .Replace(" ", "%20").Replace(",", "%2C").Replace(")", "%29");

    PlayerBridge(string directory, PlayerRoom room)
    {
        this.room = room;
        DirectoryPath = directory;
        exchange = ExchangeFiles();
    }

    internal static PlayerBridge Open(string userData, Uri? testRoom = null)
    {
        if (testRoom != null && !(testRoom.Scheme == "ws" && testRoom.IsLoopback && testRoom.AbsolutePath == "/players"))
            throw new ArgumentException("Test room must be a local /players Worker.");
        // Each game gets its own pair of transient files, including simultaneous launches.
        string directory = Path.Combine(userData, "Multiplayer", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        return new PlayerBridge(directory, new PlayerRoom(testRoom ?? Players, Path.Combine(userData, "multiplayer-cap-month.txt")));
    }

    static long PacketNumber(string name) =>
        long.TryParse(Path.GetFileNameWithoutExtension(name).AsSpan(5), System.Globalization.NumberStyles.None,
            System.Globalization.CultureInfo.InvariantCulture, out long value) ? value : -1;

    async Task ExchangeFiles()
    {
        string output = Path.Combine(DirectoryPath, "peers.csv");
        string temporary = output + ".tmp";
        string? lastOutput = null;
        var ct = stop.Token;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                // UE exclusively opens each exported table. A new numbered file per tick lets a
                // failed reader retry without preventing the game from writing its next state.
                var inputs = new DirectoryInfo(DirectoryPath).EnumerateFiles("game-*.csv")
                    .Select(file => (file, order: PacketNumber(file.Name)))
                    .Where(item => item.order > 0).OrderBy(item => item.order);
                foreach (var (file, _) in inputs)
                {
                    // A fresh component may start at one again after a map change. File existence,
                    // not a process-wide sequence watermark, acknowledges each consumed packet.
                    var age = DateTime.UtcNow - file.LastWriteTimeUtc;
                    if (age > TimeSpan.FromSeconds(3)) {
                        try { File.Delete(file.FullName); } catch (IOException) { }
                        continue;
                    }
                    string? packet = null;
                    try {
                        if (file.Length is > 0 and <= 4096) {
                            using var stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
                            packet = PresencePacket.Read(stream);
                        }
                    }
                    catch (IOException) { break; }
                    catch (MalformedLineException) { }
                    if (packet == null && age < TimeSpan.FromSeconds(2)) break;
                    string? snapshot = null;
                    if (packet == "away")
                    {
                        room.Away();
                        snapshot = "1\t";
                    }
                    else if (packet != null && PresenceFrame.Read(packet) is { } frame)
                    {
                        snapshot = room.Sync(frame);
                    }
                    if (snapshot != null)
                    {
                        string table = PresencePacket.Write(snapshot, room.Events());
                        if (table != lastOutput)
                        {
                            await File.WriteAllTextAsync(temporary, table, new UTF8Encoding(true), ct);
                            File.Move(temporary, output, true);
                            lastOutput = table;
                        }
                    }
                    File.Delete(file.FullName);
                }
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or MalformedLineException)
            {
                // The game may be writing or reading. Retry on the next tick.
            }
            await Task.Delay(100, ct);
        }
    }

    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        try { await exchange; } catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        stop.Dispose();
        await room.DisposeAsync();
        try
        {
            foreach (string file in Directory.EnumerateFiles(DirectoryPath, "game-*.csv"))
                if (PacketNumber(Path.GetFileName(file)) > 0) File.Delete(file);
            foreach (string file in new[] { "peers.csv", "peers.csv.tmp" })
                File.Delete(Path.Combine(DirectoryPath, file));
            Directory.Delete(DirectoryPath);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
    }
}
