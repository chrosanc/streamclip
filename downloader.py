import subprocess
import shutil
from pathlib import Path
import yt_dlp


def prepare_local_file(file_path: str, out_dir: str = "work") -> tuple[str, str]:
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    video_path = f"{out_dir}/source.mp4"
    audio_path = f"{out_dir}/source.mp3"
    shutil.copy2(Path(file_path), video_path)
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path,
         "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audio_path],
        check=True,
    )
    return video_path, audio_path


def download_audio(url: str, out_dir: str = "work") -> tuple[str, str]:
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "format": "bestvideo[height<=1080]+bestaudio/best",
        "outtmpl": f"{out_dir}/source.%(ext)s",
        "merge_output_format": "mp4",
        "quiet": False,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(url, download=True)
    video_path = f"{out_dir}/source.mp4"
    audio_path = f"{out_dir}/source.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path,
         "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audio_path],
        check=True,
    )
    return video_path, audio_path
