using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Lunden.Launcher;

/// <summary>
/// #2420: Lunden.exe is a Windows (GUI-subsystem) program, so starting it from the Start menu, Explorer or Settings
/// opens no console window. With redirected output (scripts, tests, CI) it writes exactly as before. From a terminal it
/// attaches to that console for text. Dialogs are shown only when nobody redirected the output and the command is not a
/// script-style one (--dry-run, --help, --quiet). Text that would have gone to a console is logged to launcher.log.
/// </summary>
internal static class Ui
{
    internal const string ProductTitle = SetupLayout.ProductName;
    internal static bool Windowed { get; private set; }
    internal static string? LogPath { get; private set; }

    internal static void Init(string[] args)
    {
        if (!OperatingSystem.IsWindows()) return;
        bool redirected = Redirected(-11) || Redirected(-12); // STD_OUTPUT_HANDLE, STD_ERROR_HANDLE
        bool scripted = args.Any(a => a is "--dry-run" or "--help" or "--quiet" or "--dry-run-install");
        if (!redirected && AttachConsole(-1)) { // ATTACH_PARENT_PROCESS: started from a terminal
            var output = Open("CONOUT$");
            if (output != null) { Console.SetOut(output); Console.SetError(output); }
        }
        else if (!redirected) {
            string name = args.SkipWhile(a => a != "--channel").Skip(1).FirstOrDefault() == "test" ? "Lunden-Test" : "Lunden";
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), name);
            try {
                Directory.CreateDirectory(dir);
                LogPath = Path.Combine(dir, "launcher.log");
                var log = new StreamWriter(new FileStream(LogPath, FileMode.Create, FileAccess.Write, FileShare.Read), new UTF8Encoding(false)) { AutoFlush = true };
                var writer = TextWriter.Synchronized(log);
                Console.SetOut(writer); Console.SetError(writer);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { LogPath = null; }
        }
        Windowed = !redirected && !scripted;
    }

    /// <summary>Shows a launch failure in a dialog (when windowed) and returns the exit code.</summary>
    internal static int Fail(string instruction, string message, Exception? cause = null)
    {
        Console.Error.WriteLine($"{instruction} {message}");
        if (Windowed) {
            try { TaskDialog.Ask(instruction, message, [], error: true, expanded: Details(cause), cancel: "Stäng"); }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or COMException) { }
        }
        return 1;
    }

    /// <summary>Technical details for a dialog's "Visa detaljer": the (often English) .NET message and the log file.</summary>
    internal static string? Details(Exception? cause)
    {
        var lines = new List<string>();
        for (var e = cause; e != null; e = e.InnerException) lines.Add($"{e.GetType().Name}: {e.Message}");
        if (LogPath != null) lines.Add("Logg: " + LogPath);
        return lines.Count == 0 ? null : string.Join("\n", lines);
    }

    internal static string Size(long bytes) => bytes >= 1L << 30
        ? (bytes / (double)(1L << 30)).ToString("0.0", Sv) + " GB"
        : (bytes / (double)(1L << 20)).ToString(bytes >= 100L << 20 ? "0" : "0.0", Sv) + " MB";

    static readonly System.Globalization.CultureInfo Sv = System.Globalization.CultureInfo.GetCultureInfo("sv-SE");

    internal static string Remaining(TimeSpan time) => time.TotalSeconds < 60
        ? $"cirka {Math.Max(1, (int)Math.Ceiling(time.TotalSeconds / 5) * 5)} s kvar"
        : $"cirka {(int)Math.Ceiling(time.TotalMinutes)} min kvar";

    /// <summary>Formats download progress with a speed averaged over the last few seconds.</summary>
    internal sealed class Rate
    {
        readonly Queue<(DateTime At, long Bytes)> samples = new();
        internal string Describe(long done, long total, DateTime now)
        {
            samples.Enqueue((now, done));
            while (samples.Count > 2 && now - samples.Peek().At > TimeSpan.FromSeconds(4)) samples.Dequeue();
            var first = samples.Peek();
            double seconds = (now - first.At).TotalSeconds;
            string text = $"{Size(done)} av {Size(total)}";
            if (seconds < 0.5 || done <= first.Bytes) return text;
            double speed = (done - first.Bytes) / seconds;
            text += $" · {(speed / (1 << 20)).ToString("0.0", Sv)} MB/s";
            if (total > done) text += " · " + Remaining(TimeSpan.FromSeconds((total - done) / speed));
            return text;
        }
    }

    static bool Redirected(int which)
    {
        IntPtr handle = GetStdHandle(which);
        return handle != IntPtr.Zero && handle != new IntPtr(-1) && GetFileType(handle) != 0; // FILE_TYPE_UNKNOWN
    }

    static TextWriter? Open(string device)
    {
        var handle = CreateFileW(device, 0x40000000, 2, IntPtr.Zero, 3, 0, IntPtr.Zero); // GENERIC_WRITE, FILE_SHARE_WRITE, OPEN_EXISTING
        if (handle.IsInvalid) return null;
        return new StreamWriter(new FileStream(handle, FileAccess.Write), Console.OutputEncoding) { AutoFlush = true };
    }

    [DllImport("kernel32.dll")] static extern bool AttachConsole(int process);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
    [DllImport("kernel32.dll")] static extern uint GetFileType(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
}
