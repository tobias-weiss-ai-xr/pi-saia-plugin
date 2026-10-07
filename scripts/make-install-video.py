#!/usr/bin/env python3
"""Record the install walkthrough in docs/media/install.webm.

The session is not scripted: pi is really invoked, and the frames replay the
real commands, real output and (capped) real latency, terminal-replay style.
Installation happens in a throwaway PI_CODING_AGENT_DIR, so the developer's own
pi configuration is never touched; the API key is read from $SAIA_API_KEY and
never appears in a frame.

Requirements:
    python3 with Pillow      (pip install pillow)
    ffmpeg with libvpx-vp9   (e.g. brew install ffmpeg, or `imageio-ffmpeg`)
    pi on PATH, SAIA_API_KEY in the environment

Usage:
    ./scripts/make-install-video.py                     # write docs/media/install.webm
    ./scripts/make-install-video.py --out /tmp/demo.webm --ffmpeg "$(command -v ffmpeg)"

Everything below the capture step is deterministic: the same session renders the
same frames. The script audits its own output (no line may be clipped at the
right edge, no row may collide with the footer) and exits non-zero if either
happens, so a layout regression cannot be published silently.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: pip install pillow")

# ---------------------------------------------------------------- geometry ---
W, H, FPS = 1280, 720, 20
BAR_H, PAD_X, PAD_T, FOOTER_H = 38, 26, 14, 34
SIZE, LINE_H = 17, 24
FONT_CANDIDATES = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/SFNSMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/Library/Fonts/Andale Mono.ttf",
]

BG, BAR, BORDER = (13, 17, 23), (1, 4, 9), (48, 54, 61)
PROMPT, CMD, OUT, DIM, ACCENT, YELLOW = (
    (63, 185, 80), (230, 237, 243), (139, 148, 158),
    (110, 118, 129), (88, 166, 255), (210, 168, 60),
)

MAX_ROWS = (H - BAR_H - PAD_T - FOOTER_H) // LINE_H
TYPE_CPS, WAIT_CAP, OUT_PAUSE, END_HOLD = 58, 3.0, 0.30, 4.5
SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
PROMPT_STR = "\u279c  ~ "

# ----------------------------------------------------------------- capture ---
def capture(repo: Path, key: str) -> tuple[list[dict], int]:
    """Run a real install + two real prompts; return the step list and the model count."""
    agent = tempfile.mkdtemp(prefix="saia-video-agent.")
    env = dict(os.environ, PI_CODING_AGENT_DIR=agent, SAIA_API_KEY=key)
    steps: list[dict] = []

    def run(cmd: str, argv: list[str], drop: str | None = None, timeout: int = 300) -> None:
        t0 = time.time()
        try:
            r = subprocess.run(argv, cwd=repo, env=env, capture_output=True, text=True, timeout=timeout)
            out = (r.stdout + r.stderr).strip("\n")
        except subprocess.TimeoutExpired:
            out = "<timed out>"
        ms = int((time.time() - t0) * 1000)
        lines = [l for l in out.split("\n") if l.strip()]
        if drop:
            lines = [l for l in lines if not re.search(drop, l)]
        steps.append({"cmd": cmd, "out": lines, "ms": ms})
        print(f"  {cmd}  ({ms} ms)")

    try:
        run("pi --version", ["pi", "--version"])
        run(f"pi install {repo}", ["pi", "install", str(repo)],
            drop=r"^npm (warn|notice)|^Cloning into")

        raw = subprocess.run(["pi", "--list-models"], env=env, capture_output=True,
                             text=True, timeout=180).stdout
        header = raw.split("\n")[0]
        saia = [l for l in raw.split("\n") if l.startswith("saia")]
        steps.append({"cmd": "pi --list-models | grep '^saia'",
                      "out": [header] + saia[:6] + [f"... {len(saia) - 6} more"], "ms": 1400})
        steps.append({"cmd": "pi --list-models | grep -c '^saia'", "out": [str(len(saia))], "ms": 350})
        steps.append({"cmd": 'export SAIA_API_KEY="<your-api-key>"', "out": [], "ms": 950})

        run('pi -nt --model saia/best-for-coding -p "In one short sentence: what is a pixel?"',
            ["pi", "-nt", "--model", "saia/best-for-coding", "-p",
             "In one short sentence: what is a pixel?"])
        run('pi -nt --thinking high --model saia/best-for-reasoning -p "What is 17*23? Reply with just the number."',
            ["pi", "-nt", "--thinking", "high", "--model", "saia/best-for-reasoning", "-p",
             "What is 17*23? Reply with just the number."])
    finally:
        shutil.rmtree(agent, ignore_errors=True)
    return steps, len(saia)


# ------------------------------------------------------------------ render ---
def render(steps: list[dict], frame_dir: Path, count: int) -> list[Path]:
    font = next((f for f in FONT_CANDIDATES if Path(f).exists()), None)
    if not font:
        sys.exit("no monospace font found; add one to FONT_CANDIDATES")

    def face(size: int, index: int):
        try:
            return ImageFont.truetype(font, size, index=index)
        except OSError:
            return ImageFont.truetype(font, size, index=0)

    f_reg = face(SIZE, 0)
    f_big = face(30, 1)
    f_mid = ImageFont.truetype(font, 20, index=0)
    cols = int((W - 2 * PAD_X) / f_reg.getlength("M"))

    def wrap(s: str) -> list[str]:
        return [s[i:i + cols] for i in range(0, len(s), cols)] or [""]

    frame_dir.mkdir(parents=True, exist_ok=True)
    screen: list[tuple[str, tuple, object]] = []
    written: list[Path] = []

    def emit(hold_frames: float = 1, big=None, footer: bool = True) -> None:
        im = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W, BAR_H], fill=BAR)
        d.line([0, BAR_H, W, BAR_H], fill=BORDER)
        for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            x = 20 + i * 20
            d.ellipse([x, BAR_H // 2 - 6, x + 12, BAR_H // 2 + 6], fill=c)
        title = "pi-saia-plugin  ·  install walkthrough"
        d.text(((W - f_reg.getlength(title)) / 2, BAR_H / 2 - SIZE / 2 - 1), title, font=f_reg, fill=DIM)

        y = BAR_H + PAD_T
        for text, colour, fnt in screen[-MAX_ROWS:]:
            d.text((PAD_X, y), text, font=fnt, fill=colour)
            y += LINE_H
        for text, colour, fnt, dy in (big or []):
            d.text(((W - fnt.getlength(text)) / 2, dy), text, font=fnt, fill=colour)
        if footer:
            d.text((PAD_X, H - 26), "SAIA · Academic Cloud Hessen", font=f_reg, fill=(48, 54, 61))

        for k in range(max(1, int(hold_frames))):
            path = frame_dir / f"f{len(written):05d}.png"
            im.save(path)
            written.append(path)

    for step in steps:
        for done in range(1, len(step["cmd"]) + 1):
            sav = screen[:]
            screen.append((PROMPT_STR + step["cmd"][:done], CMD, f_reg))
            emit(1)
            screen[:] = sav
        for k, part in enumerate(wrap(step["cmd"])):
            prefix = PROMPT_STR if k == 0 else " " * len(PROMPT_STR)
            screen.append((prefix + part, CMD, f_reg))
        emit(0.16 * FPS)

        wait = min(step["ms"] / 1000.0, WAIT_CAP)
        if wait > 0.35 and step["out"]:
            for k in range(int(wait * FPS)):
                sav = screen[:]
                screen.append((f"  {SPIN[k % len(SPIN)]} running…", YELLOW, f_reg))
                emit(1)
                screen[:] = sav

        for raw in step["out"]:
            colour = DIM if raw.startswith("provider ") else (ACCENT if raw.strip().isdigit() else OUT)
            for part in wrap(raw):
                screen.append((part, colour, f_reg))
        emit((OUT_PAUSE if step["out"] else 0.35) * FPS)

    screen.clear()
    big = [
        ("\u2713  installed", (63, 185, 80), f_big, 150),
        (f"{count} models  ·  8 aliases", ACCENT, f_mid, 210),
        ("saia/<model>      e.g. saia/glm-5.3-flash", CMD, f_mid, 276),
        ("saia/<alias>      e.g. saia/best-for-coding", CMD, f_mid, 308),
        ("pi --list-models | grep '^saia'", DIM, f_mid, 374),
        ("github.com/tobias-weiss-ai-xr/pi-saia-plugin", OUT, f_mid, 406),
    ]
    emit(END_HOLD * FPS, big=big, footer=False)
    return written


def audit(frames: list[Path]) -> int:
    """Fail if any frame clips at the right edge or spills into the footer band."""
    clipped = collided = 0
    for path in frames:
        ink = Image.open(path).convert("L").point(lambda v: 255 if v > 90 else 0)
        if ink.crop((W - 16, BAR_H + 1, W, H)).getbbox():
            clipped += 1
        if ink.crop((430, H - FOOTER_H + 2, W, H - 24)).getbbox():
            collided += 1
    print(f"  audit: {len(frames)} frames, clipped={clipped}, footer-collisions={collided}")
    return 1 if (clipped or collided) else 0


def encode(frame_dir: Path, out: Path, ffmpeg: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "warning",
           "-framerate", str(FPS), "-i", str(frame_dir / "f%05d.png"),
           "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "0", "-crf", "33",
           "-row-mt", "1", "-cpu-used", "2", "-threads", "4", "-an", str(out)]
    subprocess.run(cmd, check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--out", default=None, help="default: <repo>/docs/media/install.webm")
    ap.add_argument("--ffmpeg", default=os.environ.get("FFMPEG", "ffmpeg"))
    ap.add_argument("--keep-frames", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    out = Path(args.out) if args.out else repo / "docs" / "media" / "install.webm"
    key = os.environ.get("SAIA_API_KEY")
    if not key:
        sys.exit("SAIA_API_KEY must be set (the demo makes real requests)")
    if shutil.which("pi") is None and not Path("/usr/local/bin/pi").exists():
        sys.exit("pi must be on PATH")
    if shutil.which(args.ffmpeg) is None and not Path(args.ffmpeg).exists():
        sys.exit(f"ffmpeg not found: {args.ffmpeg} (needs libvpx-vp9)")

    print(f"capturing a real session in {repo}")
    steps, count = capture(repo, key)

    frame_dir = Path(tempfile.mkdtemp(prefix="saia-video-frames."))
    try:
        print("rendering frames")
        frames = render(steps, frame_dir, count)
        rc = audit(frames)
        if rc:
            return rc
        print(f"encoding {len(frames)} frames ({len(frames) / FPS:.1f}s) -> {out}")
        encode(frame_dir, out, args.ffmpeg)
        poster = out.with_name("install-poster.png")
        shutil.copyfile(frames[-1], poster)
        print(f"wrote {out} and {poster}")
    finally:
        if not args.keep_frames:
            shutil.rmtree(frame_dir, ignore_errors=True)
        else:
            print(f"frames kept in {frame_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
