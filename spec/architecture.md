# architecture.md — SatQuery AI

## 1. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Language | Python | 3.10+ | Colab default, team already familiar |
| ML framework | PyTorch | latest stable via Colab | required by open_clip |
| Encoder | open_clip_torch, ViT-B-32, `pretrained="openai"` | latest | guaranteed to load with no auth; RemoteCLIP checkpoint is a drop-in swap once the team has the file (see capability register) |
| Retrieval | in-memory cosine similarity | — | dataset is 15–40 images; a vector DB is unjustified complexity at this scale |
| Backend (stretch goal) | FastAPI | latest | one route, minimal surface, easy for any team member to read regardless of which tool they used to write it |
| Frontend | static HTML/CSS/JS, single file | — | `SatQuery-AI-UX-Prototype.html` already exists and is designed — wire it to real data, don't rebuild |
| Demo fallback | Gradio | latest, already in the notebook | works standalone, zero frontend integration risk |
| Dev/host | Google Colab | — | free GPU, real internet access (unlike a sandboxed agent environment), shareable link built in |

## 2. Structure

```
satquery/
├── notebooks/
│   └── satquery_pipeline.ipynb   ← the retrieval backbone; run this first, top to bottom
├── data/
│   └── tiles/                    ← demo images live here, gitignored if large; keep a small committed sample
├── backend/                      ← stretch goal: FastAPI wrapper around the notebook's query() logic
│   └── main.py                   ← single /query route, see API shape in CONTRACT.md
├── frontend/
│   └── index.html                ← copy of SatQuery-AI-UX-Prototype.html, wired to call the real backend
└── docs/
    └── (deck, PDF exports, etc.)
```

One file per concern. Do not let the notebook and the backend duplicate the embedding logic — if both need it, extract it once the duplication actually causes a bug, not before (2-day scope, avoid premature abstraction).

## 3. Data model

No database. One in-memory structure per Colab session:

```
tiles: list of {path: str, embedding: tensor}
```

Rebuilt every time the notebook runs. Nothing persists between sessions in this prototype — that's fine at this scale and stated here so nobody "fixes" it by adding persistence nobody asked for.

## 4. Capability register

**Consult before building anything. Never build on an unsupported capability.**

| Capability | Status | Needed for |
|---|---|---|
| Text → image semantic retrieval | supported (general CLIP) | core demo |
| Domain-tuned retrieval accuracy (RemoteCLIP) | **not supported yet** | better accuracy on Indian terrain; swap `REMOTECLIP_PATH` in the notebook once the checkpoint is obtained — M0 backlog item, not blocking |
| LLM-generated answer text | **not supported** | richer natural-language answers; explicitly deferred, see `spec/product.md` non-goals |
| Change detection | **not supported** | disaster-response / mining verticals' fuller vision; post-prototype |
| Optical + SAR fusion | **not supported** | same as above |
| Persistent hosting | **not supported** | not needed for a 2-day internal-round demo; Colab + share link is sufficient |
| Real ISRO Bhuvan/Bhoonidhi data access | **not supported** | current demo images are general aerial/satellite photos, not verified ISRO archive tiles — be accurate about this if asked directly during the demo |

## 5. Scale assumptions

- Building for: one live demo, in front of the mentor and internal-round judges.
- Revisit at: national round, if selected — then real ISRO data access and a second vertical become worth discussing.
- First thing to break: retrieval quality on general (not domain-tuned) CLIP if the demo images are visually ambiguous. Curate images that are visually distinctive per vertical to reduce this risk (see `spec/tasks.md` M0-DATA).
- Expensive to reverse: none of the current choices — everything here is intentionally cheap to throw away and redo, which is correct at this stage.

## 6. Performance budget

- Retrieval must return in under 2 seconds for a live demo to feel responsive. In-memory cosine similarity over ≤40 images is effectively instant — this budget is generous on purpose, not a real risk.
- Colab free-tier GPU: sessions can be reclaimed after idle periods; **do the live demo from a session started within the hour, not one left open overnight.**
- Gradio `share=True` links expire after 72 hours — regenerate the link the morning of the presentation, not the night before.

## 7. Security and privacy

- No user accounts, no PII collected. Demo images are general aerial/satellite photography, not tied to real individuals or verified real coordinates.
- Secrets: none required for the current stack (open_clip's OpenAI-pretrained weights need no auth token). If an LLM API key gets added later, it lives in `.env`, never committed — see `CONTRACT.md` INV-3.
- Nothing to delete on request — no user data is stored.
