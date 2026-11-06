#include "simulation.h"

#include <windows.h>
#include <d2d1.h>
#include <shellapi.h>
#include <wincodec.h>
#include <wrl/client.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {
constexpr UINT kTrayMessage = WM_APP + 1;
constexpr UINT kTimerId = 1;
constexpr int kExitMenuId = 100;
constexpr int kHotkeyId = 101;
constexpr float kPi = 3.14159265358979323846f;

struct Screen {
    int x = 0, y = 0, width = 1, height = 1;
};

Screen virtualScreen() {
    return {GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN),
            std::max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN)),
            std::max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN))};
}

class Graphics {
public:
    ~Graphics() { release(); }

    bool initialize(int width, int height) {
        release();
        if (FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, factory_.GetAddressOf()))) return false;
        if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                    IID_PPV_ARGS(wic_.GetAddressOf())))) return false;
        if (FAILED(wic_->CreateBitmap(static_cast<UINT>(width), static_cast<UINT>(height),
                                      GUID_WICPixelFormat32bppPBGRA, WICBitmapCacheOnLoad,
                                      bitmap_.GetAddressOf()))) return false;
        const auto properties = D2D1::RenderTargetProperties(
            D2D1_RENDER_TARGET_TYPE_SOFTWARE,
            D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
        if (FAILED(factory_->CreateWicBitmapRenderTarget(bitmap_.Get(), properties,
                                                         target_.GetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(0.045f, 0.018f, 0.008f, 0.92f), dark_.GetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(0.19f, 0.075f, 0.028f, 0.96f), brown_.GetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(0.45f, 0.22f, 0.08f, 0.70f), highlight_.GetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(0.0f, 0.0f, 0.0f, 0.22f), shadow_.GetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(0.75f, 0.12f, 0.025f, 0.85f), bite_.GetAddressOf()))) return false;

        screenDc_ = GetDC(nullptr);
        memoryDc_ = CreateCompatibleDC(screenDc_);
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height; // Top-down BGRA buffer.
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        dib_ = CreateDIBSection(screenDc_, &info, DIB_RGB_COLORS, &pixels_, nullptr, 0);
        if (!screenDc_ || !memoryDc_ || !dib_ || !pixels_) return false;
        oldBitmap_ = SelectObject(memoryDc_, dib_);
        width_ = width;
        height_ = height;
        return true;
    }

    bool draw(HWND window, const ants::Simulation& simulation, const Screen& screen,
              bool verifyVisiblePixels = false) {
        target_->BeginDraw();
        target_->SetTransform(D2D1::Matrix3x2F::Identity());
        target_->Clear(D2D1::ColorF(0, 0.0f));
        for (const auto& a : simulation.ants()) drawAnt(a);
        target_->SetTransform(D2D1::Matrix3x2F::Identity());
        const HRESULT result = target_->EndDraw();
        if (FAILED(result)) return false;

        WICRect region{0, 0, width_, height_};
        ComPtr<IWICBitmapLock> lock;
        if (FAILED(bitmap_->Lock(&region, WICBitmapLockRead, lock.GetAddressOf()))) return false;
        UINT stride = 0, size = 0;
        BYTE* source = nullptr;
        if (FAILED(lock->GetStride(&stride)) || FAILED(lock->GetDataPointer(&size, &source))) return false;
        const std::size_t rowBytes = static_cast<std::size_t>(width_) * 4;
        if (stride < rowBytes || size < stride * static_cast<UINT>(height_)) return false;
        bool visiblePixel = false;
        for (int y = 0; y < height_; ++y) {
            std::memcpy(static_cast<BYTE*>(pixels_) + static_cast<std::size_t>(y) * rowBytes,
                        source + static_cast<std::size_t>(y) * stride, rowBytes);
            if (verifyVisiblePixels && !visiblePixel) {
                for (std::size_t x = 3; x < rowBytes; x += 4) {
                    if (source[static_cast<std::size_t>(y) * stride + x] != 0) {
                        visiblePixel = true;
                        break;
                    }
                }
            }
        }
        lock.Reset();
        if (verifyVisiblePixels && !visiblePixel) return false;
        POINT destination{screen.x, screen.y}, sourcePoint{0, 0};
        SIZE sizePoint{width_, height_};
        BLENDFUNCTION blend{AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
        return UpdateLayeredWindow(window, screenDc_, &destination, &sizePoint, memoryDc_,
                                   &sourcePoint, 0, &blend, ULW_ALPHA) != FALSE;
    }

private:
    void drawAnt(const ants::Ant& a) {
        const auto transform = D2D1::Matrix3x2F::Scale(D2D1::SizeF(a.size, a.size)) *
                               D2D1::Matrix3x2F::Rotation(a.heading * 180.0f / kPi) *
                               D2D1::Matrix3x2F::Translation(a.position.x, a.position.y);
        target_->SetTransform(transform);
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(-1.5f, 1.8f), 10.0f, 4.0f), shadow_.Get());

        // Jointed legs alternate in a tripod gait. The body has a petiole, thorax, abdomen and head.
        for (int side : {-1, 1}) {
            for (int leg = 0; leg < 3; ++leg) {
                const float root = -3.0f + 3.1f * leg;
                const float stride = std::sin(a.legPhase + (leg % 2 ? kPi : 0.0f) + (side > 0 ? kPi : 0.0f)) * 1.5f;
                const float sy = static_cast<float>(side);
                const auto hip = D2D1::Point2F(root, sy * 1.7f);
                const auto knee = D2D1::Point2F(root + stride + (leg - 1) * 1.3f, sy * 5.4f);
                const auto foot = D2D1::Point2F(root + stride + (leg - 1) * 2.3f, sy * 8.3f);
                target_->DrawLine(hip, knee, dark_.Get(), 1.0f);
                target_->DrawLine(knee, foot, brown_.Get(), 0.85f);
            }
        }
        target_->DrawLine(D2D1::Point2F(-5.0f, 0), D2D1::Point2F(5.1f, 0), dark_.Get(), 2.2f);
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(-6.4f, 0), 4.9f, 3.5f), dark_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(-6.9f, -0.8f), 3.3f, 2.2f), brown_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(-7.7f, -1.5f), 1.4f, 0.6f), highlight_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(0, 0), 2.8f, 2.3f), brown_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(5.5f, 0), 3.4f, 2.9f), dark_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(5.1f, -0.5f), 2.4f, 1.9f), brown_.Get());
        target_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(6.0f, -1.2f), 0.85f, 0.5f), highlight_.Get());
        for (int side : {-1, 1}) {
            const float sy = static_cast<float>(side);
            target_->DrawLine(D2D1::Point2F(7.5f, sy * 1.0f), D2D1::Point2F(10.2f, sy * 2.7f), dark_.Get(), 0.8f);
            target_->DrawLine(D2D1::Point2F(10.2f, sy * 2.7f), D2D1::Point2F(11.5f, sy * 3.8f), dark_.Get(), 0.65f);
            const bool biting = a.state == ants::State::biting || a.state == ants::State::attached;
            auto* jaw = biting ? bite_.Get() : dark_.Get();
            target_->DrawLine(D2D1::Point2F(8.2f, sy * 1.5f), D2D1::Point2F(10.8f, sy * (biting ? 0.35f : 1.8f)), jaw, 1.0f);
        }
        if (a.edgeContact) {
            // A tiny painted nibble is confined to this overlay; the app window is untouched.
            target_->DrawLine(D2D1::Point2F(10.5f, -2.0f), D2D1::Point2F(12.1f, -0.7f), highlight_.Get(), 0.75f);
            target_->DrawLine(D2D1::Point2F(10.5f, 2.0f), D2D1::Point2F(12.1f, 0.7f), highlight_.Get(), 0.75f);
        }
        if (a.state == ants::State::biting) {
            target_->DrawEllipse(D2D1::Ellipse(D2D1::Point2F(9.2f, 0), 3.7f, 3.7f), bite_.Get(), 0.7f);
        }
    }

    void release() {
        bite_.Reset(); shadow_.Reset(); highlight_.Reset(); brown_.Reset(); dark_.Reset();
        target_.Reset(); bitmap_.Reset(); wic_.Reset(); factory_.Reset();
        if (memoryDc_ && oldBitmap_) SelectObject(memoryDc_, oldBitmap_);
        oldBitmap_ = nullptr;
        if (dib_) DeleteObject(dib_);
        dib_ = nullptr; pixels_ = nullptr;
        if (memoryDc_) DeleteDC(memoryDc_);
        memoryDc_ = nullptr;
        if (screenDc_) ReleaseDC(nullptr, screenDc_);
        screenDc_ = nullptr;
    }

    ComPtr<ID2D1Factory> factory_;
    ComPtr<IWICImagingFactory> wic_;
    ComPtr<IWICBitmap> bitmap_;
    ComPtr<ID2D1RenderTarget> target_;
    ComPtr<ID2D1SolidColorBrush> dark_, brown_, highlight_, shadow_, bite_;
    HDC screenDc_ = nullptr, memoryDc_ = nullptr;
    HBITMAP dib_ = nullptr;
    HGDIOBJ oldBitmap_ = nullptr;
    void* pixels_ = nullptr;
    int width_ = 0, height_ = 0;
};

