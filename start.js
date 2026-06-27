// Launcher script — runs the Electron app from the project root
const { spawn } = require("child_process");
const path = require("path");

const electronExe = path.join(__dirname, "electron", "node_modules", "electron", "dist", "electron.exe");
const appDir = path.join(__dirname, "electron");

spawn(electronExe, [appDir], {
  stdio: "inherit",
  cwd: appDir,
  detached: true,
}).unref();