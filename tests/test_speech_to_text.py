import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import speech_to_text as stt


class SpeechToTextNormalizationTests(unittest.TestCase):
    def test_wav_payload_is_written_to_a_temp_wav_file(self):
        wav_payload = b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00"

        with tempfile.TemporaryDirectory() as tmp_dir:
            normalized_path = stt.prepare_audio_for_transcription(wav_payload, output_dir=tmp_dir)
            self.assertTrue(Path(normalized_path).suffix == ".wav")
            self.assertTrue(Path(normalized_path).exists())
            self.assertEqual(Path(normalized_path).read_bytes()[:12], wav_payload[:12])

    def test_non_wav_payload_gets_converted_to_wav(self):
        webm_payload = b"\x1aE\xdf\xa3webm"

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch("tools.speech_to_text.shutil.which", return_value="/usr/bin/ffmpeg"), patch(
                "tools.speech_to_text.subprocess.run"
            ) as mock_run:

                def fake_run(cmd, input=None, **kwargs):
                    output_path = Path(cmd[-1])
                    output_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
                    return None

                mock_run.side_effect = fake_run
                converted_path = stt.prepare_audio_for_transcription(webm_payload, output_dir=tmp_dir)

            self.assertTrue(Path(converted_path).suffix == ".wav")
            self.assertTrue(Path(converted_path).exists())
            self.assertGreater(Path(converted_path).stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