class App {
public:
    explicit App(HINSTANCE instance) : instance_(instance), screen_(virtualScreen()),
                                      simulation_(static_cast<float>(screen_.width), static_cast<float>(screen_.height)) {}

    int run(bool smokeTest) {
        WNDCLASSEXW wc{sizeof(wc)};
        wc.lpfnWndProc = &App::windowProc;
        wc.hInstance = instance_;
        wc.lpszClassName = L"DesktopAntInvasionOverlay";
        wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        if (!RegisterClassExW(&wc)) return 1;
        window_ = CreateWindowExW(WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                                  wc.lpszClassName, L"Desktop Ant Invasion", WS_POPUP,
                                  screen_.x, screen_.y, screen_.width, screen_.height,
                                  nullptr, nullptr, instance_, this);
        if (!window_ || !graphics_.initialize(screen_.width, screen_.height)) {
            MessageBoxW(nullptr, L"Could not initialize the transparent overlay.", L"Desktop Ant Invasion", MB_ICONERROR);
            if (window_) DestroyWindow(window_);
            return 1;
        }
        if (smokeTest) {
            simulation_.step(0.016f, {screen_.width * 0.5f, screen_.height * 0.5f}, {});
            const bool rendered = graphics_.draw(window_, simulation_, screen_, true);
            DestroyWindow(window_);
            return rendered ? 0 : 1;
        }
        ShowWindow(window_, SW_SHOWNOACTIVATE);
        SetWindowPos(window_, HWND_TOPMOST, screen_.x, screen_.y, screen_.width, screen_.height,
                     SWP_NOACTIVATE | SWP_SHOWWINDOW);
        tray_.cbSize = sizeof(tray_);
        tray_.hWnd = window_;
        tray_.uID = 1;
        tray_.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        tray_.uCallbackMessage = kTrayMessage;
        tray_.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
        wcscpy_s(tray_.szTip, L"Desktop Ant Invasion - right-click to exit");
        trayAdded_ = Shell_NotifyIconW(NIM_ADD, &tray_) != FALSE;
        hotkeyAdded_ = RegisterHotKey(window_, kHotkeyId, MOD_CONTROL | MOD_ALT | MOD_SHIFT, 'Q') != FALSE;
        SetTimer(window_, kTimerId, 33, nullptr);
        lastFrame_ = std::chrono::steady_clock::now();
        MSG message{};
        while (GetMessageW(&message, nullptr, 0, 0) > 0) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        return static_cast<int>(message.wParam);
    }

private:
    static LRESULT CALLBACK windowProc(HWND hwnd, UINT message, WPARAM wp, LPARAM lp) {
        if (message == WM_NCCREATE) {
            auto* create = reinterpret_cast<CREATESTRUCTW*>(lp);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(create->lpCreateParams));
        }
        auto* app = reinterpret_cast<App*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        return app ? app->handle(hwnd, message, wp, lp) : DefWindowProcW(hwnd, message, wp, lp);
    }

    LRESULT handle(HWND hwnd, UINT message, WPARAM wp, LPARAM lp) {
        switch (message) {
        case WM_TIMER:
            if (wp == kTimerId) { frame(); return 0; }
            break;
        case WM_DISPLAYCHANGE:
            resize();
            return 0;
        case WM_HOTKEY:
            if (wp == kHotkeyId) { DestroyWindow(hwnd); return 0; }
            break;
        case kTrayMessage:
            if (lp == WM_RBUTTONUP || lp == WM_CONTEXTMENU || lp == WM_LBUTTONDBLCLK) showMenu();
            return 0;
        case WM_COMMAND:
            if (LOWORD(wp) == kExitMenuId) { DestroyWindow(hwnd); return 0; }
            break;
        case WM_NCHITTEST:
            return HTTRANSPARENT;
        case WM_DESTROY:
            KillTimer(hwnd, kTimerId);
            if (hotkeyAdded_) UnregisterHotKey(hwnd, kHotkeyId);
            if (trayAdded_) Shell_NotifyIconW(NIM_DELETE, &tray_);
            PostQuitMessage(0);
            return 0;
        }
        return DefWindowProcW(hwnd, message, wp, lp);
    }

    static BOOL CALLBACK collectWindow(HWND hwnd, LPARAM context) {
        auto* app = reinterpret_cast<App*>(context);
        if (hwnd == app->window_ || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return TRUE;
        if (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) return TRUE;
        RECT r{};
        if (GetWindowRect(hwnd, &r) && r.right > r.left && r.bottom > r.top) {
            app->windowEdges_.push_back({static_cast<float>(r.left - app->screen_.x),
                                         static_cast<float>(r.top - app->screen_.y),
                                         static_cast<float>(r.right - app->screen_.x),
                                         static_cast<float>(r.bottom - app->screen_.y)});
        }
        return app->windowEdges_.size() < 40 ? TRUE : FALSE;
    }

    void frame() {
        const auto now = std::chrono::steady_clock::now();
        const float dt = std::chrono::duration<float>(now - lastFrame_).count();
        lastFrame_ = now;
        edgesElapsed_ += dt;
        if (edgesElapsed_ >= 0.75f) {
            windowEdges_.clear();
            EnumWindows(&App::collectWindow, reinterpret_cast<LPARAM>(this));
            edgesElapsed_ = 0;
        }
        POINT pointer{};
        GetCursorPos(&pointer);
        const ants::Vec2 cursor{static_cast<float>(pointer.x - screen_.x), static_cast<float>(pointer.y - screen_.y)};
        simulation_.step(dt, cursor, windowEdges_);
        if (!graphics_.draw(window_, simulation_, screen_)) {
            // A device loss or transient layered-window failure gets one clean rebuild.
            graphics_.initialize(screen_.width, screen_.height);
        }
    }

    void resize() {
        const Screen updated = virtualScreen();
        if (updated.x == screen_.x && updated.y == screen_.y &&
            updated.width == screen_.width && updated.height == screen_.height) return;
        screen_ = updated;
        simulation_.resize(static_cast<float>(screen_.width), static_cast<float>(screen_.height));
        graphics_.initialize(screen_.width, screen_.height);
        SetWindowPos(window_, HWND_TOPMOST, screen_.x, screen_.y, screen_.width, screen_.height,
                     SWP_NOACTIVATE | SWP_SHOWWINDOW);
        windowEdges_.clear();
        edgesElapsed_ = 1.0f;
    }

    void showMenu() {
        HMENU menu = CreatePopupMenu();
        if (!menu) return;
        AppendMenuW(menu, MF_STRING, kExitMenuId, L"Exit Desktop Ant Invasion");
        POINT point{};
        GetCursorPos(&point);
        SetForegroundWindow(window_);
        TrackPopupMenu(menu, TPM_RIGHTBUTTON, point.x, point.y, 0, window_, nullptr);
        PostMessageW(window_, WM_NULL, 0, 0);
        DestroyMenu(menu);
    }

    HINSTANCE instance_;
    HWND window_ = nullptr;
    Screen screen_;
    ants::Simulation simulation_;
    Graphics graphics_;
    std::vector<ants::Rect> windowEdges_;
    std::chrono::steady_clock::time_point lastFrame_{};
    float edgesElapsed_ = 1.0f;
    NOTIFYICONDATAW tray_{};
    bool trayAdded_ = false;
    bool hotkeyAdded_ = false;
};
} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR commandLine, int) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    HANDLE mutex = CreateMutexW(nullptr, TRUE, L"Local\\DesktopAntInvasionSingleInstance");
    if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
        if (mutex) CloseHandle(mutex);
        return 0;
    }
    const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(com)) { CloseHandle(mutex); return 1; }
    const int result = App(instance).run(wcscmp(commandLine, L"--smoke-test") == 0);
    CoUninitialize();
    ReleaseMutex(mutex);
    CloseHandle(mutex);
    return result;
}
