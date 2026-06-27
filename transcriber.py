import os
import math
import time
import subprocess
from pathlib import Path
from openai import OpenAI
import requests

CHUNK_SECONDS = 300  # 5 min chunks (safer for API size limits)
MAX_CHUNK_MB = 24  # re-chunk if file exceeds this

def _audio_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())

def _trim_audio(audio_path: str, start: float, end: float, out_path: str):
    duration = end - start
    subprocess.run(
        ["ffmpeg", "-y", "-i", audio_path, "-ss", str(start),
         "-t", str(duration),
         "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
         out_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

def _transcribe_assemblyai(audio_path: str, api_key: str, start_time: float = 0, end_time: float = None) -> list[dict]:
    """Transcribe using AssemblyAI API (supports up to 5GB, no chunking needed)."""
    full_duration = _audio_duration(audio_path)
    work = Path(audio_path).parent

    range_start = max(0, start_time)
    range_end = min(end_time if end_time else full_duration, full_duration)

    if range_start > 0 or range_end < full_duration:
        trimmed_path = str(work / "trimmed_range.mp3")
        _trim_audio(audio_path, range_start, range_end, trimmed_path)
        src_path = trimmed_path
        time_offset = range_start
    else:
        src_path = audio_path
        time_offset = 0

    headers = {"authorization": api_key}

    # 1. Upload
    with open(src_path, "rb") as f:
        upload_resp = requests.post("https://api.assemblyai.com/v2/upload", headers=headers, data=f)
        upload_resp.raise_for_status()
        upload_url = upload_resp.json()["upload_url"]

    # 2. Request transcript
    transcript_resp = requests.post(
        "https://api.assemblyai.com/v2/transcript",
        headers={**headers, "content-type": "application/json"},
        json={"audio_url": upload_url, "word_boost": []},
    )
    transcript_resp.raise_for_status()
    transcript_id = transcript_resp.json()["id"]

    # 3. Poll
    while True:
        poll_resp = requests.get(f"https://api.assemblyai.com/v2/transcript/{transcript_id}", headers=headers)
        poll_resp.raise_for_status()
        result = poll_resp.json()
        status = result["status"]
        if status == "completed":
            words = []
            for w in result.get("words", []):
                words.append({
                    "word": w["text"],
                    "start": w["start"] / 1000.0 + time_offset,  # ms -> s
                    "end": w["end"] / 1000.0 + time_offset,
                })
            break
        elif status == "error":
            raise Exception(result.get("error", "AssemblyAI transcription failed"))
        time.sleep(3)

    # Cleanup
    trimmed = work / "trimmed_range.mp3"
    if trimmed.exists():
        trimmed.unlink()

    return words

def transcribe(audio_path: str, start_time: float = 0, end_time: float = None) -> list[dict]:
    api_key = os.environ.get("STT_API_KEY", os.environ.get("GROQ_API_KEY"))
    base_url = os.environ.get("STT_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.environ.get("STT_MODEL", "whisper-large-v3")

    # Use AssemblyAI native API if base_url contains assemblyai
    if "assemblyai" in base_url.lower():
        return _transcribe_assemblyai(audio_path, api_key, start_time, end_time)

    client = OpenAI(api_key=api_key, base_url=base_url)
    full_duration = _audio_duration(audio_path)
    work = Path(audio_path).parent

    range_start = max(0, start_time)
    range_end = min(end_time if end_time else full_duration, full_duration)
    
    if range_start > 0 or range_end < full_duration:
        trimmed_path = str(work / "trimmed_range.mp3")
        _trim_audio(audio_path, range_start, range_end, trimmed_path)
        src_path = trimmed_path
        time_offset = range_start
    else:
        src_path = audio_path
        time_offset = 0

    src_duration = _audio_duration(src_path)
    n_chunks = math.ceil(src_duration / CHUNK_SECONDS)

    all_words: list[dict] = []

    for i in range(n_chunks):
        chunk_start = i * CHUNK_SECONDS
        chunk = str(work / f"chunk_{i}.mp3")
        subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-ss", str(chunk_start),
             "-t", str(CHUNK_SECONDS),
             "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
             chunk],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

        chunk_size_mb = os.path.getsize(chunk) / (1024 * 1024)
        if chunk_size_mb > MAX_CHUNK_MB:
            os.remove(chunk)
            sub_duration = CHUNK_SECONDS // 2
            for j in range(2):
                sub_start = chunk_start + j * sub_duration
                sub_chunk = str(work / f"chunk_{i}_sub{j}.mp3")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", src_path, "-ss", str(sub_start),
                     "-t", str(sub_duration),
                     "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
                     sub_chunk],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                with open(sub_chunk, "rb") as f:
                    resp = client.audio.transcriptions.create(
                        file=(os.path.basename(sub_chunk), f.read()),
                        model=model,
                        response_format="verbose_json",
                        timestamp_granularities=["word"],
                    )
                for w in (resp.words or []):
                    all_words.append({
                        "word": w["word"],
                        "start": w["start"] + sub_start + time_offset,
                        "end": w["end"] + sub_start + time_offset,
                    })
                os.remove(sub_chunk)
            continue

        with open(chunk, "rb") as f:
            resp = client.audio.transcriptions.create(
                file=(os.path.basename(chunk), f.read()),
                model=model,
                response_format="verbose_json",
                timestamp_granularities=["word"],
            )
        for w in (resp.words or []):
            all_words.append({
                "word": w["word"],
                "start": w["start"] + chunk_start + time_offset,
                "end": w["end"] + chunk_start + time_offset,
            })
        os.remove(chunk)

    trimmed = work / "trimmed_range.mp3"
    if trimmed.exists():
        trimmed.unlink()

    return all_words
