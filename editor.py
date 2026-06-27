import subprocess
from pathlib import Path


# CapCut-style caption templates. ASS colours are &HAABBGGRR (alpha,blue,green,red).
# Each template renders a short phrase with the spoken word highlighted (colour + pop scale).
TEMPLATES = {
    # White text, bright green pop — the most common CapCut auto-caption look.
    "capcut":  {"font": "Arial", "size": 56, "bold": -1, "base": "&H00FFFFFF", "hl": "&H0000FF00",
                "outline_col": "&H00000000", "outline": 4, "shadow": 1, "scale": 118, "marginv": 640, "wpl": 4},
    # Alex Hormozi style: huge bold caps, thick outline, yellow pop, 3 words per line.
    "hormozi": {"font": "Arial", "size": 66, "bold": -1, "base": "&H00FFFFFF", "hl": "&H0000FFFF",
                "outline_col": "&H00000000", "outline": 6, "shadow": 2, "scale": 122, "marginv": 620, "wpl": 3},
    # Classic bottom-anchored yellow pop.
    "classic": {"font": "Arial", "size": 48, "bold": -1, "base": "&H00FFFFFF", "hl": "&H0000FFFF",
                "outline_col": "&H00000000", "outline": 3, "shadow": 0, "scale": 112, "marginv": 90, "wpl": 4},
    # Neon: magenta pop with cyan outline.
    "neon":    {"font": "Impact", "size": 54, "bold": -1, "base": "&H00FFFFFF", "hl": "&H00FF00FF",
                "outline_col": "&H00FFFF00", "outline": 3, "shadow": 0, "scale": 116, "marginv": 600, "wpl": 4},
    # Minimal: clean white, no outline, subtle green pop.
    "minimal": {"font": "Arial", "size": 48, "bold": 0, "base": "&H00FFFFFF", "hl": "&H0000FF00",
                "outline_col": "&H00000000", "outline": 0, "shadow": 0, "scale": 108, "marginv": 640, "wpl": 4},
}

def _group_words(seg, max_words, max_gap=0.7):
    """Split words into short phrases (CapCut shows a few words at a time)."""
    lines, cur = [], []
    for w in seg:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            if len(cur) >= max_words or gap > max_gap:
                lines.append(cur)
                cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return lines

def _hex_to_ass(h: str) -> str:
    """Convert #RRGGBB to ASS colour &H00BBGGRR."""
    h = h.lstrip("#")
    if len(h) != 6:
        return "&H00FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}"


