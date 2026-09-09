# AGENTS.md — SatQuery AI

**Read this completely before touching any code.** This file is tool-agnostic on purpose — the team is using a mix of Claude, Cursor, Copilot and others, so every tool must land in the same place. `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md` all just point here.

---

## 1. Read order

1. `AGENTS.md` — this file
2. `CONTRACT.md` — what must never break
3. `spec/architecture.md` — stack, structure, capabilities
4. `spec/plan.md` — which milestone is active right now
5. `spec/tasks.md` — the specific task you're picking up
6. `AGENT_LOG.md` — top 3 entries, for current state

Read `spec/evals.md` before claiming anything works. Read `spec/smoke.md` before the live demo. Read `spec/decisions.md` before proposing a different architecture — it may already have been rejected and it wastes the team's remaining hours to re-litigate it.

**If a task conflicts with `CONTRACT.md`, the contract wins.** Stop and flag it in `AGENT_LOG.md` — do not silently resolve it either direction.

---

## 2. Hard invariants

Never break these without explicit approval from the lead or the mentor (see §7).

### INV-1 — Confidence must be real (see CONTRACT.md)
### INV-2 — Answers do not state unobserved specifics (see CONTRACT.md)
### INV-3 — No secret ever committed (see CONTRACT.md)

---

## 3. Stack — pinned

| Layer | Choice | Version / notes |
|---|---|---|
| Language | Python | 3.10+ (Colab default) |
| ML | PyTorch + open_clip_torch | latest stable; RemoteCLIP checkpoint swapped in once available, see `spec/architecture.md` §4 |
| Retrieval | cosine similarity, in-memory | no vector DB — dataset is ~15–40 images, a database is unjustified overhead for this scale |
| Backend (stretch) | FastAPI | minimal, one `/query` route, see `spec/architecture.md` |
| Frontend | static HTML/CSS/JS | `SatQuery-AI-UX-Prototype.html`, already built — wire it to real data, do not rebuild it |
| Demo fallback | Gradio | already in `SatQuery-AI-Pipeline.ipynb`, works standalone if the custom frontend integration runs out of time |
| Hosting | Colab (dev/demo only) | no persistent hosting needed for a 2-day internal-round prototype |

Do not add a dependency without checking: is it needed, is it maintained, does it work inside Colab, what does it cost. Record additions in `spec/decisions.md`.

---

## 4. Working rules

**One task per change.** Do not batch. Do not refactor files you weren't asked to touch — with 6 people in the same repo over 2 days, an unscoped refactor is the single most likely way to lose someone else's afternoon of work.

**Report what you changed.** Files touched, and anything noticed but not fixed — write it in `AGENT_LOG.md` even if it feels minor. The next person (possibly using a different tool) has no other way to know.

**Update the spec when reality diverges**, in the same change, not later. If the API response shape needs a new field, edit `CONTRACT.md`'s pinned table in the same commit.

**Do not invent.** If you need a convention that isn't in `CONTRACT.md` or `spec/architecture.md`, ask in the team channel — don't pick one and proceed. Six people inventing independently is how the frontend and backend end up disagreeing about a field name two hours before the demo.

**Prefer making M0–M2 actually work over adding a fourth vertical.** One real, working query end-to-end beats four scripted-looking ones. This is not a style preference — it's the same lesson already learned building the deck itself.

**Never write a real secret into a tracked file.** See CONTRACT.md INV-3. Secrets live in `.env`, which is gitignored from the first commit, never after.

---

## 5. Definition of done

- [ ] Runs end-to-end (notebook executes top to bottom, or frontend correctly calls the real backend)
- [ ] Acceptance criteria in `spec/tasks.md` observably met
- [ ] Relevant check in `spec/evals.md` passes
- [ ] `spec/smoke.md` passes for the affected area
- [ ] Spec updated if behaviour diverged from what was written
- [ ] `spec/tasks.md` checkbox ticked
- [ ] `AGENT_LOG.md` entry written
- [ ] Committed as `<type>(<scope>): <task-id> <summary>` — e.g. `feat(backend): M1-API-02 add /query endpoint`

"It runs on my machine" is not done. "It builds" is not done.

---

## 6. Vocabulary

- **Tile** — a single satellite/aerial image in the demo index. Not "image", not "photo" — keep it consistent so search/grep across the repo works.
- **Query** — the natural-language question a user types. Not "prompt" (that's reserved for LLM-facing text, which this prototype does not use yet).
- **Grounded answer** — the response text, which must be traceable to the retrieved tile per INV-2. Not "AI answer" — that phrasing invites exactly the vagueness INV-2 exists to prevent.
- **Prototype** vs **prod** — there is no "prod" in this 2-day scope. Don't let anyone start treating the Colab notebook as a deployment target; it isn't one.

---

## 7. Decision authority

- **Minor / reversible** (a copy tweak, a color, a task re-order): the lead decides directly, with help from Claude as needed. Don't wait for consensus on these — with 2 days, waiting is more expensive than a wrong small call.
- **Major / hard-to-reverse** (changing the API contract, dropping a milestone, changing which vertical is the demo target): full team consensus required.
- **Mentor guidance overrides both**, whenever given. If the mentor's direction conflicts with something already decided here, the mentor wins — update `spec/decisions.md` to record why, don't just quietly follow the new instruction and leave the old one written down as if still active.

## 8. Budget for metered dependencies

No paid API is in scope for this 2-day build (see `spec/architecture.md` §6 for the quota math on Colab/Gradio's free tiers). If anyone adds one under time pressure, it needs a `spec/decisions.md` entry the same day, not a retroactive one.
