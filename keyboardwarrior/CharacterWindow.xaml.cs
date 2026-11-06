using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using WpfPanel = System.Windows.Controls.Panel;

namespace KeyboardWarrior;

public partial class CharacterWindow : Window
{
    private const double RestScale = 0.55;
    private const double RightRestScale = 0.68;
    private const double RightBaseInset = 6;
    private const int GwlExstyle = -20;
    private const long WsExTransparent = 0x20;
    private readonly DispatcherTimer motionTimer;
    private DateTime lastKey;
    private DateTime lastArmStep;
    private DateTime lastMouse;
    private DateTime lastClick;
    private bool leftTurn;
    private bool mouseHand;
    private double mouseX;
    private double mouseY;
    private double leftTipOffset;
    private double rightTipOffset;
    private double leftScale = RestScale;
    private double rightScale = RightRestScale;

    public CharacterWindow()
    {
        InitializeComponent();
        UpdateArms();
        motionTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
        motionTimer.Tick += UpdateMotion;
        motionTimer.Start();
        SourceInitialized += (_, _) => ApplyLock();
    }

    public void ApplySettings()
    {
        var settings = App.CurrentApp.Settings;
        Width = 250 * settings.Size / 100;
        Height = 266.5 * settings.Size / 100;
        Opacity = settings.Opacity / 100;
        ApplyLock();
    }

    public void ApplyLock()
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;
        var style = GetWindowLongPtr(handle, GwlExstyle).ToInt64();
        style = App.CurrentApp.Settings.Locked ? style | WsExTransparent : style & ~WsExTransparent;
        SetWindowLongPtr(handle, GwlExstyle, new IntPtr(style));
    }

    public void OnKey()
    {
        var now = DateTime.UtcNow;
        lastKey = now;
        var returningFromMouse = mouseHand;
        if (mouseHand)
        {
            mouseHand = false;
            Mouse.Visibility = Visibility.Collapsed;
            WpfPanel.SetZIndex(RightArm, 2);
            mouseX = mouseY = 0;
            MouseMotion.X = MouseMotion.Y = 0;
        }
        if ((now - lastArmStep).TotalMilliseconds < 120)
        {
            if (returningFromMouse)
            {
                rightTipOffset = 0;
                UpdateArms();
            }
            return;
        }
        lastArmStep = now;
        leftTurn = !leftTurn;
        leftTipOffset = leftTurn ? -5 : 0;
        leftScale = 0.88;
        rightScale = 1;
        rightTipOffset = leftTurn ? 0 : -5;
        UpdateArms();
    }

    public void OnMouseMove(int deltaX, int deltaY)
    {
        lastMouse = DateTime.UtcNow;
        if (!mouseHand)
        {
            mouseHand = true;
            Mouse.Visibility = Visibility.Visible;
            WpfPanel.SetZIndex(RightArm, 4);
        }
        mouseX = Math.Clamp(mouseX + deltaX * 0.025, -3, 3);
        mouseY = Math.Clamp(mouseY + deltaY * 0.025, -2, 2);
        rightTipOffset = mouseY;
        MouseMotion.X = mouseX;
        MouseMotion.Y = mouseY;
        UpdateArms();
    }

    public void OnMouseClick()
    {
        if (!mouseHand) return;
        lastClick = DateTime.UtcNow;
        rightTipOffset = mouseY + 3;
        MouseMotion.Y = rightTipOffset;
        UpdateArms();
    }

    private void UpdateMotion(object? sender, EventArgs e)
    {
        var now = DateTime.UtcNow;
        var changed = false;
        if ((now - lastKey).TotalMilliseconds > 160 && (leftTipOffset != 0 || leftScale != RestScale))
        {
            leftTipOffset = 0;
            leftScale = RestScale;
            changed = true;
        }
        if (mouseHand)
        {
            if ((now - lastMouse).TotalSeconds >= 1)
            {
                mouseHand = false;
                Mouse.Visibility = Visibility.Collapsed;
                WpfPanel.SetZIndex(RightArm, 2);
                mouseX = mouseY = 0;
                MouseMotion.X = MouseMotion.Y = 0;
                rightScale = RightRestScale;
                rightTipOffset = 0;
                changed = true;
            }
            else
            {
                var press = (now - lastClick).TotalMilliseconds < 110 ? 3 : 0;
                var targetOffset = mouseY + press;
                if (rightTipOffset != targetOffset)
                {
                    rightTipOffset = targetOffset;
                    MouseMotion.Y = targetOffset;
                    changed = true;
                }
            }
        }
        else if ((now - lastKey).TotalMilliseconds > 160 && (rightTipOffset != 0 || rightScale != RightRestScale))
        {
            rightTipOffset = 0;
            rightScale = RightRestScale;
            changed = true;
        }
        if (changed) UpdateArms();
    }

    private void UpdateArms()
    {
        var leftWidth = LeftArm.Width * leftScale;
        LeftArm.Clip = new RectangleGeometry(new Rect(0, 0, leftWidth, LeftArm.Height));
        LeftMotion.Matrix = HandMatrix(LeftArm.Width, leftWidth, leftTipOffset);

        var rightBase = RightArm.Width - RightBaseInset;
        var rightWidth = RightArm.Width * rightScale - RightBaseInset;
        if (mouseHand)
        {
            var reachX = 6 + RightBaseInset + mouseX;
            var reachY = 32 + rightTipOffset;
            var reach = Math.Sqrt(reachX * reachX + reachY * reachY);
            rightWidth = 15 + reach;
            var cos = -reachX / reach;
            var sin = -reachY / reach;
            var centerY = RightArm.Height / 2;
            RightMotion.Matrix = new Matrix(cos, sin, -sin, cos,
                rightBase - cos * rightWidth + sin * centerY,
                centerY - sin * rightWidth - cos * centerY);
        }
        else
        {
            RightMotion.Matrix = HandMatrix(rightBase, rightWidth, rightTipOffset);
        }
        RightArm.Clip = new RectangleGeometry(new Rect(0, 0, rightWidth, RightArm.Height));
    }

    private static Matrix HandMatrix(double width, double visibleWidth, double tipOffset)
    {
        var slope = -tipOffset / visibleWidth;
        return new Matrix(1, slope, 0, 1, width - visibleWidth, tipOffset);
    }

    private void StartDrag(object sender, MouseButtonEventArgs e)
    {
        if (!App.CurrentApp.Settings.Locked) DragMove();
    }

    private void PositionChanged(object? sender, EventArgs e)
    {
        if (IsLoaded) App.CurrentApp.SavePosition(Left, Top);
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
}
