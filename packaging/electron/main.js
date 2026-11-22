const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

let webProc = null;
let pyProc = null;
let win = null;

const userData = app.getPath("userData");
const dataDir = path.join(userData, "data");
const logFile = path.join(userData, "launcher.log");
fs.mkdirSync(dataDir, { recursive: true });

function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

function resource(...parts) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(base, ...parts);
}

function secret() {
  const file = path.join(userData, "session-secret.txt");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const value = require("crypto").randomBytes(48).toString("hex");
    fs.writeFileSync(file, value);
    return value;
  }
}

function waitForPort(port, tries, done) {
  const check = () => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => {
      socket.destroy();
      if (tries-- > 0) setTimeout(check, 700);
      else done(false);
    });
  };
  check();
}

function startServices() {
  const appDir = resource("app");
  // electron-builder loai thu muc "node_modules" khoi extraResources -> ta doi ten thanh "deps"
  const depsDir = path.join(appDir, "deps");
  const modulesDir = path.join(appDir, "node_modules");
  let nodePath = "";
  if (fs.existsSync(depsDir) && !fs.existsSync(modulesDir)) {
    try {
      fs.renameSync(depsDir, modulesDir);
      log("rename deps -> node_modules OK");
    } catch (e) {
      // May co the cai vao Program Files (khong ghi duoc) -> dung NODE_PATH thay vi doi ten
      log(`rename deps that bai, dung NODE_PATH: ${e.message}`);
      nodePath = depsDir;
    }
  }
  const serverJs = path.join(appDir, "server.js");
  const pythonExe = resource("python", "python.exe");
  const sitePackages = resource("site-packages");
  const voiceScript = resource("vieneu-server", "server.py");

  log(`appDir=${appDir} python=${pythonExe}`);

  if (!fs.existsSync(serverJs) || !fs.existsSync(pythonExe)) {
    dialog.showErrorBox("Thiếu tài nguyên", "Không tìm thấy server.js hoặc python.exe trong gói cài đặt.");
    app.quit();
    return;
  }

  webProc = spawn(process.execPath, [serverJs], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      DATA_DIR: dataDir,
      SESSION_SECRET: secret(),
      NODE_PATH: nodePath || undefined,
    },
    windowsHide: true,
  });
  webProc.stdout.on("data", (d) => log(`[web] ${d}`));
  webProc.stderr.on("data", (d) => log(`[web:err] ${d}`));
  webProc.on("exit", (code) => log(`[web] exit code=${code}`));

  pyProc = spawn(pythonExe, ["-u", voiceScript], {
    cwd: path.dirname(voiceScript),
    env: {
      ...process.env,
      PYTHONPATH: sitePackages,
      PYTHONIOENCODING: "utf-8",
      HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      HF_HOME: path.join(userData, "hf-cache"),
    },
    windowsHide: true,
  });
  pyProc.stdout.on("data", (d) => log(`[py] ${d}`));
  pyProc.stderr.on("data", (d) => log(`[py:err] ${d}`));
  pyProc.on("exit", (code) => log(`[py] exit ${code}`));

  waitForPort(3000, 180, (ok) => {
    if (!ok) {
      dialog.showErrorBox("Khởi động thất bại", `Xem log tại:\n${logFile}`);
      app.quit();
      return;
    }
    createWindow();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Text to Voice",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL("http://127.0.0.1:3000");
  win.on("closed", () => {
    win = null;
  });
}

function cleanup() {
  for (const p of [webProc, pyProc]) {
    if (p && !p.killed) {
      try {
        p.kill();
      } catch {}
    }
  }
}

app.whenReady().then(startServices);
app.on("window-all-closed", () => {
  cleanup();
  app.quit();
});
app.on("before-quit", cleanup);
