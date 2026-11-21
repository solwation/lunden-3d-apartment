using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace Lunden.Launcher;

internal static class Program
{
    static readonly Version Current = typeof(Program).Assembly.GetName().Version!;
    const string Assets = "https://github.com/solwation/lunden-3d-apartment/releases/latest/download/";
    const int FirstStartSeconds = 8; // Provisional quick-crash window, pending the pilot in #2246.

    static async Task<int> Main(string[] args)
    {
        var assembly = typeof(Program).Assembly;
        try {
            var signer = SignerIdentity.Compiled;
            if (SelfUpdate.IsHelper(args)) return SelfUpdate.Finish(args, signer);
            string image = Environment.ProcessPath ?? throw new IOException("Startprogrammets sökväg saknas.");
            if (args.FirstOrDefault() == UninstallHelper.Switch) return UninstallHelper.Finish(args, image, signer);
            if (args.Contains("--help")) {
                Console.WriteLine("Lunden [--channel stable|test] [--manifest FIL/URL] [--dry-run] [--offline]");
                Console.WriteLine("Lunden [--install | --uninstall | --dry-run-install] [--quiet] [--channel stable|test]");
                return 0;
            }
            if (SetupCommand.Parse(args, image) is { } setup) return setup.Run(image, signer, Current.ToString(3));
            var options = Options.Parse(args);
            using var key = ECDsa.Create();
            using var resource = assembly.GetManifestResourceStream("Lunden.ManifestKey.pem")
                ?? throw new InvalidDataException("Den här utvecklingsversionen saknar en inbyggd publik manifestnyckel.");
            using var reader = new StreamReader(resource);
            key.ImportFromPem(await reader.ReadToEndAsync());

            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string name = options.Channel == "test" ? "Lunden-Test" : "Lunden";
            string root = Path.Combine(local, "Programs", name);
            string userData = Path.Combine(local, name);
            using var http = new HttpClient {Timeout = TimeSpan.FromSeconds(20)};
            var store = new UpdateStore(root, http, (path, file, stock) => StockRuntime.Verify(path, file, stock, signer));
            using var maintenance = options.DryRun || !OperatingSystem.IsWindows() ? null : SetupLayout.Current(options.Channel).MaintenanceLock();
            using var lease = options.DryRun ? null : store.Lock();
            var state = store.Load(options.Channel);
            if (!options.Offline) {
                while (true) {
                    try {
                        byte[] bytes = await ReadManifestFile(http, options.Source, options.Channel, 4 * 1024 * 1024);
                        byte[] sig = await ReadManifestFile(http, SignatureSource(options.Source), options.Channel, 64);
                        var release = ReleaseManifest.Read(bytes, sig, key, options.Channel);
                        if (Version.Parse(release.App.MinLauncher) > Current) {
                            if (Version.Parse(release.Launcher.Version) < Version.Parse(release.App.MinLauncher))
                                throw new InvalidDataException("Det annonserade startprogrammet är för gammalt.");
                            Console.WriteLine($"Nytt startprogram krävs: {release.Launcher.Version}.");
                            if (options.DryRun) return 0;
                            var launcher = new ReleaseFile("Lunden.exe", release.Launcher.Url, release.Launcher.Size,
                                release.Launcher.Sha256, true);
                            string dir = Path.Combine(root, "staging", "launcher");
                            Directory.CreateDirectory(dir);
                            string staged = Path.Combine(dir, "Lunden.exe");
                            await store.Download(launcher, staged, Path.Combine(dir, launcher.Sha256 + ".partial"), default);
                            Authenticode.Verify(staged, signer);
                            SelfUpdate.Start(root, staged, launcher.Sha256, signer, args);
                            return 0;
                        }
                        Console.WriteLine($"Kontrollerar Lunden {release.App.Version}, innehåll {release.Content.Version}…");
                        await store.Apply(release, bytes, sig, state, options.DryRun, default);
                        if (options.DryRun) return 0;
                        state = store.Load(options.Channel);
                        break;
                    }
                    catch (Exception ex) when (ExpectedFailure(ex)) {
                        Console.Error.WriteLine($"Uppdateringen kunde inte genomföras. {ex.Message}");
                        if (options.DryRun) return 1;
                        bool unavailable = ex is HttpRequestException or OperationCanceledException or EndOfStreamException;
                        if ((!unavailable || state.Active == null) && !Console.IsInputRedirected && !Console.IsOutputRedirected) {
                            Console.Write(state.Active == null ? "Försök igen [R] eller avsluta [Enter]: "
                                : "Spela installerad version [Enter] eller försök igen [R]: ");
                            if (Console.ReadKey(true).Key == ConsoleKey.R) continue;
                        }
                        if (state.Active == null) return 1;
                        break;
                    }
                }
            }
            if (options.DryRun) return state.Active == null ? 1 : 0;
            PlayerBridge? bridge = null;
            Process? game = null;
            try {
                int result = await RunInstalled(store, state, key, userData, async (info, _, pending) => {
                    if (!options.Offline && bridge == null) {
                        try { bridge = PlayerBridge.Open(userData); }
                        catch (Exception ex) when (ExpectedFailure(ex)) {
                            Console.Error.WriteLine("Flerspelarläget är inte tillgängligt. Du kan fortfarande spela lokalt.");
                        }
                    }
                    if (bridge != null) info.ArgumentList.Add(bridge.GameArgument);
                    game?.Dispose();
                    game = Process.Start(info) ?? throw new IOException("Windows kunde inte starta spelet.");
                    if (!pending) return true;
                    var exit = game.WaitForExitAsync();
                    return await Task.WhenAny(exit, Task.Delay(TimeSpan.FromSeconds(FirstStartSeconds))) != exit || game.ExitCode == 0;
                });
                // Confirm (or roll back) the update first. The bridge owns only the running game's lifetime.
                lease?.Dispose();
                maintenance?.Dispose();
                if (result == 0 && bridge != null && game != null) await game.WaitForExitAsync();
                return result;
            } finally {
                game?.Dispose();
                if (bridge != null) await bridge.DisposeAsync();
            }
        }
        catch (Exception ex) when (ExpectedFailure(ex)) {
            Console.Error.WriteLine($"Lunden kunde inte startas. {ex.Message}");
            return 1;
        }
    }

