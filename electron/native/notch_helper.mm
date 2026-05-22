/**
 * notch_helper — minimal ObjC addon
 *
 * Solves the problem where Electron BrowserWindow cannot position at y=0 (menu bar/notch area).
 * macOS NSWindow.constrainFrameRect:toScreen: forces windows into the workArea.
 *
 * This addon uses isa-swizzle to create an unconstrained NSWindow subclass,
 * and sets the window level to NSStatusWindowLevel + 1, allowing it to cover the menu bar area.
 *
 * Exported API:
 *   setNotchLevel(nativeHandle: Buffer) → boolean
 *   resetPosition(nativeHandle: Buffer, x: number, y: number) → boolean
 */

#include <node_api.h>
#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// ── Dynamic subclass: unconstrained window positioning ──

static Class g_notchWindowClass = nil;

static NSRect unconstrained_constrainFrameRect(id self, SEL _cmd, NSRect frameRect, NSScreen* screen) {
    (void)self; (void)_cmd; (void)screen;
    return frameRect; // Unconstrained, allow y=0
}

static void ensureNotchWindowClass(NSWindow* window) {
    if (g_notchWindowClass) return;

    // Create subclass based on the window's actual class (Electron may have already subclassed NSWindow)
    const char* className = "openteamNotchWindow";
    g_notchWindowClass = objc_allocateClassPair(object_getClass(window), className, 0);
    if (!g_notchWindowClass) {
        // Class name conflict, try to find the already registered one
        g_notchWindowClass = objc_getClass(className);
        return;
    }

    // Get type encoding of the original method
    Method originalMethod = class_getInstanceMethod([NSWindow class], @selector(constrainFrameRect:toScreen:));
    const char* typeEncoding = method_getTypeEncoding(originalMethod);

    class_addMethod(g_notchWindowClass,
                    @selector(constrainFrameRect:toScreen:),
                    (IMP)unconstrained_constrainFrameRect,
                    typeEncoding);

    objc_registerClassPair(g_notchWindowClass);
}

// ── N-API: setNotchLevel ──

static NSWindow* getWindowFromHandle(napi_env env, napi_value handleArg) {
    void* data = nullptr;
    size_t length = 0;
    napi_get_buffer_info(env, handleArg, &data, &length);

    if (!data || length < sizeof(void*)) {
        napi_throw_error(env, nullptr, "Invalid native window handle");
        return nil;
    }

    NSView* view = *reinterpret_cast<NSView**>(data);
    if (!view || ![view isKindOfClass:[NSView class]]) {
        napi_throw_error(env, nullptr, "Handle is not a valid NSView");
        return nil;
    }

    NSWindow* window = [view window];
    if (!window) {
        napi_throw_error(env, nullptr, "NSView has no associated NSWindow");
        return nil;
    }

    return window;
}

static napi_value SetNotchLevel(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    NSWindow* window = getWindowFromHandle(env, args[0]);
    if (!window) return nullptr;

    // 1. Isa-swizzle: bypass constrainFrameRect constraint
    ensureNotchWindowClass(window);
    object_setClass(window, g_notchWindowClass);

    // 2. Window level: above menu bar
    [window setLevel:NSStatusWindowLevel + 1];

    // 3. Behavior: visible on all spaces + stationary + fullscreen auxiliary
    [window setCollectionBehavior:
        NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorStationary |
        NSWindowCollectionBehaviorFullScreenAuxiliary];

    // 4. No shadow
    [window setHasShadow:NO];

    // 5. Reposition to y=0 (no longer constrained back)
    NSScreen* screen = [NSScreen mainScreen];
    if (screen) {
        CGFloat screenHeight = screen.frame.size.height;
        NSRect frame = window.frame;
        // Cocoa y=0 is at screen bottom, Electron y=0 is at top
        // Electron y=0 → Cocoa y = screenHeight - windowHeight
        frame.origin.y = screenHeight - frame.size.height;
        [window setFrame:frame display:YES];
    }

    NSLog(@"[notch_helper] Window level set to %ld, positioned at y=0", (long)window.level);

    napi_value result;
    napi_get_boolean(env, true, &result);
    return result;
}

// ── N-API: resetPosition (external call to reposition) ──

static napi_value ResetPosition(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    NSWindow* window = getWindowFromHandle(env, args[0]);
    if (!window) return nullptr;

    double x = 0, y = 0;
    napi_get_value_double(env, args[1], &x);
    napi_get_value_double(env, args[2], &y);

    NSScreen* screen = [NSScreen mainScreen];
    if (screen) {
        CGFloat screenHeight = screen.frame.size.height;
        NSRect frame = window.frame;
        frame.origin.x = x;
        frame.origin.y = screenHeight - y - frame.size.height;
        [window setFrame:frame display:YES];
    }

    napi_value result;
    napi_get_boolean(env, true, &result);
    return result;
}

// ── Module Init ──

static napi_value Init(napi_env env, napi_value exports) {
    napi_value setFn, resetFn;

    napi_create_function(env, "setNotchLevel", NAPI_AUTO_LENGTH, SetNotchLevel, nullptr, &setFn);
    napi_set_named_property(env, exports, "setNotchLevel", setFn);

    napi_create_function(env, "resetPosition", NAPI_AUTO_LENGTH, ResetPosition, nullptr, &resetFn);
    napi_set_named_property(env, exports, "resetPosition", resetFn);

    return exports;
}

NAPI_MODULE(notch_helper, Init)
