const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
const dataPath = app.getPath("userData");
const settingsFile = path.join(dataPath, "settings.json");

// Add local electron folder to PATH so local ffmpeg/ffprobe are found
const localBinPath = __dirname;
if (process.platform === "win32") {
  process.env.PATH = `${localBinPath};${process.env.PATH}`;
} else {
  process.env.PATH = `${localBinPath}:${process.env.PATH}`;
}

let win, pythonProcess;

function ensureFFmpeg() {
  const ffmpegExe = path.join(localBinPath, "ffmpeg.exe");
  if (fs.existsSync(ffmpegExe)) return;
  try {
    const zipPath = path.join(localBinPath, "ffmpeg.zip");
    // Download ffmpeg zip (Windows build)
    const url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
    // Use PowerShell to download
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${zipPath}'"`, { stdio: "ignore" });
    // Extract ffmpeg.exe from zip (assumes top-level folder contains bin/ffmpeg.exe)
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${localBinPath}' -Force"`, { stdio: "ignore" });
    // Move ffmpeg.exe to localBinPath root if nested
    const extractedBin = path.join(localBinPath, "ffmpeg-*-essentials_build", "bin", "ffmpeg.exe");
    const files = fs.readdirSync(localBinPath).filter(f => f.startsWith("ffmpeg-"));
    if (files.length) {
      const src = path.join(localBinPath, files[0], "bin", "ffmpeg.exe");
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, ffmpegExe);
      }
    }
    // Cleanup zip and extracted folder
    try { fs.unlinkSync(zipPath); } catch {}
    // Optionally remove extracted folder
  } catch (e) {
    dialog.showErrorBox("FFmpeg Download Failed", "Unable to download FFmpeg. Please install it manually.");
  }
}

function checkRequirements() {
  const rootDir = isDev ? path.join(__dirname, "..") : process.resourcesPath;
  const reqPath = path.join(rootDir, "requirements.txt");

  ensureFFmpeg();
  // 1. Check ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch (e) {
    dialog.showErrorBox(
      "FFmpeg Missing",
      "FFmpeg is not installed or not on your PATH. Please install FFmpeg to use StreamClip."
    );
  }

  // 2. Install Python requirements
  try {
    const pythonCmd = "python";
    execSync(`"${pythonCmd}" -m pip install -r "${reqPath}"`, { stdio: "ignore" });
  } catch (e) {
    const code = e.status;
    if (code !== 0 && code !== 1) {
      dialog.showErrorBox(
        "Python Dependencies Error",
        "Failed to install Python requirements. Make sure Python 3 is installed and on your PATH.\n\nError: " + e.message
      );
    }
  }
}

function loadSettings() {
  if (fs.existsSync(settingsFile)) {
    return JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
  }
  return {
    stt: { preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "", model: "whisper-large-v3" },
    llm: { preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "", model: "llama-3.3-70b-versatile" },
    outputDir: path.join(dataPath, "clips"),
  };
}

