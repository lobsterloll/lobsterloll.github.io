using System.ComponentModel;
using System.Runtime.InteropServices;

namespace KeyboardWarrior;

public sealed class GlobalInput : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WhMouseLl = 14;
    private const int WmKeydown = 0x100;
    private const int WmSyskeydown = 0x104;
    private const int WmMousemove = 0x200;
    private const int WmLbuttondown = 0x201;
    private const int WmRbuttondown = 0x204;
    private readonly CharacterWindow character;
    private readonly HookProc keyboardCallback;
    private readonly HookProc mouseCallback;
    private IntPtr keyboardHook;
    private IntPtr mouseHook;
    private Point lastPoint;

    public GlobalInput(CharacterWindow character)
    {
        this.character = character;
        keyboardCallback = KeyboardEvent;
        mouseCallback = MouseEvent;
        GetCursorPos(out lastPoint);
        var module = GetModuleHandle(null);
        keyboardHook = SetWindowsHookEx(WhKeyboardLl, keyboardCallback, module, 0);
        mouseHook = SetWindowsHookEx(WhMouseLl, mouseCallback, module, 0);
        if (keyboardHook == IntPtr.Zero || mouseHook == IntPtr.Zero)
        {
            Dispose();
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    private IntPtr KeyboardEvent(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0 && (message.ToInt32() == WmKeydown || message.ToInt32() == WmSyskeydown))
            character.OnKey();
        return CallNextHookEx(keyboardHook, code, message, data);
    }

    private IntPtr MouseEvent(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0)
        {
            var value = message.ToInt32();
            if (value == WmMousemove)
            {
                var point = Marshal.PtrToStructure<MouseHookData>(data).Position;
                var deltaX = point.X - lastPoint.X;
                var deltaY = point.Y - lastPoint.Y;
                lastPoint = point;
                if (deltaX != 0 || deltaY != 0) character.OnMouseMove(deltaX, deltaY);
            }
            else if (value == WmLbuttondown || value == WmRbuttondown)
            {
                character.OnMouseClick();
            }
        }
        return CallNextHookEx(mouseHook, code, message, data);
    }

    public void Dispose()
    {
        if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
        if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
        keyboardHook = mouseHook = IntPtr.Zero;
    }

    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseHookData
    {
        public Point Position;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int hook, HookProc callback, IntPtr module, uint threadId);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point point);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? moduleName);
}
