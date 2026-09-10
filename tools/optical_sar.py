import numpy as np
import torch
from PIL import Image
from functools import lru_cache

MODEL_ID = "BiliSakura/CROMA-transformers"

def _to_rgb_array(path):
    img = Image.open(path).convert("RGB").resize((120, 120))
    return np.asarray(img).astype(np.float32) / 255.0

@lru_cache(maxsize=1)
def load_croma():
    from transformers import pipeline
    return pipeline(
        "feature-extraction",
        model=MODEL_ID,
        trust_remote_code=True
    )

def run_optical_sar(optical_path, sar_path, query):
    try:
        optical = _to_rgb_array(optical_path)
        sar_rgb = _to_rgb_array(sar_path)

        sar_gray = sar_rgb.mean(axis=2)
        sar = np.stack([sar_gray, sar_gray], axis=0).astype(np.float32)

        optical12 = np.zeros((12, 120, 120), dtype=np.float32)
        optical12[0] = optical[:, :, 0]
        optical12[1] = optical[:, :, 1]
        optical12[2] = optical[:, :, 2]
        optical12[3] = optical.mean(axis=2)

        pipe = load_croma()
        result = pipe(
            sar_images=sar,
            optical_images=optical12,
            use_8_bit=True,
            pool=True,
            return_tensors=True,
            image_processor_kwargs={"do_resize": True}
        )

        arr = np.asarray(result)
        norm = float(np.linalg.norm(arr))

        return {
            "answer": (
                "The optical and SAR images were processed together by a "
                "remote-sensing radar-optical foundation model. "
                "The fused representation can support downstream analysis, "
                "but this demo does not claim a specific disaster class from "
                "the fused embedding alone."
            ),
            "evidence": [
                f"Multimodal foundation model: {MODEL_ID}",
                f"Joint feature vector norm: {norm:.3f}",
                "Note: this demo expects aligned optical/SAR observations."
            ],
            "confidence": "Feature extraction is not a disaster probability."
        }

    except Exception as e:
        return {
            "answer": (
                "The optical-SAR fusion model could not run. "
                "For true Sentinel-1/Sentinel-2 fusion, provide aligned "
                "multiband inputs rather than ordinary screenshots. "
                f"Technical error: {type(e).__name__}: {e}"
            ),
            "evidence": ["CROMA execution failed."],
            "confidence": "Unavailable"
        }
