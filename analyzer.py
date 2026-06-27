import os
import json
import sys
import time
from openai import OpenAI


def _log(msg: str):
    """Emit a log line that the Electron UI will pick up via JSON parsing."""
    print(json.dumps({"stage": "analyze", "msg": msg}), flush=True)
    # Also write to stderr for raw console visibility.
    print(msg, file=sys.stderr, flush=True)

def _valid_json_clips(raw: str) -> tuple[list[dict], bool] | None:
    """Try to extract clips + is_gaming from raw LLM response. Returns None on failure."""
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```")[-2] if "```" in stripped[3:] else stripped
        stripped = stripped.lstrip("`").lstrip("json").strip()
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    clips = data.get("clips", [])
    is_gaming = data.get("is_gaming", False)
    return clips, is_gaming

PROMPT = """You are a viral short-form video editor (like Opus Clip).
Below is a timestamped transcript of a long stream. Find the {n} MOST viral,
self-contained moments that would perform well as TikTok/YouTube Shorts.

Also, determine if the content is gaming-related (e.g., playing a video game, discussing gameplay, streaming a game).

Rules:
- Each clip must be 20-60 seconds long.
- Must start and end on a clean sentence boundary.
- Prioritize: strong hooks, emotion, controversy, humor, surprising facts, or payoff.
- Give each a punchy title and a virality score 0-100.

Return STRICT JSON only, no markdown, no explanation:
{{"is_gaming": true_or_false, "clips": [{{"title": "...", "start": number, "end": number, "score": number, "reason": "..."}}]}}

Transcript:
{transcript}
"""


def _to_text(words: list[dict]) -> str:
    lines, buf, buf_start = [], [], None
    for w in words:
        if buf_start is None:
            buf_start = w["start"]
        buf.append(w["word"])
        if len(buf) >= 20:
            lines.append(f"[{buf_start:.1f}] {''.join(buf).strip()}")
            buf, buf_start = [], None
    if buf:
        lines.append(f"[{buf_start:.1f}] {''.join(buf).strip()}")
    return "\n".join(lines)


def find_viral_moments(words: list[dict], n: int = 5) -> tuple[list[dict], bool]:
    api_key = os.environ.get("LLM_API_KEY", os.environ.get("GROQ_API_KEY"))
    base_url = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")

    client = OpenAI(api_key=api_key, base_url=base_url)
    transcript = _to_text(words)
    _log(f"Transcript: {len(transcript)} chars, {len(words)} words")
    if len(transcript) < 100:
        _log(f"Transcript too short to analyze: {transcript[:200]!r}")
        return [], False
    # Truncate very long transcripts to avoid hitting the context/output length limit.
    # ~12 000 chars ≈ 3 000 tokens, leaving plenty of room for the JSON response.
    MAX_TRANSCRIPT_CHARS = 12000
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        _log(f"Transcript too long ({len(transcript)} chars), truncating to {MAX_TRANSCRIPT_CHARS}...")
        transcript = transcript[:MAX_TRANSCRIPT_CHARS]

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        _log(f"Analyzing transcript (attempt {attempt}/{max_retries})...")
        try:
            # Try with response_format first
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user",
                               "content": PROMPT.format(n=n, transcript=transcript)}],
                    response_format={"type": "json_object"},
                    temperature=0.4 + (attempt - 1) * 0.15, # slightly increase temp on retry
                    max_tokens=4000,
                )
            except Exception as e:
                _log(f"response_format failed ({e}), retrying without it")
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user",
                               "content": PROMPT.format(n=n, transcript=transcript)}],
                    temperature=0.4 + (attempt - 1) * 0.15,
                    max_tokens=4000,
                )
            
            choice = resp.choices[0]
            content = choice.message.content
            if not content:
                _log(f"Attempt {attempt} failed: Empty content. Finish reason: {choice.finish_reason}")
                time.sleep(1)
                continue

            res = _valid_json_clips(content)
            if res is None:
                _log(f"Attempt {attempt} failed: Invalid JSON format.")
                time.sleep(1)
                continue

            clips, is_gaming = res
            if not clips:
                _log(f"Attempt {attempt} failed: Returned 0 clips.")
                time.sleep(1)
                continue

            # Success! Guard against missing/invalid score fields.
            for c in clips:
                if not isinstance(c.get("score"), (int, float)):
                    c["score"] = 0
            clips.sort(key=lambda c: c.get("score", 0), reverse=True)
            return clips[:n], is_gaming

        except Exception as e:
            _log(f"Attempt {attempt} failed with error: {e}")
            time.sleep(1)

    _log("All analysis attempts failed. Returning empty list.")
    return [], False
