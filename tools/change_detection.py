import os
import numpy as np
import torch
from PIL import Image
from functools import lru_cache

MODEL_ID = "deepang/adaptformer-LEVIR-CD"

@lru_cache(maxsize=1)
def load_change_model():
    from transformers import AutoImageProcessor, AutoModel

    processor = AutoImageProcessor.from_pretrained(
        MODEL_ID,
        trust_remote_code=True
    )
    model = AutoModel.from_pretrained(
        MODEL_ID,
        trust_remote_code=True
    )
    model.eval()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    return processor, model, device

def run_change_detection(image_a, image_b, query):
    try:
        processor, model, device = load_change_model()

        a = Image.open(image_a).convert("RGB")
        b = Image.open(image_b).convert("RGB")

        inputs = processor(
            images=(a, b),
            return_tensors="pt"
        )

        inputs = {
            k: v.to(device) if hasattr(v, "to") else v
            for k, v in inputs.items()
        }

        with torch.no_grad():
            outputs = model(**inputs)

        logits = outputs.logits
        pred = logits.argmax(dim=1)[0].detach().cpu().numpy()

        changed = pred > 0
        percentage = float(changed.mean() * 100.0)

        mask = np.zeros((pred.shape[0], pred.shape[1], 3), dtype=np.uint8)
        mask[changed] = [255, 60, 60]

        overlay = np.array(b.resize((pred.shape[1], pred.shape[0])))
        overlay = (0.65 * overlay + 0.35 * mask).astype(np.uint8)

        out_path = "data/outputs/change_overlay.png"
        Image.fromarray(overlay).save(out_path)

        if percentage < 2:
            statement = "Only a small amount of building-related change was detected."
        elif percentage < 15:
            statement = f"Some building-related change was detected, covering about {percentage:.1f}% of the analyzed area."
        else:
            statement = f"A substantial building-related change pattern was detected, covering about {percentage:.1f}% of the analyzed area."

        return {
            "answer": statement + " The model is trained for building-change detection, so other disaster types may not be captured.",
            "evidence": [
                f"Remote-sensing change model: {MODEL_ID}",
                f"Estimated changed pixels: {percentage:.1f}% of the model output area."
            ],
            "confidence": "Not calibrated for disaster probability.",
            "output_image": out_path
        }

    except Exception as e:
        return {
            "answer": (
                "The remote-sensing change model could not run. "
                f"Technical error: {type(e).__name__}: {e}"
            ),
            "evidence": ["Change-model execution failed."],
            "confidence": "Unavailable"
        }
