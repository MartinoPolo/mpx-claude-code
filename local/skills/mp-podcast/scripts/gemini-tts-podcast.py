#!/usr/bin/env python3
"""Render a two-host dialogue script to an MP3 with Gemini multi-speaker TTS.

Fallback backend for the mp-podcast skill, used when the NotebookLM audio quota is
exhausted. Unlike NotebookLM, this backend writes no dialogue of its own: the input file
must already contain every spoken line.

Input format — one turn per line, `Speaker: text`, blank lines ignored:

    Alex: Shadow DOM is one of the three web component specifications.
    Sam: And the encapsulation runs in both directions, which is the part people miss.

Usage:
    pip install -U google-genai
    python gemini-tts-podcast.py script.txt out.mp3 --speakers Alex,Sam --voices Kore,Puck

Requires the GEMINI_API_KEY environment variable and ffmpeg on PATH.
API reference: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

MODEL = "gemini-2.5-flash-preview-tts"
# Docs: TTS models expose a 32k-token context window. Chunking well under it keeps each
# request comfortably inside the limit and bounds the blast radius of one failed call.
MAX_CHUNK_CHARS = 9000
# Docs: the returned inline_data is raw PCM — 24 kHz, 16-bit, mono — with no WAV header.
SAMPLE_RATE, SAMPLE_WIDTH, CHANNELS = 24000, 2, 1
MAX_ATTEMPTS = 4
TURN = re.compile(r"^\s*([A-Za-z][\w .'-]{0,40}?)\s*:\s*(.+)$")


def parse_turns(script_path: Path, speakers: list[str]) -> list[str]:
    """Return the script as `Speaker: text` lines, rejecting unknown speaker names."""
    known = {s.casefold(): s for s in speakers}
    turns, unknown = [], set()
    for raw in script_path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        match = TURN.match(raw)
        if not match:
            # A wrapped continuation line belongs to the turn above it.
            if turns:
                turns[-1] = f"{turns[-1]} {raw.strip()}"
            continue
        name, text = match.group(1), match.group(2).strip()
        canonical = known.get(name.casefold())
        if canonical is None:
            unknown.add(name)
            continue
        turns.append(f"{canonical}: {text}")
    if unknown:
        sys.exit(
            f"Script names speakers not passed via --speakers: {', '.join(sorted(unknown))}. "
            f"Gemini multi-speaker TTS supports exactly the speakers you configure (max 2)."
        )
    if not turns:
        sys.exit(f"No `Speaker: text` turns found in {script_path}.")
    return turns


def chunk_turns(turns: list[str], limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Group turns into request-sized blocks, always splitting on a turn boundary."""
    chunks, current, size = [], [], 0
    for turn in turns:
        if current and size + len(turn) > limit:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(turn)
        size += len(turn) + 1
    if current:
        chunks.append("\n".join(current))
    return chunks


def synthesize(client, types, chunk: str, speakers: list[str], voices: list[str]) -> bytes:
    """Call multi-speaker TTS for one chunk, retrying with backoff on transient errors."""
    prompt = (
        f"TTS the following conversation between {' and '.join(speakers)}:\n{chunk}"
    )
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                speaker_voice_configs=[
                    types.SpeakerVoiceConfig(
                        speaker=speaker,
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice
                            )
                        ),
                    )
                    for speaker, voice in zip(speakers, voices)
                ]
            )
        ),
    )
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.models.generate_content(
                model=MODEL, contents=prompt, config=config
            )
            return response.candidates[0].content.parts[0].inline_data.data
        except Exception as error:  # SDK raises transport- and quota-specific types
            if attempt == MAX_ATTEMPTS:
                raise
            delay = 5 * 2 ** (attempt - 1)
            print(f"  attempt {attempt} failed ({error}); retrying in {delay}s", flush=True)
            time.sleep(delay)


def write_wav(path: Path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(CHANNELS)
        handle.setsampwidth(SAMPLE_WIDTH)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm)


def stitch(wav_paths: list[Path], output: Path, workdir: Path) -> None:
    """Concatenate the chunk WAVs and encode to 64 kbps mono MP3."""
    listing = workdir / "chunks.txt"
    listing.write_text(
        "".join(f"file '{p.as_posix()}'\n" for p in wav_paths), encoding="utf-8"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(listing),
            "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", str(output),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("script", type=Path, help="dialogue script, one `Speaker: text` per line")
    parser.add_argument("output", type=Path, help="destination .mp3")
    parser.add_argument("--speakers", default="Alex,Sam", help="two speaker names as they appear in the script")
    parser.add_argument("--voices", default="Kore,Puck", help="two prebuilt Gemini voice names")
    args = parser.parse_args()

    speakers = [s.strip() for s in args.speakers.split(",") if s.strip()]
    voices = [v.strip() for v in args.voices.split(",") if v.strip()]
    if not 1 <= len(speakers) <= 2 or len(voices) != len(speakers):
        sys.exit("Pass one or two speakers and a matching number of voices (API limit: 2).")
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg is required on PATH to stitch and encode the chunks.")
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("Set the GEMINI_API_KEY environment variable before running.")

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        sys.exit("google-genai is missing. Install it with: pip install -U google-genai")

    # The client reads GEMINI_API_KEY from the environment itself.
    client = genai.Client()
    chunks = chunk_turns(parse_turns(args.script, speakers))
    print(f"{len(chunks)} chunk(s) to synthesize with {MODEL}", flush=True)

    with tempfile.TemporaryDirectory(prefix="mp-podcast-") as tmp:
        workdir = Path(tmp)
        wav_paths = []
        for index, chunk in enumerate(chunks):
            print(f"chunk {index + 1}/{len(chunks)} ({len(chunk)} chars)", flush=True)
            wav_path = workdir / f"chunk-{index:03d}.wav"
            write_wav(wav_path, synthesize(client, types, chunk, speakers, voices))
            wav_paths.append(wav_path)
        stitch(wav_paths, args.output, workdir)

    size_mb = args.output.stat().st_size / 1_048_576
    print(f"wrote {args.output} ({size_mb:.1f} MB, 64 kbps mono)")


if __name__ == "__main__":
    main()
