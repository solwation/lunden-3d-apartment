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

    internal static string Write(string packet)
    {
        foreach (var (plain, escaped) in Escapes) packet = packet.Replace(plain, escaped);
        return "Key,SourceString\n\"Packet\",\"" + packet.Replace("\"", "\"\"") + "\"\n";
    }

    internal static string? Read(Stream stream)
    {
        using var parser = new TextFieldParser(stream, Encoding.UTF8, true, true);
        parser.SetDelimiters(",");
        parser.TrimWhiteSpace = false;
        var header = parser.ReadFields();
        if (header == null || header.Length < 2 || header[0] != "Key" || header[1] != "SourceString") return null;
        var row = parser.ReadFields();
        if (row == null || row.Length != header.Length || row[0] != "Packet" || !parser.EndOfData) return null;
        string value = row[1];
        foreach (var (plain, escaped) in Escapes.Reverse()) value = value.Replace(escaped, plain);
        return value;
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

    async Task ExchangeFiles()
    {
        string input = Path.Combine(DirectoryPath, "game.csv");
        string output = Path.Combine(DirectoryPath, "peers.csv");
        string temporary = output + ".tmp";
        string pending = Path.Combine(DirectoryPath, "reading.csv");
        string? lastOutput = null;
        var ct = stop.Token;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                // UE opens game.csv for exclusive write on Windows. Move a finished export before
                // reading so that the next tick can create a fresh game.csv even while we're parsing.
                if (File.Exists(input)) File.Move(input, pending, true);
                var file = new FileInfo(pending);
                if (file.Exists && file.Length is > 0 and <= 4096)
                {
                    string? packet;
                    using (var stream = new FileStream(pending, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                        packet = PresencePacket.Read(stream);
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
                        if (snapshot != lastOutput)
                        {
                            await File.WriteAllTextAsync(temporary, PresencePacket.Write(snapshot), new UTF8Encoding(true), ct);
                            File.Move(temporary, output, true);
                            lastOutput = snapshot;
                        }
                        File.Delete(pending);
                    }
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
            foreach (string file in new[] { "game.csv", "peers.csv", "peers.csv.tmp", "reading.csv" })
                File.Delete(Path.Combine(DirectoryPath, file));
            Directory.Delete(DirectoryPath);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
    }
}
