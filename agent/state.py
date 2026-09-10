from typing import TypedDict, List, Dict, Any, Optional

class SatQueryState(TypedDict, total=False):
    query: str
    image_paths: List[str]
    task: str
    validation: Dict[str, Any]
    model: str
    raw_result: Dict[str, Any]
    final_answer: str
    evidence: List[str]
    confidence: str
    warning: str
    output_image: Optional[str]
    trace: List[str]
