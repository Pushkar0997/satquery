import os

def simplify_for_user(user_query, technical_result, evidence):
    text = (technical_result or "").strip()

    warning = (
        "This result shows what the satellite image appears to contain. "
        "It is not a guaranteed prediction of a future disaster. "
        "Use official weather, emergency-management and ground reports for decisions."
    )

    key = user_query.lower()

    if any(x in key for x in ["flood", "flooding", "water", "disaster", "damage", "risk"]):
        prefix = "In simple words: "
        if not text:
            text = "The model could not produce a reliable visual description."
        return prefix + text, warning

    if not text:
        text = "The model could not produce a reliable explanation for this image."

    return "In simple words: " + text, warning
