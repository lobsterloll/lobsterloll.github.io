using System.ComponentModel;
using System.Windows;

namespace KeyboardWarrior;

public partial class SettingsWindow : Window
{
    private bool ready;

    public SettingsWindow()
    {
        InitializeComponent();
        LockCheck.IsChecked = App.CurrentApp.Settings.Locked;
        SizeSlider.Value = App.CurrentApp.Settings.Size;
        OpacitySlider.Value = App.CurrentApp.Settings.Opacity;
        ready = true;
        Refresh();
    }

    public void Refresh()
    {
        LockCheck.IsChecked = App.CurrentApp.Settings.Locked;
        VisibilityButton.Content = App.CurrentApp.Character.IsVisible ? "Hide Character" : "Show Character";
    }

    private void LockChanged(object sender, RoutedEventArgs e)
    {
        if (ready) App.CurrentApp.SetLocked(LockCheck.IsChecked == true);
    }

    private void OnSizeChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (ready) App.CurrentApp.SetSize(SizeSlider.Value);
    }

    private void OpacityChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (ready) App.CurrentApp.SetOpacity(OpacitySlider.Value);
    }

    private void VisibilityClicked(object sender, RoutedEventArgs e) => App.CurrentApp.ToggleCharacter();

    private void ExitClicked(object sender, RoutedEventArgs e) => App.CurrentApp.ExitApplication();

    protected override void OnClosing(CancelEventArgs e)
    {
        if (App.CurrentApp.Exiting) return;
        e.Cancel = true;
        Hide();
    }
}
