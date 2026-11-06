using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;

namespace LobsterCalc;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        var app = new Application();
        app.Run(new CalculatorWindow());
    }
}

internal static class Theme
{
    public static readonly Brush Paper = new SolidColorBrush(Color.FromRgb(243, 240, 233));
    public static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(36, 36, 32));
    public static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(105, 102, 94));
    public static readonly Brush Red = new SolidColorBrush(Color.FromRgb(223, 72, 47));
    public static TextBlock Text(string text, double size = 14, Brush? color = null) => new()
    {
        Text = text, FontSize = size, Foreground = color ?? Ink,
        TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12)
    };
    public static Style ButtonStyle()
    {
        var style = new Style(typeof(Button));
        style.Setters.Add(new Setter(Control.BackgroundProperty, new SolidColorBrush(Color.FromRgb(255, 253, 248))));
        style.Setters.Add(new Setter(Control.ForegroundProperty, Ink));
        style.Setters.Add(new Setter(Control.BorderBrushProperty, new SolidColorBrush(Color.FromRgb(214, 209, 200))));
        style.Setters.Add(new Setter(Control.BorderThicknessProperty, new Thickness(1)));
        style.Setters.Add(new Setter(Control.FontSizeProperty, 22.0));
        style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(10)));
        style.Setters.Add(new Setter(FrameworkElement.MarginProperty, new Thickness(4)));
        style.Setters.Add(new Setter(Control.CursorProperty, Cursors.Hand));
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(5));
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
        border.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Control.BorderBrushProperty));
        border.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Control.BorderThicknessProperty));
        var content = new FrameworkElementFactory(typeof(ContentPresenter));
        content.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        content.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
        border.AppendChild(content);
        style.Setters.Add(new Setter(Control.TemplateProperty, new ControlTemplate(typeof(Button)) { VisualTree = border }));
        var hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hover.Setters.Add(new Setter(UIElement.OpacityProperty, 0.8));
        style.Triggers.Add(hover);
        var focus = new Trigger { Property = UIElement.IsKeyboardFocusedProperty, Value = true };
        focus.Setters.Add(new Setter(Control.BorderBrushProperty, Red));
        focus.Setters.Add(new Setter(Control.BorderThicknessProperty, new Thickness(2)));
        style.Triggers.Add(focus);
        var disabled = new Trigger { Property = UIElement.IsEnabledProperty, Value = false };
        disabled.Setters.Add(new Setter(UIElement.OpacityProperty, 0.45));
        style.Triggers.Add(disabled);
        return style;
    }
}

internal sealed class LocalLicense
{
    private readonly string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LobsterLoll", "LobsterCalc");
    public string DeviceId { get; }
    private readonly string publicKey;
    public Uri? Server { get; }
    public string TokenPath => Path.Combine(directory, "interac-license.txt");
    public string SessionPath => Path.Combine(directory, "pending-interac-payment.json");
    public LocalLicense()
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
        var machineId = key?.GetValue("MachineGuid") as string ?? Environment.MachineName;
        DeviceId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("lobsterloll-calculator:" + machineId))).ToLowerInvariant();
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("LobsterCalc.LicensePublicKey.pem")!;
        using var reader = new StreamReader(stream);
        publicKey = reader.ReadToEnd();
        Directory.CreateDirectory(directory);
        var configPath = Path.Combine(AppContext.BaseDirectory, "calculator-config.json");
        if (File.Exists(configPath))
        {
            try
            {
                using var config = JsonDocument.Parse(File.ReadAllText(configPath));
                var value = config.RootElement.GetProperty("interacPaymentServer").GetString();
                if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo))
                    Server = new Uri(uri.AbsoluteUri.TrimEnd('/') + "/");
            }
            catch (Exception error) when (error is JsonException or KeyNotFoundException or InvalidOperationException) { }
        }
    }
    public bool Accepts(string token) => LicenseVerifier.IsValid(token, DeviceId, publicKey);
    public bool IsUnlocked()
    {
        try { return File.Exists(TokenPath) && Accepts(File.ReadAllText(TokenPath)); }
        catch (IOException) { return false; }
    }
    public void Save(string token)
    {
        if (!Accepts(token)) throw new InvalidOperationException("The payment unlock could not be verified.");
        File.WriteAllText(TokenPath + ".tmp", token);
        File.Move(TokenPath + ".tmp", TokenPath, true);
        if (File.Exists(SessionPath)) File.Delete(SessionPath);
    }
}

