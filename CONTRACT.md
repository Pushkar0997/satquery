# CONTRACT — SatQuery AI

**The correctness core. An agent that reads only this file must not be able to break the domain.**

Precedence: this file outranks every other document. If something here conflicts with a task, the task is wrong — stop and flag it.

---

## Invariants

### INV-1 — Confidence must be real

**Rule:** every confidence score shown anywhere in the product is the actual cosine similarity between the query embedding and the retrieved tile embedding, computed at request time. Never a hardcoded, templated, or illustrative number.
**Why:** the entire pitch is "grounded, evidence-based answers." A faked confidence number presented as real is the exact failure the deck's own Feasibility slide names as the top risk (AI Reliability — "plausible answers can still be incorrect"). If judges or the mentor discover a fake number dressed as real, it undermines every other claim in the deck.
**Violated by:** copying the pattern from `SatQuery-AI-UX-Prototype.html` (the presentation mockup) into the real system. That file's numbers are intentionally scripted for a UX demo and must never be mistaken for backend logic.
**Detected by:** `spec/evals.md` EVAL-1 — assert the returned confidence equals `cosine_similarity(query_embedding, tile_embedding)` to float precision, for every response.

### INV-2 — Answers do not state unobserved specifics

**Rule:** the generated answer text may only reference things the system actually computed or retrieved (tile ID, similarity rank, coarse category). It must never state a specific unverified number (e.g. "12% of the field") unless that number was actually computed from the image.
**Why:** same failure class as INV-1, one level up — specific-sounding numbers read as authoritative and are worse to fabricate than vague ones. This exact mistake is already in the UX prototype's scripted copy; do not let it graduate into the real answer-generation logic unexamined.
**Violated by:** writing an answer template that "sounds right" with an invented percentage, because it's more convincing than a qualitative statement.
**Detected by:** `spec/evals.md` EVAL-2 — manual review checklist item; no numeric claim in an answer without a corresponding computed value in the response object.

### INV-3 — No secret ever committed

**Rule:** no API key, token, or credential is ever written into a tracked file — not in a notebook cell, not in a frontend fetch call, not commented out.
**Why:** a key committed once is compromised permanently, even after deletion from a later commit. With 6 people and a mix of tools, the odds of an accidental commit are high unless this is stated once, clearly, up front.
**Violated by:** hardcoding a key to "just get the demo working" the night before presenting, meaning to remove it later.
**Detected by:** `.gitignore` covers `.env*`; every teammate checks `git diff` for anything that looks like a key before pushing. No automated scanner for a 2-day sprint — this is a discipline rule, not a tooled one.

---

## Pinned conventions

| Concern | Decision |
|---|---|
| API request shape | `POST /query` body: `{"query": "<string>"}` |
| API response shape | `{"tile_id": "<string>", "confidence": <float 0–1>, "answer": "<string>", "image_url": "<string>"}` — exact field names, no renaming per-teammate |
| Confidence range | float, 0.0–1.0, four decimal places in logs, two decimal places displayed |
| Tile ID format | `<STATE-CODE>-<NNN> · <YYYY>-Q<N> · <sensor>` e.g. `KA-114 · 2026-Q3 · Sentinel-2` — matches the format already in the deck and the UX prototype, do not invent a new one |
| Image handling | demo tiles served as local files or base64 data URIs — no external image hosting dependency for the live demo (network risk during presentation) |
| Secrets | `.env`, never committed; `.env.example` shows the shape with empty values |
| Currency for cost estimates | ₹, since this is India-facing infrastructure planning |

---

## Exact values

```
CONFIDENCE_MIN_DISPLAY_THRESHOLD = 0.0   # show everything for now; no filtering in the 2-day prototype
DEMO_TILE_COUNT_MIN = 15                 # minimum images across ≥2 verticals before M0 is considered proven
```

---

## Never do this

- **Never let the scripted HTML prototype's fake data reach the real backend integration unexamined.** It was built as a presentation mockup, not a reference implementation — because its confidence numbers and answer text are illustrative, not computed.
- **Never add a paid API dependency without checking quota math first.** Two days is too short a runway to discover a rate limit live in front of the mentor. See `spec/architecture.md` §6.
- **Never commit a real API key**, even "temporarily." See INV-3.
- **Never expand scope past M2 (see `spec/plan.md`) before M0 and M1 are actually proven**, no matter how tempting change detection or a second vertical looks with a day left. This is the same scope-creep risk already named in the submitted deck's own Feasibility slide — it was true then, it is truer with 48 hours on the clock.

---

## Changing this file

Requires explicit agreement from you (as lead) or the mentor. Given the team's decision rule: minor clarifications here can be made by you directly; anything that changes an invariant needs team consensus or mentor sign-off before it's edited, not after.
