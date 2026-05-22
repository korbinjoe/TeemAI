{
  "targets": [{
    "target_name": "notch_helper",
    "sources": ["notch_helper.mm"],
    "conditions": [
      ["OS=='mac'", {
        "xcode_settings": {
          "GCC_ENABLE_OBJC_ARC": "YES",
          "CLANG_CXX_LIBRARY": "libc++",
          "MACOSX_DEPLOYMENT_TARGET": "12.0"
        },
        "link_settings": {
          "libraries": ["-framework Cocoa"]
        }
      }]
    ],
    "defines": ["NAPI_VERSION=8"]
  }]
}