internal sealed class CalculatorWindow : Window
{
    private readonly TextBox expression;
    private readonly TextBlock history;
    private readonly Grid calculator;
    private readonly Border paymentOverlay;
    private PaymentPanel? payment;
    private readonly LocalLicense license = new();
    public CalculatorWindow()
    {
        Title = "LobsterCalc";
        Width = 390; Height = 520;
        MinWidth = 360; MinHeight = 490;
        ResizeMode = ResizeMode.CanMinimize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Theme.Paper;
        FontFamily = new FontFamily("Segoe UI");
        Foreground = Theme.Ink;
        Resources.Add(typeof(Button), Theme.ButtonStyle());
        var surface = new Grid();
        calculator = new Grid { Margin = new Thickness(18) };
        foreach (var height in new[] { GridLength.Auto, GridLength.Auto, new GridLength(1, GridUnitType.Star) }) calculator.RowDefinitions.Add(new RowDefinition { Height = height });
        surface.Children.Add(calculator);
        paymentOverlay = new Border
        {
            Background = new SolidColorBrush(Color.FromArgb(185, 36, 36, 32)),
            Visibility = Visibility.Collapsed
        };
        surface.Children.Add(paymentOverlay);
        Content = surface;
        history = Theme.Text("", 12, Theme.Muted);
        calculator.Children.Add(history);
        expression = new TextBox
        {
            Text = "", FontSize = 35, TextAlignment = TextAlignment.Right,
            Background = Brushes.Transparent, BorderThickness = new Thickness(0, 0, 0, 1),
            BorderBrush = Theme.Ink, Padding = new Thickness(0, 10, 0, 16),
            Margin = new Thickness(0, 2, 0, 18), MaxLength = 256,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalContentAlignment = VerticalAlignment.Center
        };
        System.Windows.Automation.AutomationProperties.SetName(expression, "Calculation");
        Grid.SetRow(expression, 1); calculator.Children.Add(expression);
        var keys = new Grid();
        for (var i = 0; i < 4; i++) keys.ColumnDefinitions.Add(new ColumnDefinition());
        for (var i = 0; i < 5; i++) keys.RowDefinitions.Add(new RowDefinition());
        var labels = new[] { "AC", "+/−", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "=" };
        for (var i = 0; i < labels.Length; i++)
        {
            var label = labels[i];
            var button = new Button { Content = label };
            var row = i < 16 ? i / 4 : 4;
            var col = i < 16 ? i % 4 : i == 16 ? 0 : i == 17 ? 2 : 3;
            Grid.SetRow(button, row); Grid.SetColumn(button, col);
            if (label == "0") Grid.SetColumnSpan(button, 2);
            if (label == "=") { button.Background = Theme.Red; button.Foreground = Brushes.White; }
            if (label is "AC" or "+/−" or "%") button.FontSize = 17;
            button.Click += (_, _) => Press(label);
            keys.Children.Add(button);
        }
        Grid.SetRow(keys, 2); calculator.Children.Add(keys);
        PreviewKeyDown += (_, e) =>
        {
            if (payment is not null)
            {
                if (e.Key == Key.Escape) { e.Handled = true; payment.Cancel(); }
                return;
            }
            if (e.Key == Key.Enter) { e.Handled = true; Calculate(); }
            else if (e.Key == Key.Escape) { expression.Clear(); history.Text = ""; }
        };
        PreviewTextInput += (_, e) =>
        {
            if (payment is null && e.Text == "=") { e.Handled = true; Calculate(); }
        };
        Loaded += (_, _) => expression.Focus();
        Closed += (_, _) => payment?.Dispose();
    }
    private void Press(string value)
    {
        if (value == "=") { Calculate(); return; }
        if (value == "AC") { expression.Clear(); history.Text = ""; }
        else if (value == "+/−") expression.Text = string.IsNullOrWhiteSpace(expression.Text) ? "−" : "−(" + expression.Text + ")";
        else
        {
            var start = expression.SelectionStart;
            expression.SelectedText = value;
            expression.CaretIndex = start + value.Length;
        }
        expression.Focus();
        if (value is "AC" or "+/−") expression.CaretIndex = expression.Text.Length;
    }
    private void Calculate()
    {
        if (payment is not null) return;
        try
        {
            var original = expression.Text;
            var result = ExpressionParser.Evaluate(original);
            if (!license.IsUnlocked())
            {
                payment = new PaymentPanel(license);
                payment.Finished += paid =>
                {
                    payment = null;
                    paymentOverlay.Child = null;
                    paymentOverlay.Visibility = Visibility.Collapsed;
                    calculator.IsEnabled = true;
                    if (paid && license.IsUnlocked()) ShowResult(original, result);
                    else expression.Focus();
                };
                calculator.IsEnabled = false;
                paymentOverlay.Child = payment;
                paymentOverlay.Visibility = Visibility.Visible;
                return;
            }
            ShowResult(original, result);
        }
        catch (Exception error) when (error is FormatException or ArithmeticException)
        {
            history.Text = error.Message;
        }
    }

