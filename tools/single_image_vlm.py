import os
import torch
from PIL import Image
from functools import lru_cache

BASE_MODEL = "Qwen/Qwen3-VL-2B-Instruct"
ADAPTER = "aanandmodi/satquery-qwen3vl-bigearthnet-txt-lora"

def _device_dtype():
    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    return "cpu", torch.float32

@lru_cache(maxsize=1)
def load_model():
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
    from peft import PeftModel

    device, dtype = _device_dtype()

    processor = AutoProcessor.from_pretrained(BASE_MODEL)

    kwargs = {"torch_dtype": dtype}
    if device == "cuda":
        kwargs["device_map"] = "auto"

    base = Qwen3VLForConditionalGeneration.from_pretrained(BASE_MODEL, **kwargs)
    model = PeftModel.from_pretrained(base, ADAPTER)
    model.eval()

    if device == "cpu":
        model.to(device)

    return processor, model

def _prompt(query, task):
    safety = """
You are SatQuery AI, a remote-sensing assistant.
Look only at evidence visible in the satellite image.
Do not invent location, date, weather, people, exact measurements, or future events.
If the image is insufficient, say so clearly.
Use short, simple English that a normal person can understand.
If the user asks about a disaster, explain visible signs and possible concern,
but never claim that a future disaster is certain.
"""

    if task == "grounding":
        instruction = (
            "Identify the main region requested by the user. "
            "Give a short description and, if possible, provide one bounding box "
            "in normalized coordinates x1,y1,x2,y2 from 0 to 1000."
        )
    elif task == "captioning":
        instruction = (
            "Describe the land cover, major visible objects, water, vegetation, "
            "roads and buildings when clearly visible. Mention disaster-related "
            "visual signs only when supported by the image."
        )
    else:
        instruction = "Answer the user's question directly using the image."

    return safety + "\nUser question: " + query + "\nTask: " + instruction

def run_single_image_vlm(image_path, query, task):
    try:
        processor, model = load_model()
        image = Image.open(image_path).convert("RGB")
        prompt = _prompt(query, task)

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt}
            ]
        }]

        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt"
        )

        device = next(model.parameters()).device
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=180,
                do_sample=False
            )

        prompt_len = inputs["input_ids"].shape[-1]
        answer = processor.decode(
            outputs[0][prompt_len:],
            skip_special_tokens=True
        ).strip()

        evidence = [
            f"Remote-sensing VLM used: {ADAPTER}",
            "Input: RGB preview of the uploaded remote-sensing image."
        ]

        return {
            "answer": answer,
            "evidence": evidence,
            "confidence": "Model output is not a calibrated probability."
        }

    except Exception as e:
        return {
            "answer": (
                "The real remote-sensing VLM could not be loaded. "
                "Check the installation, available RAM/VRAM and internet access. "
                f"Technical error: {type(e).__name__}: {e}"
            ),
            "evidence": ["Real-model execution failed."],
            "confidence": "Unavailable"
        }