function saveSettings(settings) {
  fs.mkdirSync(dataPath, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

app.on("ready", () => {
  checkRequirements();

  win = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile("index.html");
  if (isDev) win.webContents.openDevTools();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC: get settings
ipcMain.handle("getSettings", () => loadSettings());

// IPC: save settings
ipcMain.handle("saveSettings", (_, settings) => {
  saveSettings(settings);
  return true;
});

// IPC: run clipper
ipcMain.handle("runClipper", (_, opts) => {
  const { url, numClips, outputDir, stt, llm, local, localPath, startTime, endTime, template, layout, facecamPos, facecamCustom, portraitScreenLayout, portraitFcLayout, portraitBgPan, captionFont, captionSize, captionBaseColor, captionHlColor, captionOutlineColor, clipFps, clipBitrate, maxClipDuration } = opts;
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const pythonPath = isDev ? "python" : path.join(process.resourcesPath, "python");
    const script = isDev ? path.join(__dirname, "..", "runner.py") : path.join(process.resourcesPath, "runner.py");

    const fontArgs = [
      "--caption-font", captionFont || "Arial",
      "--caption-size", String(captionSize || 56),
      "--caption-base-color", captionBaseColor || "#ffffff",
      "--caption-hl-color", captionHlColor || "#00ff00",
      "--caption-outline-color", captionOutlineColor || "#000000",
      "--fps", String(clipFps || 30),
      "--bitrate", String(clipBitrate || 8),
      "--max-clip-duration", String(maxClipDuration || 60),
    ];
    const baseArgs = local && localPath
      ? [script, localPath, "-n", String(numClips), "-o", outputDir, "--local", "--template", template, "--layout", layout, "--facecam-pos", facecamPos, "--facecam-custom", facecamCustom || "0.7,0.02,0.28,0.28", "--portrait-screen-layout", portraitScreenLayout || "0,0,1,1", "--portrait-fc-layout", portraitFcLayout || "0,0.078125,1,0", "--portrait-bg-pan", portraitBgPan || "0.5,0.5", ...fontArgs]
      : [script, url, "-n", String(numClips), "-o", outputDir, "--template", template, "--layout", layout, "--facecam-pos", facecamPos, "--facecam-custom", facecamCustom || "0.7,0.02,0.28,0.28", "--portrait-screen-layout", portraitScreenLayout || "0,0,1,1", "--portrait-fc-layout", portraitFcLayout || "0,0.078125,1,0", "--portrait-bg-pan", portraitBgPan || "0.5,0.5", ...fontArgs];

    if (startTime > 0) baseArgs.push("--start", String(startTime));
    if (endTime > 0) baseArgs.push("--end", String(endTime));

    pythonProcess = spawn(pythonPath, baseArgs, {
      cwd: isDev ? path.join(__dirname, "..") : process.resourcesPath,
      env: {
        ...process.env,
        STT_BASE_URL: stt.baseUrl,
        STT_API_KEY: stt.apiKey,
        STT_MODEL: stt.model,
        LLM_BASE_URL: llm.baseUrl,
        LLM_API_KEY: llm.apiKey,
        LLM_MODEL: llm.model,
      },
    });

    let output = "";
    let stderrOutput = "";
    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
      const lines = output.split("\n");
      output = lines.pop(); // keep incomplete line
      lines.forEach((line) => {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            win.webContents.send("clipperProgress", json);
          } catch (e) {}
        }
      });
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrOutput += data.toString();
      console.error(`Python stderr: ${data.toString()}`);
    });

    pythonProcess.on("error", (err) => reject(err));
    pythonProcess.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Python process exited with code ${code}\nStderr: ${stderrOutput.trim()}`));
    });
  });
});

// IPC: stop clipper
ipcMain.handle("stopClipper", () => {
  if (pythonProcess) pythonProcess.kill();
  return true;
});

// IPC: open folder
ipcMain.handle("openFolder", (_, folderPath) => {
  if (folderPath) require("electron").shell.openPath(folderPath);
});

// IPC: open external URL in browser
ipcMain.handle("openExternal", (_, url) => {
  require("electron").shell.openExternal(url);
});

// IPC: open the current output folder
ipcMain.handle("openOutput", () => {
  const s = loadSettings();
  if (s.outputDir) require("electron").shell.openPath(s.outputDir);
});

// IPC: pick a folder
ipcMain.handle("pickFolder", async () => {
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// IPC: pick a video/audio file
ipcMain.handle("pickFile", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "Video/Audio", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "m4a", "flac", "aac", "ogg"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// IPC: get duration (seconds) of a local video/audio file via ffprobe
ipcMain.handle("getVideoDuration", (_, filePath) => {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    );
    const dur = parseFloat(out.trim());
    return isNaN(dur) ? 0 : dur;
  } catch (e) {
    return 0;
  }
});