def _make_ass(words, start, end, path, template="capcut",
              font_override=None, size_override=None,
              base_color_override=None, hl_color_override=None,
              outline_color_override=None):
    """Create ASS subtitle with CapCut-style captions: a phrase on screen, active word pops."""
    seg = [w for w in words if w["start"] >= start and w["end"] <= end]
    if not seg:
        Path(path).write_text("[Script Info]\nTitle: Empty\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,2,2,10,10,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        return

    t = TEMPLATES.get(template, TEMPLATES["capcut"]).copy()
    # Apply overrides on top of the template.
    if font_override:
        t["font"] = font_override
    if size_override:
        t["size"] = size_override
    if base_color_override:
        t["base"] = _hex_to_ass(base_color_override)
    if hl_color_override:
        t["hl"] = _hex_to_ass(hl_color_override)
    if outline_color_override:
        t["outline_col"] = _hex_to_ass(outline_color_override)
    style = (
        f"Style: Default,{t['font']},{t['size']},{t['base']},&H000000FF,{t['outline_col']},"
        f"&H00000000,{t['bold']},0,0,0,100,100,0,0,1,{t['outline']},{t['shadow']},2,60,60,{t['marginv']},1"
    )

    lines = ["[Script Info]",
             "Title: Viral Clip",
             "ScriptType: v4.00+",
             "PlayResX: 1080",
             "PlayResY: 1920",
             "WrapStyle: 2",
             "",
             "[V4+ Styles]",
             "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
             style,
             "",
             "[Events]",
             "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
             ]

    clip_len = end - start
    scale = t["scale"]
    hl = t["hl"]

    # For each phrase, keep the whole phrase on screen and pop the active word as it's spoken.
    for phrase in _group_words(seg, t["wpl"]):
        tokens = [w["word"].strip().upper() for w in phrase]
        for i, w in enumerate(phrase):
            seg_start = w["start"]
            seg_end = phrase[i + 1]["start"] if i + 1 < len(phrase) else w["end"] + 0.25
            rel_start = max(0, seg_start - start)
            rel_end = min(clip_len, seg_end - start)
            if rel_end <= rel_start:
                continue
            parts = []
            for j, tok in enumerate(tokens):
                if j == i:
                    parts.append(f"{{\\c{hl}\\fscx{scale}\\fscy{scale}}}{tok}{{\\r}}")
                else:
                    parts.append(tok)
            text = " ".join(parts)
            lines.append(f"Dialogue: 0,{_ass_time(rel_start)},{_ass_time(rel_end)},Default,,0,0,0,,{text}")

    Path(path).write_text("\n".join(lines), encoding="utf-8")


def _ass_time(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    cs = int((s - int(s)) * 100)  # centiseconds, not milliseconds
    return f"{int(h)}:{int(m):02}:{int(s):02}.{cs:02}"


def _get_video_dimensions(path: str):
    try:
        import json
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "json", path],
            capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        w = int(data["streams"][0]["width"])
        h = int(data["streams"][0]["height"])
        return w, h
    except Exception:
        return 1920, 1080


def make_clip(video_path, words, clip, out_dir="output", template="capcut", layout="normal",
              facecam_pos="top-left", facecam_custom="0.7,0.02,0.28,0.28",
              portrait_fc_layout="0,0.078125,1,0", portrait_bg_pan="0.5,0.5",
              portrait_screen_layout="0,0,1,1",
              font_override=None, size_override=None,
              base_color_override=None, hl_color_override=None,
              outline_color_override=None,
              fps_override=30, bitrate_override=8.0, max_duration=60.0):
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    start, end = float(clip["start"]), float(clip["end"])
    # Respect max_duration cap
    if end - start > max_duration:
        end = start + max_duration
    safe_title = "".join(c for c in clip["title"] if c.isalnum() or c in " -_")[:50]
    out = str(Path(out_dir) / f"{clip['score']:03}_{safe_title}.mp4")
    ass = str(Path(out_dir) / f"{safe_title}.ass")
    _make_ass(words, start, end, ass, template=template,
              font_override=font_override, size_override=size_override,
              base_color_override=base_color_override, hl_color_override=hl_color_override,
              outline_color_override=outline_color_override)

    # Crop center 9:16, scale, burn ASS subtitles with karaoke styling
    # ffmpeg uses ':' as separator inside filters, so Windows drive letters must be escaped
    # Use forward slashes and escape colons (G: -> G\:) and single quotes
    # Escape colons in the filter string (Windows drive letters like G: break ffmpeg filter parsing)
    ass_safe = ass.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    out_safe = out.replace("\\", "/")
    
    if layout == "gaming":
        # Gaming layout: crop facecam from its corner of the source, overlay on top of
        # center-cropped gameplay. Multiple [0:v] inputs require -filter_complex, not -vf.
        # Source facecam is assumed to occupy ~25% width / 25% height in one corner.
        # crop=W:H:X:Y in source pixels.
        iw, ih = _get_video_dimensions(video_path)

        # Background crop: 9:16 center crop with user pan
        try:
            cx, cy = map(float, portrait_bg_pan.split(","))
        except Exception:
            cx, cy = 0.5, 0.5
        if iw / ih > 9 / 16:
            bg_ow = int(ih * 9 / 16)
            bg_oh = int(ih)
            bg_x = int(cx * (iw - bg_ow))
            bg_y = 0
        else:
            bg_ow = int(iw)
            bg_oh = int(iw * 16 / 9)
            bg_x = 0
            bg_y = int(cy * (ih - bg_oh))
        bg_crop = f"{bg_ow}:{bg_oh}:{bg_x}:{bg_y}"

        # Facecam crop from source
        cam_crops = {
            "top-left":     "iw/4:ih/4:0:0",
            "top-right":    "iw/4:ih/4:iw-iw/4:0",
            "bottom-left":  "iw/4:ih/4:0:ih-ih/4",
            "bottom-right": "iw/4:ih/4:iw-iw/4:ih-ih/4",
            "top-center":   "iw/4:ih/4:(iw-iw/4)/2:0",
        }
        if facecam_pos == "custom":
            try:
                fx, fy, fw, fh = map(float, facecam_custom.split(","))
                cam_crop = f"iw*{fw}:ih*{fh}:iw*{fx}:ih*{fy}"
                cam_w, cam_h = fw * iw, fh * ih
            except Exception:
                cam_crop = cam_crops["top-right"]
                cam_w, cam_h = iw / 4, ih / 4
        else:
            cam_crop = cam_crops.get(facecam_pos, cam_crops["top-left"])
            cam_w, cam_h = iw / 4, ih / 4

        # Portrait screen layer: sx,sy,sw,sh (fractions of 1080x1920 output canvas)
        try:
            sx, sy, sw, sh = map(float, portrait_screen_layout.split(","))
        except Exception:
            sx, sy, sw, sh = 0.0, 0.0, 1.0, 1.0
        sc_out_w = max(2, int(sw * 1080))
        sc_out_h = max(2, int(sh * 1920))
        sc_x = int(sx * 1080)
        sc_y = int(sy * 1920)

        # Portrait facecam layout: px,py,pw,ph (fractions of 1080x1920 output)
        try:
            px, py, pw, ph = map(float, portrait_fc_layout.split(","))
        except Exception:
            px, py, pw, ph = 0.0, 0.078125, 1.0, 0.0

        fc_out_w = max(2, int(pw * 1080))
        if ph > 0:
            fc_out_h = max(2, int(ph * 1920))
        else:
            fc_out_h = max(2, int(fc_out_w * (cam_h / cam_w)) if cam_w > 0 else int(fc_out_w * 9 / 16))
        fc_x = int(px * 1080)
        fc_y = int(py * 1920)

        # Build filtergraph: black canvas → screen layer → facecam layer → captions
        filtergraph = (
            f"color=black:s=1080x1920[canvas];"
            f"[0:v]crop={bg_crop},scale={sc_out_w}:{sc_out_h}[screen];"
            f"[0:v]crop={cam_crop},scale={fc_out_w}:{fc_out_h}[cam];"
            f"[canvas][screen]overlay={sc_x}:{sc_y}:shortest=1[bg];"
            f"[bg][cam]overlay={fc_x}:{fc_y},ass='{ass_safe}'[v]"
        )
        filter_args = ["-filter_complex", filtergraph, "-map", "[v]", "-map", "0:a?"]
    else:
        # Normal layout: screen layer on black canvas
        iw, ih = _get_video_dimensions(video_path)
        try:
            cx, cy = map(float, portrait_bg_pan.split(","))
        except Exception:
            cx, cy = 0.5, 0.5
        if iw / ih > 9 / 16:
            bg_ow = int(ih * 9 / 16)
            bg_oh = int(ih)
            bg_x = int(cx * (iw - bg_ow))
            bg_y = 0
        else:
            bg_ow = int(iw)
            bg_oh = int(iw * 16 / 9)
            bg_x = 0
            bg_y = int(cy * max(0, ih - bg_oh))
        bg_crop = f"{bg_ow}:{bg_oh}:{bg_x}:{bg_y}"

        try:
            sx, sy, sw, sh = map(float, portrait_screen_layout.split(","))
        except Exception:
            sx, sy, sw, sh = 0.0, 0.0, 1.0, 1.0
        sc_out_w = max(2, int(sw * 1080))
        sc_out_h = max(2, int(sh * 1920))
        sc_x = int(sx * 1080)
        sc_y = int(sy * 1920)

        filtergraph = (
            f"color=black:s=1080x1920[canvas];"
            f"[0:v]crop={bg_crop},scale={sc_out_w}:{sc_out_h}[screen];"
            f"[canvas][screen]overlay={sc_x}:{sc_y}:shortest=1,ass='{ass_safe}'[v]"
        )
        filter_args = ["-filter_complex", filtergraph, "-map", "[v]", "-map", "0:a?"]

    result = subprocess.run(
        ["ffmpeg", "-y", "-ss", str(start), "-to", str(end), "-i", video_path,
         *filter_args, "-c:v", "libx264", "-b:v", f"{bitrate_override}M", "-c:a", "aac", "-preset", "fast", "-r", str(fps_override), out_safe],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr[-2000:]}")
    return out
