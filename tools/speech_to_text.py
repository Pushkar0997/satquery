import functools
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import torch

# Use the standard download route for the one-time public model download.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from faster_whisper import WhisperModel

class SpeechToTextError(RuntimeError):
    """Raised when the local speech-recognition model cannot be used."""


def _model_settings() -> tuple[str, str]:
    """Choose a portable default for CPU-only laptops and CUDA machines."""
    if torch.cuda.is_available():
        return "cuda", "float16"
    return "cpu", "int8"


@functools.lru_cache(maxsize=1)
def get_speech_model():
    """Load the model once per application process.

    On its first run, Faster-Whisper downloads the public model files. Those
    files are cached outside the repository, so no model weights are committed.
    """
    device, compute_type = _model_settings()

    try:
        return WhisperModel(
            os.getenv("SATQUERY_STT_MODEL", "small"),
            device=device,
            compute_type=compute_type,
        )
    except Exception as error:
        raise SpeechToTextError(
            "The local speech model is not ready. Connect to the internet once "
            "and retry the voice query so Faster-Whisper can download its model. "
            "Later voice queries use the cached local model."
        ) from error


def _is_wav_audio(audio_bytes: bytes) -> bool:
    """Return True when the recorded bytes already match the RIFF/WAV container."""
    return len(audio_bytes) >= 12 and audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE"


def prepare_audio_for_transcription(audio_bytes: bytes, output_dir: str | Path | None = None) -> str:
    """Return a local WAV file path that Faster-Whisper can transcribe.

    Streamlit's browser microphone often records in browser-native formats such as
    WebM/OGG, not RIFF WAV. Faster-Whisper expects a WAV file on disk, so we
    normalise to 16 kHz mono PCM before transcription when needed.
    """
    if not audio_bytes:
        raise SpeechToTextError("The audio recording is empty. Please record the question again.")

    if _is_wav_audio(audio_bytes):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=str(output_dir) if output_dir else None) as audio_file:
            audio_file.write(audio_bytes)
        return audio_file.name

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise SpeechToTextError(
            "The browser microphone audio could not be prepared for transcription because "
            "ffmpeg is not available on this machine. Please type your question instead."
        )

    output_path = Path(tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=str(output_dir) if output_dir else None).name)
    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                "pipe:0",
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(output_path),
            ],
            input=audio_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        output_path.unlink(missing_ok=True)
        raise SpeechToTextError(
            "The voice recording could not be decoded into a WAV file. Please try a short, "
            "clear recording or type the question instead."
        ) from error

    return str(output_path)


def transcribe_audio(
    audio_bytes: bytes,
    language: str | None = None,
    task: str = "transcribe",
) -> str:
    """Transcribe audio, or translate supported speech into English."""
    audio_path = prepare_audio_for_transcription(audio_bytes)

    try:
        try:
            segments, _ = get_speech_model().transcribe(
                audio_path,
                language=language,
                task=task,
                beam_size=5,
                vad_filter=True,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()
        except SpeechToTextError:
            raise
        except Exception as error:
            raise SpeechToTextError(
                "The voice recording could not be transcribed. Please try a short, "
                "clear recording or type the question instead."
            ) from error
    finally:
        Path(audio_path).unlink(missing_ok=True)