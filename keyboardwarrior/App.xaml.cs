using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace KeyboardWarrior;

public partial class App : System.Windows.Application
{
    private readonly string settingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KeyboardWarrior", "settings.json");
    private readonly DispatcherTimer saveTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private Forms.NotifyIcon? tray;
    private GlobalInput? input;
    private SettingsWindow? settingsWindow;

    public static App CurrentApp => (App)Current;
    public bool Exiting { get; private set; }
    public AppSettings Settings { get; private set; } = new();
    public CharacterWindow Character { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        if (File.Exists(settingsPath))
        {
            try
            {
                Settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(settingsPath)) ?? new();
            }
            catch (JsonException)
            {
                Settings = new();
            }
        }

        Settings.Size = Math.Clamp(Settings.Size, 50, 200);
        Settings.Opacity = Math.Clamp(Settings.Opacity, 30, 100);
        saveTimer.Tick += (_, _) => { saveTimer.Stop(); Save(); };

        Character = new CharacterWindow();
        Character.ApplySettings();
        if (Settings.Left.HasValue && Settings.Top.HasValue)
        {
            Character.Left = Settings.Left.Value;
            Character.Top = Settings.Top.Value;
        }
        else
        {
            var area = SystemParameters.WorkArea;
            Character.Left = area.Right - Character.Width - 30;
            Character.Top = area.Bottom - Character.Height - 30;
        }
        Character.Show();

        settingsWindow = new SettingsWindow();
        settingsWindow.Show();
        MainWindow = settingsWindow;

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Show / Hide Character", null, (_, _) => ToggleCharacter());
        menu.Items.Add("Lock / Unlock Position", null, (_, _) => SetLocked(!Settings.Locked));
        menu.Items.Add("Settings", null, (_, _) => ShowSettings());
        menu.Items.Add("Exit", null, (_, _) => ExitApplication());
        tray = new Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Text = "Keyboard Warrior",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.DoubleClick += (_, _) => ShowSettings();
        input = new GlobalInput(Character);
    }

    public void SetLocked(bool locked)
    {
        Settings.Locked = locked;
        Character.ApplyLock();
        settingsWindow?.Refresh();
        QueueSave();
    }

    public void SetSize(double size)
    {
        Settings.Size = size;
        Character.ApplySettings();
        QueueSave();
    }

    public void SetOpacity(double opacity)
    {
        Settings.Opacity = opacity;
        Character.ApplySettings();
        QueueSave();
    }

    public void SavePosition(double left, double top)
    {
        Settings.Left = left;
        Settings.Top = top;
        QueueSave();
    }

    public void ToggleCharacter()
    {
        if (Character.IsVisible) Character.Hide();
        else Character.Show();
        settingsWindow?.Refresh();
    }

    public void ShowSettings()
    {
        settingsWindow?.Show();
        settingsWindow?.Activate();
    }

    public void ExitApplication()
    {
        Exiting = true;
        Save();
        Shutdown();
    }

    private void QueueSave()
    {
        saveTimer.Stop();
        saveTimer.Start();
    }

    private void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(settingsPath)!);
        File.WriteAllText(settingsPath, JsonSerializer.Serialize(Settings));
    }

    protected override void OnExit(ExitEventArgs e)
    {
        input?.Dispose();
        if (tray is not null)
        {
            tray.Visible = false;
            tray.Dispose();
        }
        base.OnExit(e);
    }
}

public sealed class AppSettings
{
    public double? Left { get; set; }
    public double? Top { get; set; }
    public double Size { get; set; } = 100;
    public double Opacity { get; set; } = 100;
    public bool Locked { get; set; }
}
