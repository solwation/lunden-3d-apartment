using System.Runtime.InteropServices;

namespace Lunden.Launcher;

// #2420: native Windows task dialogs (comctl32 v6, enabled by app.manifest) for setup, download progress and errors.
// No UI framework is needed, so the launcher still builds for win-x64 on Linux and stays one self-contained file.
internal static class TaskDialog
{
    internal const int IdOk = 1, IdCancel = 2;
    const int FlagHiconMain = 0x2, FlagAllowCancel = 0x8, FlagVerificationChecked = 0x100,
        FlagProgressBar = 0x200, FlagCallbackTimer = 0x800, FlagSizeToContent = 0x1000000;
    const uint NotifyCreated = 0, NotifyButtonClicked = 2, NotifyTimer = 4, NotifyDestroyed = 5;
    const uint WmUser = 0x400, ClickButton = WmUser + 102, SetMarquee = WmUser + 103, SetRange = WmUser + 105,
        SetPosition = WmUser + 106, SetMarqueeRunning = WmUser + 107, SetElementText = WmUser + 108;
    const int ElementContent = 0, ElementMainInstruction = 3;
    const ushort ErrorIcon = 0xFFFE; // TD_ERROR_ICON

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct Config
    {
        public uint Size;
        public IntPtr Parent, Instance;
        public int Flags, CommonButtons;
        public IntPtr Title, MainIcon, MainInstruction, Content;
        public uint ButtonCount;
        public IntPtr Buttons;
        public int DefaultButton;
        public uint RadioCount;
        public IntPtr Radios;
        public int DefaultRadio;
        public IntPtr Verification, Expanded, ExpandedControl, CollapsedControl, FooterIcon, Footer, Callback, CallbackData;
        public uint Width;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct Button { public int Id; public IntPtr Text; }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    delegate int Callback(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, IntPtr data);

    [DllImport("comctl32.dll", ExactSpelling = true)]
    static extern int TaskDialogIndirect(ref Config config, out int button, out int radio, out int verified);
    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "ExtractIconExW")]
    static extern uint ExtractIconEx(string file, int index, out IntPtr large, out IntPtr small, uint count);

    static IntPtr icon;
    static IntPtr AppIcon()
    {
        if (icon == IntPtr.Zero && Environment.ProcessPath is { } path && ExtractIconEx(path, 0, out var large, out _, 1) > 0)
            icon = large;
        return icon;
    }

    internal sealed record Choice(int Button, bool Checked);

    /// <summary>
    /// A modal question with Swedish push buttons (Windows' own Cancel follows the system language). The last button,
    /// <paramref name="cancel"/>, returns <see cref="IdCancel"/>, as does closing the dialog.
    /// </summary>
    internal static Choice Ask(string instruction, string content, (int Id, string Text)[] buttons, string? verification = null,
        bool verificationChecked = false, bool error = false, string? expanded = null, string cancel = "Avbryt")
    {
        var strings = new List<IntPtr>();
        IntPtr Text(string? s) { if (s == null) return IntPtr.Zero; var p = Marshal.StringToHGlobalUni(s); strings.Add(p); return p; }
        var native = buttons.Append((Id: IdCancel, Text: cancel)).Select(b => new Button { Id = b.Id, Text = Text(b.Text) }).ToArray();
        var handle = GCHandle.Alloc(native, GCHandleType.Pinned);
        try {
            var config = Base(Text(instruction), Text(content), error);
            strings.Add(config.Title);
            config.Flags |= FlagAllowCancel | (verificationChecked ? FlagVerificationChecked : 0);
            config.ButtonCount = (uint)native.Length;
            config.Buttons = handle.AddrOfPinnedObject();
            config.DefaultButton = native[0].Id;
            config.Verification = Text(verification);
            config.Expanded = Text(expanded);
            config.ExpandedControl = expanded == null ? IntPtr.Zero : Text("Dölj detaljer");
            config.CollapsedControl = expanded == null ? IntPtr.Zero : Text("Visa detaljer");
            int hr = TaskDialogIndirect(ref config, out int pressed, out _, out int verified);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
            return new(pressed, verified != 0);
        }
        finally {
            handle.Free();
            foreach (var p in strings) Marshal.FreeHGlobal(p);
        }
    }

    static Config Base(IntPtr instruction, IntPtr content, bool error) {
        var config = new Config {
            Size = (uint)Marshal.SizeOf<Config>(), Title = Marshal.StringToHGlobalUni(Ui.ProductTitle),
            MainInstruction = instruction, Content = content, Flags = FlagSizeToContent, Width = 0
        };
        if (error) config.MainIcon = ErrorIcon;
        else if (AppIcon() is var app && app != IntPtr.Zero) { config.MainIcon = app; config.Flags |= FlagHiconMain; }
        return config;
    }

    /// <summary>
    /// A modeless-looking progress dialog on its own thread. The worker updates it with <see cref="Set"/>; Cancel
    /// cancels <see cref="Cancelled"/>. Disposing closes it.
    /// </summary>
    internal sealed class Progress : IDisposable
    {
        readonly object gate = new();
        readonly Thread thread;
        readonly CancellationTokenSource cancel = new();
        readonly ManualResetEventSlim created = new();
        string instruction, content = "";
        int position = -1; // -1: marquee, otherwise 0..1000
        bool dirty = true, closing, marquee;
        Callback? callback;

        internal CancellationToken Cancelled => cancel.Token;

        internal Progress(string instruction)
        {
            this.instruction = instruction;
            thread = new Thread(Run) { IsBackground = true, Name = "Lunden progress" };
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            created.Wait(TimeSpan.FromSeconds(5));
        }

        internal void Set(string instruction, string content, double? fraction)
        {
            lock (gate) {
                this.instruction = instruction;
                this.content = content;
                position = fraction is { } f ? (int)Math.Clamp(f * 1000, 0, 1000) : -1;
                dirty = true;
            }
        }

        void Run()
        {
            IntPtr title = IntPtr.Zero, main = Marshal.StringToHGlobalUni(instruction), body = Marshal.StringToHGlobalUni(" "),
                cancelText = Marshal.StringToHGlobalUni("Avbryt");
            var buttons = new[] { new Button { Id = IdCancel, Text = cancelText } };
            var pinned = GCHandle.Alloc(buttons, GCHandleType.Pinned);
            try {
                var config = Base(main, body, false);
                title = config.Title;
                config.Flags |= FlagProgressBar | FlagCallbackTimer | FlagAllowCancel;
                config.ButtonCount = 1;
                config.Buttons = pinned.AddrOfPinnedObject();
                config.Width = 280; // dialog units: room for "123 av 464 MB · 11,2 MB/s · cirka 1 min kvar"
                callback = OnNotify;
                config.Callback = Marshal.GetFunctionPointerForDelegate(callback);
                TaskDialogIndirect(ref config, out _, out _, out _);
            }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or COMException) {
                // Without comctl32 v6 the launcher keeps working; it only shows no progress.
            }
            finally {
                try { created.Set(); } catch (ObjectDisposedException) { }
                pinned.Free();
                Marshal.FreeHGlobal(main); Marshal.FreeHGlobal(body); Marshal.FreeHGlobal(title); Marshal.FreeHGlobal(cancelText);
            }
        }

        int OnNotify(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, IntPtr data)
        {
            switch (message) {
                case NotifyCreated:
                    SendMessage(hwnd, SetRange, IntPtr.Zero, (IntPtr)(1000 << 16));
                    created.Set();
                    Update(hwnd);
                    break;
                case NotifyTimer:
                    Update(hwnd);
                    break;
                case NotifyButtonClicked:
                    if (!closing) cancel.Cancel();
                    break;
                case NotifyDestroyed:
                    break;
            }
            return 0;
        }

        void Update(IntPtr hwnd)
        {
            string main, body; int pos; bool close;
            lock (gate) {
                close = closing;
                if (!dirty && !close) return;
                main = instruction; body = content; pos = position; dirty = false;
            }
            if (close) { SendMessage(hwnd, ClickButton, IdCancel, IntPtr.Zero); return; }
            bool wantMarquee = pos < 0;
            if (wantMarquee != marquee) {
                SendMessage(hwnd, SetMarquee, wantMarquee ? 1 : 0, IntPtr.Zero);
                if (wantMarquee) SendMessage(hwnd, SetMarqueeRunning, 1, 30);
                else SendMessage(hwnd, SetRange, IntPtr.Zero, (IntPtr)(1000 << 16));
                marquee = wantMarquee;
            }
            if (!wantMarquee) SendMessage(hwnd, SetPosition, pos, IntPtr.Zero);
            SetText(hwnd, ElementMainInstruction, main);
            SetText(hwnd, ElementContent, body.Length == 0 ? " " : body);
        }

        static void SetText(IntPtr hwnd, int element, string text)
        {
            IntPtr p = Marshal.StringToHGlobalUni(text);
            try { SendMessage(hwnd, SetElementText, element, p); }
            finally { Marshal.FreeHGlobal(p); }
        }

        public void Dispose()
        {
            lock (gate) closing = true;
            thread.Join(TimeSpan.FromSeconds(3));
            cancel.Dispose();
            created.Dispose();
        }
    }
}
