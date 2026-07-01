<img width="986" height="643" alt="image" src="https://github.com/user-attachments/assets/77db7d1c-7e98-4aa2-9f1a-f3fd12de3de9" />

# 🎬 StreamClip

Auto Clipper Application for streams. Download your own videos or use videos from disk. Use your own LLM's API.

## Download

- **Installer**: [StreamClip Setup 1.0.0.exe](https://github.com/chrosanc/streamclip/releases/download/v1.0.0/StreamClip%20Setup%201.0.0.exe) (396.6 MB)
- **Portable**: [StreamClip-win.zip](https://github.com/chrosanc/streamclip/releases/download/v1.0.0/StreamClip-win.zip) (549.6 MB)

*Choose installer for easy setup, or portable ZIP for no-install use.*

## How it works
1. Downloads YouTube video with `yt-dlp`.
2. Extracts audio and transcribes it via **Groq Whisper API** (free, word-level timestamps).
3. Sends transcript to **Groq Llama 3.3** to score viral moments.
4. Cuts top moments, crops 9:16, burns animated subtitles using `ffmpeg`.

## Requirements
- **Python 3.10+**
- **Node.js 18+**
- **ffmpeg** on PATH (https://www.gyan.dev/ffmpeg/builds/ for Windows)
- **Groq API key** — free at https://console.groq.com/keys

## Setup

```powershell
# Python deps
pip install -r requirements.txt

# Electron deps
cd electron
npm install
```

## Run

```powershell
cd electron
npm start
```

1. Paste your Groq API key in **Settings**, click **Save**.
2. Paste a YouTube URL, choose clip count, click **Start Clipping**.
3. Clips appear in your output folder (e.g. `%APPDATA%\streamclip\clips`).

## CLI only (without Electron)

```powershell
python runner.py "https://youtube.com/watch?v=XXX" -n 5 -o output
```

## Project layout
```
streamclip/
├── downloader.py     # yt-dlp + audio extraction
├── transcriber.py    # Groq Whisper (chunked, 10-min slices)
├── analyzer.py       # Groq Llama viral-moment scorer
├── editor.py         # ASS karaoke subs + ffmpeg crop/burn
├── runner.py         # Pipeline entry, emits JSON progress lines
├── requirements.txt
└── electron/
    ├── main.js       # Spawns python, IPC bridge
    ├── preload.js
    ├── index.html
    ├── styles.css
    └── renderer.js
```

## Customizing captions
Edit the ASS styles in `editor.py` (`_make_ass` function):
- `Style: Active,Arial,40,...` — change font, size, colors (yellow `&H0000FFFF`).
- `Alignment=2` is bottom-center, `MarginV=80` lifts captions off the edge.