    private void ShowResult(string original, double result)
    {
        history.Text = original + " =";
        expression.Text = result.ToString("G15", CultureInfo.InvariantCulture);
        expression.CaretIndex = expression.Text.Length;
        expression.Focus();
    }
}

internal sealed record PaymentSession(string Server, string Token, string ApprovalUrl);

internal sealed class PaymentPanel : Border, IDisposable
{
    public event Action<bool>? Finished;
    private readonly LocalLicense license;
    private readonly TextBlock status;
    private readonly Button pay;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(3) };
    private PaymentSession? session;
    private bool checking;
    private bool closed;
    public PaymentPanel(LocalLicense localLicense)
    {
        license = localLicense;
        Width = 310;
        Margin = new Thickness(14);
        Padding = new Thickness(22);
        CornerRadius = new CornerRadius(10);
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Center;
        Background = Theme.Paper;
        KeyboardNavigation.SetTabNavigation(this, KeyboardNavigationMode.Cycle);
        System.Windows.Automation.AutomationProperties.SetName(this, "Interac e-Transfer unlock");
        Resources.Add(typeof(Button), Theme.ButtonStyle());
        var panel = new StackPanel();
        panel.Children.Add(Theme.Text("Unlock calculator", 21));
        panel.Children.Add(Theme.Text("CAD $3.00", 30));
        panel.Children.Add(Theme.Text("Tax included · One-time payment", 11, Theme.Muted));
        panel.Children.Add(Theme.Text("Recipient: junhapark2010@gmail.com", 11, Theme.Muted));
        panel.Children.Add(Theme.Text("Permanent unlock after your e-transfer is verified.", 12, Theme.Muted));
        pay = new Button { Content = "Continue with e-Transfer", Height = 44, FontSize = 13, Background = Theme.Red, Foreground = Brushes.White, Margin = new Thickness(0, 4, 0, 10) };
        pay.Click += async (_, _) => await StartPayment();
        panel.Children.Add(pay);
        status = Theme.Text(license.Server is null ? "Automatic payments aren’t set up yet. Please do not send money." : "Complete the bank payment in your browser. Only a verified deposit unlocks the calculator.", 11, Theme.Muted);
        panel.Children.Add(status);
        var cancel = new Button { Content = "Not now", FontSize = 12, Height = 32, Margin = new Thickness(0, 4, 0, 0) };
        cancel.Click += (_, _) => Cancel();
        panel.Children.Add(cancel);
        Child = panel;
        pay.IsEnabled = license.Server is not null;
        timer.Tick += async (_, _) => await CheckPayment();
        Unloaded += (_, _) => Dispose();
        if (license.Server is not null && File.Exists(license.SessionPath))
        {
            try
            {
                session = JsonSerializer.Deserialize<PaymentSession>(File.ReadAllText(license.SessionPath));
                if (session?.Server != license.Server.AbsoluteUri) session = null;
            }
            catch (Exception error) when (error is JsonException or IOException) { session = null; }
        }
        Loaded += async (_, _) =>
        {
            (pay.IsEnabled ? pay : cancel).Focus();
            if (session is not null) { timer.Start(); await CheckPayment(); }
        };
    }

    public void Dispose()
    {
        if (closed) return;
        closed = true;
        timer.Stop();
        http.Dispose();
    }

    public void Cancel() => Finish(false);

    private void Finish(bool paid)
    {
        if (closed) return;
        Dispose();
        Finished?.Invoke(paid);
    }

    private async Task StartPayment()
    {
        if (license.Server is null) return;
        pay.IsEnabled = false;
        try
        {
            var token = session?.Token ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(license.Server, "api/interac/checkout"));
            request.Headers.Authorization = new("Bearer", token);
            request.Content = JsonContent.Create(new { deviceId = license.DeviceId });
            using var response = await http.SendAsync(request);
            response.EnsureSuccessStatusCode();
            using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var checkout = result.RootElement;
            if (checkout.GetProperty("paymentMethod").GetString() != "interac"
                || checkout.GetProperty("currency").GetString() != "CAD"
                || checkout.GetProperty("amount").GetString() != "3.00"
                || checkout.GetProperty("recipientEmail").GetString() != "junhapark2010@gmail.com"
                || checkout.GetProperty("mode").GetString() != "live")
                throw new InvalidOperationException("E-transfer checkout has not been activated.");
            var url = checkout.GetProperty("paymentUrl").GetString()!;
            if (!Uri.TryCreate(url, UriKind.Absolute, out var approval) || approval.Scheme != "https"
                || approval.Host != license.Server.Host || !string.IsNullOrEmpty(approval.UserInfo))
                throw new InvalidOperationException("Invalid payment service address.");
            session = new PaymentSession(license.Server.AbsoluteUri, token, url);
            File.WriteAllText(license.SessionPath, JsonSerializer.Serialize(session));
            if (closed) return;
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            status.Text = "Waiting for verified e-transfer confirmation…";
            pay.Content = "Reopen e-Transfer checkout";
            timer.Start();
            await CheckPayment();
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException or IOException or System.ComponentModel.Win32Exception)
        {
            if (!closed) status.Text = "Verified e-transfer checkout is unavailable. Please do not send money outside the checkout.";
        }
        finally { if (!closed) pay.IsEnabled = true; }
    }

    private async Task CheckPayment()
    {
        if (checking || session is null || license.Server is null || closed) return;
        checking = true;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(license.Server, "api/interac/payment-status"));
            request.Headers.Authorization = new("Bearer", session.Token);
            using var response = await http.SendAsync(request);
            response.EnsureSuccessStatusCode();
            using var data = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if (data.RootElement.TryGetProperty("license", out var signedLicense))
            {
                var token = signedLicense.GetString()!;
                if (!license.Accepts(token)) throw new InvalidOperationException("Invalid unlock.");
                license.Save(token);
                timer.Stop();
                if (!closed) Finish(true);
            }
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or IOException)
        {
            if (!closed) status.Text = "Still waiting for verified payment. The app will check again automatically.";
        }
        finally { checking = false; }
    }
}
