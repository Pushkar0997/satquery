# product.md — SatQuery AI

## One-sentence definition

Lets an analyst ask a plain-language question about a region and get an answer grounded in ISRO satellite archive evidence, instead of manually reviewing imagery.

## The problem, precisely

Today's workflow for anyone who needs to interpret satellite imagery — an agri-insurance adjuster, a land-records officer, a mining-compliance inspector — is Search → Select → Analyse → Interpret, done by a person with GIS expertise, one image at a time. It's slow, it requires training most of these roles don't have, and there's no natural-language way to just ask what you want to know.

## Target user (primary, for the prototype)

**Agri-insurance claims adjuster.** Chosen as the first target because it has the clearest single-image query shape (does this field show damage, yes/no/how much) and the least regulatory complexity of the four verticals in the deck. Land records, mining compliance, and disaster response remain the pitch's broader vision — see non-goals.

If this is wrong, it's a major decision — team consensus needed to change it (see `AGENTS.md` §7).

## Core promise

A user can type a real question about a place — "does this field show crop damage?" — and get back the specific evidence tile plus a plain-language answer, in seconds, without opening a GIS tool.

## Non-goals (this 2-day prototype — not the full product vision)

- **Change detection and multi-temporal comparison.** Named explicitly as post-MVP risk in the submitted deck's Feasibility slide. Do not build it into the 2-day prototype no matter how good the demo would look.
- **Optical + SAR fusion.** Same reason — real added complexity, deferred on purpose.
- **All four verticals working simultaneously.** One vertical proven end-to-end beats four scripted-looking ones.
- **A deployed, persistent web app.** Colab + a shareable link is the target for this round, not hosting infrastructure.
- **LLM-generated answer text.** The 2-day prototype uses templated answers grounded in retrieved evidence (see `CONTRACT.md` INV-2). Swapping in an LLM call is a real next step, but after this path is solid, not instead of it.

## What already exists, and why build anyway

- **SatSure SatScore** — structured decision-intelligence (risk scores, dashboards), not a conversational natural-language interface. Different interaction paradigm.
- **Google Maps Platform Aerial & Satellite Insights** — global zero-shot search, no ISRO archive integration, no India-specific vertical productization.
- **RemoteCLIP / GeoChat / TEOChat** (open research) — the underlying technique is published and not novel by itself. The differentiation is ISRO-archive grounding and Indian-vertical productization, not a new model architecture. Already stated this way in the submitted deck — keep the story consistent.

## Success metric for the internal round

One number: whether this advances past the internal round. The instruction given to the team was to present the submitted deck; the prototype is the team going beyond that instruction to strengthen the case, not a separately-graded deliverable. Judge it against the SIH rubric already used to build the deck (Ideation 40%, Feasibility & Viability 30%, Scalability 20%, Research 10%).

**Anti-metric:** a demo that *looks* finished but is entirely scripted (like the current UX prototype's data) and would fail the moment someone asks "can I try a different question." Looking good in the run-through is not the goal; being real is.

## Glossary

See `AGENTS.md` §6 (vocabulary) — kept in one place to avoid drift between spec files.