    internal static async Task<int> RunInstalled(UpdateStore store, InstallState state, ECDsa key, string userData,
        Func<ProcessStartInfo, Installation, bool, Task<bool>> startGame)
    {
        if (state.Active == null) throw new InvalidOperationException("Ingen installerad version finns.");
        try { store.Prune(state); }
        catch (Exception ex) when (ExpectedFailure(ex)) { Console.Error.WriteLine($"Kunde inte rensa versioner. {ex.Message}"); }
        try {
            string entry = await store.VerifyInstalled(state.Active, key, state.Channel, default);
            Directory.CreateDirectory(userData);
            if (await startGame(GameProcess.StartInfo(store.GameFile(state.Active, ""), entry, userData), state.Active, state.Pending)) {
                try { store.Confirm(state); }
                catch (Exception ex) when (ExpectedFailure(ex)) {
                    // The game is already running. Recheck it on the next launch.
                    Console.Error.WriteLine($"Spelet startade men statusen kunde inte sparas. {ex.Message}");
                }
                return 0;
            }
            Console.Error.WriteLine("Den uppdaterade versionen avslutades direkt med ett fel.");
        }
        catch (Exception ex) when (state.Previous != null && ExpectedFailure(ex)) {
            Console.Error.WriteLine($"Den aktiva versionen kunde inte startas. {ex.Message}");
        }
        if (state.Previous == null) return 1;
        string previousEntry = await store.VerifyInstalled(state.Previous, key, state.Channel, default);
        store.Rollback(state);
        Console.WriteLine("Startar den föregående fungerande versionen.");
        Directory.CreateDirectory(userData);
        return await startGame(GameProcess.StartInfo(store.GameFile(state.Previous, ""), previousEntry, userData), state.Previous, false) ? 0 : 1;
    }

    static bool ExpectedFailure(Exception ex) => ex is IOException or InvalidDataException or UnauthorizedAccessException
        or CryptographicException or HttpRequestException or JsonException or OperationCanceledException
        or System.Security.SecurityException or TimeoutException or FormatException or OverflowException or ArgumentException or InvalidOperationException or NotSupportedException or System.ComponentModel.Win32Exception;

    static string SignatureSource(string source) {
        if (Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http") {
            var signature = new UriBuilder(uri) {Path = uri.AbsolutePath + ".sig"};
            return signature.Uri.AbsoluteUri;
        }
        return source + ".sig";
    }

    static async Task<byte[]> ReadManifestFile(HttpClient client, string source, string channel, int maxSize)
    {
        if (File.Exists(source)) {
            if (new FileInfo(source).Length > maxSize) throw new InvalidDataException("För stort manifest eller signatur.");
            return await File.ReadAllBytesAsync(source);
        }
        if (!Uri.TryCreate(source, UriKind.Absolute, out var uri) || !ReleaseManifest.AllowedUrl(uri, channel))
            throw new InvalidDataException("Manifestets sökväg eller adress är ogiltig.");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        response.EnsureSuccessStatusCode();
        await response.Content.LoadIntoBufferAsync(maxSize, timeout.Token);
        return await response.Content.ReadAsByteArrayAsync();
    }

    sealed record Options(string Source, string Channel, bool DryRun, bool Offline)
    {
        public static Options Parse(string[] args) {
            string? source = null;
            string channel = "stable";
            bool dry = false, offline = false;
            for (int i = 0; i < args.Length; i++) {
                switch (args[i]) {
                    case "--manifest" when i + 1 < args.Length: source = args[++i]; break;
                    case "--channel" when i + 1 < args.Length: channel = args[++i]; break;
                    case "--dry-run": dry = true; break;
                    case "--offline": offline = true; break;
                    default: throw new ArgumentException("Okänt eller ofullständigt argument: " + args[i]);
                }
            }
            if (channel is not ("test" or "stable")) throw new ArgumentException("Okänd uppdateringskanal.");
            return new(source ?? Assets + (channel == "test" ? "lunden-manifest-test.json" : "lunden-manifest.json"), channel, dry, offline);
        }
    }
}
