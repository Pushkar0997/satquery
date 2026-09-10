# SatQuery AI V2

SatQuery AI is an agentic remote-sensing assistant designed around the ISRO/SAC problem statement.

This version replaces the original heuristic prototype with real remote-sensing model integrations.

## Main models

### 1. Single-image VQA / captioning / grounding

Model:
`aanandmodi/satquery-qwen3vl-bigearthnet-txt-lora`

Base:
`Qwen/Qwen3-VL-2B-Instruct`

The adapter is specifically described as a QLoRA adapter for SatQuery AI single-image remote-sensing VQA, captioning and grounding, trained using BigEarthNet.txt.

Important limitation:
It is intended for RGB previews derived from optical imagery. Do not use raw SAR or 12-band Sentinel tensors with this adapter.

### 2. Multitemporal change detection

Model:
`deepang/adaptformer-LEVIR-CD`

This is a real remote-sensing change-detection model fine-tuned on LEVIR-CD. Its strongest scope is building-related change detection.

### 3. Optical + SAR feature fusion

Model:
`BiliSakura/CROMA-transformers`

CROMA is a remote-sensing foundation model designed for Sentinel-1 SAR + Sentinel-2 optical multimodal representations.

The current demo converts uploaded images into a compatible demonstration representation. For final ISRO evaluation, replace this with true co-registered Sentinel-1/Sentinel-2 multiband GeoTIFF ingestion.

## Simple-language disaster awareness

The system intentionally does NOT say:

"Flood will happen tomorrow."

A satellite image cannot reliably establish a future disaster by itself.

Instead, the system says things such as:

"In simple words: The image shows a large area of water covering land that appears normally dry. This may indicate flooding."

It also displays a warning:

"This result shows what the satellite image appears to contain. It is not a guaranteed prediction of a future disaster. Use official weather, emergency-management and ground reports for decisions."

## Install

Use Python 3.11.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

Then:

```bash
streamlit run app.py
```

The first model run downloads several GB of model weights. GPU is strongly recommended.

## Test 1: single image

Upload one RGB satellite image.

Ask:

`Describe the land cover and explain any visible disaster-related risk in simple language.`

Or:

`Is there visible flooding? Explain in simple language.`

## Test 2: grounding

Upload one image.

Ask:

`Where is the water body? Give a simple explanation.`

## Test 3: change detection

Upload two images of the same area from different dates.

Ask:

`What changed between these two dates? Explain it simply.`

The current change model is strongest for building change.

## Test 4: optical + SAR

For the CROMA workflow, use properly aligned Sentinel-2 optical and Sentinel-1 SAR data. Ordinary screenshots are only a limited demo representation.

## Important ISRO submission note

This V2 is much closer to the required architecture, but it should not yet be presented as a validated ISRO solution.

Before final submission, add:

1. Real Cartosat-2S optical + RISAT SAR preprocessing.
2. GeoTIFF metadata and geospatial coordinates.
3. Proper co-registration and reprojection.
4. A real optical-SAR specialist that accepts the required raw bands.
5. CDVQA/change-description evaluation.
6. VRSBench/RSVQA benchmark evaluation.
7. ISRO/SAC hidden-dataset testing.
8. Calibrated confidence and abstention.
9. Visual evidence overlays and downloadable reports.
10. Fine-tuning/adaptation experiments and quantitative results.

## Architecture

User
→ Streamlit
→ LangGraph query interpreter
→ input validator
→ specialist model router
→ remote-sensing model
→ evidence extraction
→ simple-language synthesis
→ answer + evidence + confidence + trace

The agent's internal reasoning is not exposed. Only an auditable execution trace is displayed.
