# smoke.md — Pre-demo manual checklist

Run this cold, ideally by someone who did not build the piece they're checking. Takes about 10 minutes. Every future demo failure adds a line here.

## Cold-start section (do this first, every time)

- [ ] Open a fresh Colab session (not one left open from yesterday — GPU sessions get reclaimed)
- [ ] Run the notebook top to bottom with no manual fixes needed
- [ ] Open the frontend (or Gradio link) in a private/incognito browser window — no cached state, no logged-in session assumptions

## Core flow

- [ ] Click each of the 4 example query chips — each returns a distinct, correct-looking tile and answer
- [ ] Type a genuinely new question not in the scripted set — confirm it still returns something real (or a real "no good match" response, not a silent failure)
- [ ] Confirm the confidence number on screen is not suspiciously identical across different queries (a sign it's fallen back to a hardcoded value)
- [ ] Check the retrieved image actually loads — broken image links during a live demo are worse than a wrong answer

## Failure protocol

If something breaks during rehearsal:
1. Don't debug live in front of the mentor if it's not obvious in 60 seconds — switch to the recorded fallback (M3-DEMO-01) and note the bug in `AGENT_LOG.md`.
2. If it breaks during the actual internal-round presentation: switch to the recording immediately, don't narrate the debugging. Nobody in the audience needs to watch you fix a KeyError.

## Rollback

There is no deployed "production" to roll back in this 2-day scope — rollback here means: if the current Colab session or frontend build is broken, fall back to the last known-good screen recording (M3-DEMO-01) and say so plainly if asked. Honesty about a prototype limitation reads better than a visibly broken live demo.
