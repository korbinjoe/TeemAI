// scripts/verify-notch-window.ts
import { app, BrowserWindow, screen } from "electron";
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var loadAddon = () => {
  try {
    const require2 = createRequire(import.meta.url);
    const baseDir = dirname(fileURLToPath(import.meta.url));
    return require2(join(baseDir, "..", "electron", "native", "build", "Release", "notch_helper.node"));
  } catch (err) {
    console.error("[Verify] Addon load failed:", err);
    return null;
  }
};
app.whenReady().then(() => {
  const display = screen.getPrimaryDisplay();
  const screenWidth = display.size.width;
  const hasNotch = display.workArea.y > 30;
  console.log(`Screen: ${screenWidth}x${display.size.height} @${display.scaleFactor}x`);
  console.log(`workArea.y: ${display.workArea.y}, hasNotch: ${hasNotch}`);
  const windowWidth = 380;
  const windowX = Math.round((screenWidth - windowWidth) / 2);
  const win = new BrowserWindow({
    x: windowX,
    y: 0,
    width: windowWidth,
    height: 400,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.setAlwaysOnTop(true, "status");
  win.setIgnoreMouseEvents(true, { forward: true });
  const addon = loadAddon();
  if (addon) {
    addon.setNotchLevel(win.getNativeWindowHandle());
  }
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; font-family: -apple-system, sans-serif; }

  #container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding-top: 32px; /* \u5218\u6D77\u9AD8\u5EA6\u5360\u4F4D */
  }

  #widget {
    background: #000;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    margin: 0 auto;
  }

  #widget.compact {
    width: 200px;
    height: 10px;
    border-radius: 0 0 10px 10px;
  }

  #widget.expanded {
    width: 340px;
    min-height: 160px;
    border-radius: 0 0 20px 20px;
  }

  .compact-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 100%;
  }

  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }

  .dot.green { background: #4ade80; animation: pulse 2s infinite; }
  .dot.yellow { background: #facc15; }
  .dot.blue { background: #60a5fa; }

  .expanded-content {
    padding: 12px 16px;
    display: none;
  }

  #widget.expanded .expanded-content { display: block; }
  #widget.expanded .compact-dots { display: none; }
  #widget.compact .expanded-content { display: none; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .header-label {
    color: rgba(255,255,255,0.6);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .agent-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    margin-bottom: 4px;
  }

  .agent-row:hover { background: rgba(255,255,255,0.05); }

  .agent-name {
    color: rgba(255,255,255,0.9);
    font-size: 12px;
    font-weight: 500;
  }

  .agent-status {
    color: rgba(255,255,255,0.4);
    font-size: 10px;
  }

  .progress-bar {
    width: 48px;
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    overflow: hidden;
    margin-left: auto;
  }

  .progress-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .input-row input {
    flex: 1;
    background: rgba(255,255,255,0.05);
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    color: rgba(255,255,255,0.9);
    font-size: 12px;
    outline: none;
  }

  .input-row input::placeholder { color: rgba(255,255,255,0.25); }
  .input-row input:focus { background: rgba(255,255,255,0.1); }

  .close-btn {
    color: rgba(255,255,255,0.3);
    font-size: 10px;
    cursor: pointer;
    padding: 4px 8px;
    text-align: center;
    margin-top: 4px;
  }

  .close-btn:hover { color: rgba(255,255,255,0.7); }

  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
</head>
<body>
  <div id="container">
    <div id="widget" class="compact">
      <div class="compact-dots">
        <div class="dot green"></div>
        <div class="dot yellow"></div>
        <div class="dot blue"></div>
      </div>
      <div class="expanded-content">
        <div class="header">
          <span class="header-label">3 agents active</span>
          <span style="color:rgba(255,255,255,0.3);font-size:10px">$0.042</span>
        </div>
        <div class="agent-row">
          <div class="dot green"></div>
          <span class="agent-name">Frontend Dev</span>
          <span class="agent-status">Working</span>
          <div class="progress-bar"><div class="progress-fill" style="width:72%;background:#4ade80"></div></div>
        </div>
        <div class="agent-row">
          <div class="dot yellow"></div>
          <span class="agent-name">API Engineer</span>
          <span class="agent-status">Waiting</span>
          <div class="progress-bar"><div class="progress-fill" style="width:45%;background:#facc15"></div></div>
        </div>
        <div class="agent-row">
          <div class="dot blue"></div>
          <span class="agent-name">Test Runner</span>
          <span class="agent-status">Thinking</span>
          <div class="progress-bar"><div class="progress-fill" style="width:20%;background:#60a5fa"></div></div>
        </div>
        <div class="input-row">
          <input type="text" placeholder="Send a quick command..." />
        </div>
        <div class="close-btn" id="closeBtn">Collapse</div>
      </div>
    </div>
  </div>
  <script>
    const widget = document.getElementById('widget');
    const closeBtn = document.getElementById('closeBtn');
    let expanded = false;

    widget.addEventListener('mouseenter', () => {
      // \u901A\u77E5\u4E3B\u8FDB\u7A0B\u53D6\u6D88\u9F20\u6807\u7A7F\u900F
      console.log('[Notch] mouseenter');
    });

    widget.addEventListener('mouseleave', () => {
      console.log('[Notch] mouseleave');
    });

    widget.addEventListener('click', (e) => {
      if (e.target === closeBtn || e.target.closest('#closeBtn')) return;
      if (!expanded) {
        expanded = true;
        widget.className = 'expanded';
        console.log('[Notch] Expanded');
      }
    });

    closeBtn.addEventListener('click', () => {
      expanded = false;
      widget.className = 'compact';
      console.log('[Notch] Collapsed');
    });
  </script>
</body>
</html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.once("ready-to-show", () => {
    win.show();
    setTimeout(() => {
      const bounds = win.getBounds();
      console.log(`
Window: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`);
      console.log(bounds.y === 0 ? "\u2705 Window at y=0 \u2014 notch rendering confirmed" : `\u274C Window at y=${bounds.y}`);
      console.log("\n\u{1F3AF} Interactive test ready:");
      console.log("  - You should see a small black pill below the notch");
      console.log("  - Hover over it \u2192 compact dots visible");
      console.log("  - Click \u2192 expands to show agent list");
      console.log('  - Click "Collapse" \u2192 shrinks back');
      console.log("  - Press Cmd+Q to quit");
    }, 500);
  });
});
app.on("window-all-closed", () => app.quit());
