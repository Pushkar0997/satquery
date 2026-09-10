import os
from agent.state import SatQueryState

def interpret_query(state: SatQueryState):
    q = state["query"].lower()
    n = len(state["image_paths"])

    if n == 2:
        if any(x in q for x in ["change", "changed", "damage", "before", "after", "different", "disaster"]):
            task = "change_detection"
        elif any(x in q for x in ["optical", "sar", "radar", "together", "cross-modal", "compare"]):
            task = "optical_sar"
        else:
            task = "change_detection"
    else:
        if any(x in q for x in ["highlight", "where", "locate", "box", "region", "area"]):
            task = "grounding"
        elif any(x in q for x in ["describe", "caption", "land cover", "scene", "disaster", "flood", "damage", "risk"]):
            task = "captioning"
        else:
            task = "vqa"

    state["task"] = task
    state["trace"].append(f"Query interpreted as {task}")
    return state

def validate_input(state: SatQueryState):
    errors = []
    for p in state["image_paths"]:
        if not os.path.exists(p):
            errors.append(f"Missing file: {p}")

    if len(state["image_paths"]) not in [1, 2]:
        errors.append("Only 1 or 2 images are supported.")

    state["validation"] = {
        "passed": len(errors) == 0,
        "errors": errors
    }

    if errors:
        raise ValueError("; ".join(errors))

    state["trace"].append("Input validation passed")
    return state

def route_model(state: SatQueryState):
    task = state["task"]

    if task in ["vqa", "captioning", "grounding"]:
        model = "SatQuery BigEarthNet QLoRA VLM"
    elif task == "change_detection":
        model = "AdaptFormer LEVIR-CD"
    else:
        model = "CROMA optical-SAR foundation model"

    state["model"] = model
    state["trace"].append(f"Specialist model selected: {model}")
    return state

def execute_model(state: SatQueryState):
    from tools.single_image_vlm import run_single_image_vlm
    from tools.change_detection import run_change_detection
    from tools.optical_sar import run_optical_sar

    task = state["task"]
    paths = state["image_paths"]
    q = state["query"]

    if task in ["vqa", "captioning", "grounding"]:
        result = run_single_image_vlm(paths[0], q, task)
    elif task == "change_detection":
        result = run_change_detection(paths[0], paths[1], q)
    else:
        result = run_optical_sar(paths[0], paths[1], q)

    state["raw_result"] = result
    state["output_image"] = result.get("output_image")
    state["trace"].append("Specialist workflow executed")
    return state

def synthesize(state: SatQueryState):
    from tools.simple_language import simplify_for_user

    raw = state["raw_result"]
    final_text, warning = simplify_for_user(
        user_query=state["query"],
        technical_result=raw.get("answer", ""),
        evidence=raw.get("evidence", [])
    )

    state["final_answer"] = final_text
    state["warning"] = warning
    state["evidence"] = raw.get("evidence", [])
    state["confidence"] = raw.get("confidence", "not calibrated")
    state["trace"].append("Simple-language evidence-grounded response generated")
    return state
