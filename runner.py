import json
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv
from downloader import download_audio, prepare_local_file
from transcriber import transcribe
from analyzer import find_viral_moments
from editor import make_clip

load_dotenv()

def log(stage, msg, **kw):
    data = {"stage": stage, "msg": msg}
    data.update(kw)
    print(json.dumps(data), flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("-n", "--num", type=int, default=5)
    ap.add_argument("-o", "--output", default="output")
    ap.add_argument("--local", action="store_true", help="Source is a local file path")
    ap.add_argument("--start", type=float, default=0, help="Start time in seconds")
    ap.add_argument("--end", type=float, default=None, help="End time in seconds")
    ap.add_argument("--template", default="capcut", help="Caption template (capcut, hormozi, classic, neon, minimal)")
    ap.add_argument("--layout", default="auto", help="Layout (auto, normal, gaming)")
    ap.add_argument("--facecam-pos", default="top-right", help="Facecam position (top-left, top-right, top-center, bottom-left, bottom-right, custom)")
    ap.add_argument("--facecam-custom", default="0.7,0.02,0.28,0.28", help="Custom facecam region x,y,w,h as fractions")
    ap.add_argument("--portrait-fc-layout", default="0,0.078125,1,0", help="Portrait facecam layout x,y,w,h as fractions")
    ap.add_argument("--portrait-bg-pan", default="0.5,0.5", help="Portrait background pan cx,cy as fractions")
    ap.add_argument("--portrait-screen-layout", default="0,0,1,1", help="Portrait screen layer x,y,w,h as fractions")
    ap.add_argument("--caption-font", default=None, help="Override caption font family (e.g. Arial, Impact)")
    ap.add_argument("--caption-size", type=int, default=None, help="Override caption font size")
    ap.add_argument("--caption-base-color", default=None, help="Override caption base color (#RRGGBB)")
    ap.add_argument("--caption-hl-color", default=None, help="Override caption highlight/pop color (#RRGGBB)")
    ap.add_argument("--caption-outline-color", default=None, help="Override caption outline color (#RRGGBB)")
    ap.add_argument("--fps", type=int, default=30, help="Output video FPS (24/30/60)")
    ap.add_argument("--bitrate", type=float, default=8.0, help="Output video bitrate in Mbps")
    ap.add_argument("--max-clip-duration", type=float, default=60.0, help="Maximum clip duration in seconds")
    args = ap.parse_args()

    try:
        if args.local:
            log("download", f"Preparing local file...")
            video_path, audio_path = prepare_local_file(args.source, out_dir="work")
        else:
            log("download", "Downloading + extracting audio...")
            video_path, audio_path = download_audio(args.source, out_dir="work")
        log("download", "Done", video_path=video_path)

        log("transcribe", "Transcribing audio...")
        words = transcribe(audio_path, start_time=args.start, end_time=args.end)
        log("transcribe", f"Done: {len(words)} words")

        # Filter words to time range if specified
        if args.start > 0 or args.end:
            end = args.end if args.end else float("inf")
            words = [w for w in words if args.start <= w["start"] <= end]
            log("transcribe", f"Filtered to {len(words)} words in range {args.start}-{args.end}s")

        log("analyze", "Finding viral moments...")
        clips, is_gaming = find_viral_moments(words, n=args.num)
        log("analyze", f"Found {len(clips)} clips (Gaming content: {is_gaming})", clips=[
            {"title": c["title"], "score": c["score"], "start": c["start"], "end": c["end"]}
            for c in clips
        ])

        # Determine layout
        layout = args.layout
        if layout == "auto":
            layout = "gaming" if is_gaming else "normal"
        log("render", f"Rendering clips with template={args.template}, layout={layout}, facecam={args.facecam_pos}...")
        outputs = []
        for i, c in enumerate(clips):
            out = make_clip(
                video_path, words, c,
                out_dir=args.output, template=args.template, layout=layout,
                facecam_pos=args.facecam_pos, facecam_custom=args.facecam_custom,
                portrait_fc_layout=args.portrait_fc_layout,
                portrait_bg_pan=args.portrait_bg_pan,
                portrait_screen_layout=args.portrait_screen_layout,
                font_override=args.caption_font,
                size_override=args.caption_size,
                base_color_override=args.caption_base_color,
                hl_color_override=args.caption_hl_color,
                outline_color_override=args.caption_outline_color,
                fps_override=args.fps,
                bitrate_override=args.bitrate,
                max_duration=args.max_clip_duration,
            )
            outputs.append(out)
            log("render", f"Clip {i+1}/{len(clips)}", progress=((i+1)/len(clips)*100))

        log("done", "All clips ready", outputs=outputs, video_path=video_path)
    except Exception as e:
        log("error", str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
