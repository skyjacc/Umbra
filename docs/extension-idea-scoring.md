# Extension idea scoring — SEO-driven rubric

A reusable framework for validating and ranking a **new** Chrome Web Store extension
before building it. Keep for if/when a second product is on the table — it does not apply
to Umbra itself (already built and published).

Method adapted from the open-source **cws-studio** playbook
(<https://github.com/tacticlaunch/cws-studio>, MIT). Condensed here to the parts worth
reusing; the grey-hat pieces (bought installs, antidetect multi-account) are deliberately
left out.

## The idea

CWS discovery is mostly search. A single-function extension whose **name contains a
keyword with real, confirmed search volume** — in a niche that isn't already owned by a
well-optimized incumbent — can rank and pull organic installs. So score candidates on
demand + buildability, gate out the un-rankable ones, and start with the niche/low-difficulty
keyword.

Aim for **5–10 candidate hypotheses**, score each, then pick.

## Workflow (per candidate)

1. **Seed** — find a real CWS extension to base the idea on: understandable, single theme,
   **≥10K users**. Skip giant brands (installs come from budget, not SEO). Take seeds from
   the *middle* of sorted lists (page 7–20), not the first pages, to avoid collision.
2. **Revenue** — rough: one-time ≈ users/10; IAP ≈ (users/100)×$3. A paid subscription (and
   a higher price) raises the score a lot.
3. **One function?** *(gate)* — must collapse to one simple feature, or drop. Check for
   open-source prior art (`[function] chrome github`) — it raises the simplicity score.
4. **Name keyword + volume** — the keyword in the name is ~70% of ranking. Get US exact
   volume (e.g. Semrush `phrase_this`).
5. **Keyword difficulty (KD)** — fixed tiers (below).
6. **Softness** *(gate)* — is the SERP actually software? >50% software = good; >30%
   non-software (articles, marketplaces) = drop the keyword.
7. **Keyword free?** *(gate)* — not already owned by a well-optimized extension (name holds
   all your words + long description + many translations).
8. Compile the table, pick #1.

## Scored criteria (0–10, judged relative to the candidate set)

| Criterion | How to score |
|---|---|
| **Users** | Seed's user count vs. the other candidates. Exclude giant brands. |
| **Revenue** | users/10 (one-time) + (users/100)×$3 (IAP); boost if a paid subscription exists, more for a higher price. |
| **Simplicity** | Ease of building one function; raise when open-source prior art exists. |
| **Volume** | US exact search volume of the name keyword; must clear the gate. |
| **KD** (fixed tiers) | 0–49 → **10** · 50–69 → **7** · 70–84 → **6** · 85–100 → **5** |

`Total = Users + Revenue + Simplicity + Volume + KD` (max 50).

## Gates (binary — any fail ⇒ DROP)

| Gate | Pass condition |
|---|---|
| One function? | Collapses to one simple feature |
| Volume threshold | US exact ≥ **2,000/mo** (broad niche) or ≥ **500/mo** (narrow niche) |
| Softness | >50% of top SERP is software; not >30% non-software |
| Keyword free | Not owned by a well-optimized incumbent (name = all your words + long description + many locales) |

A niched name with lower volume than a generic competitor is **fine** — you outrank the
generic on the niche query. Don't penalize niching down.

## Output table (always produce this)

```markdown
| Hypothesis (seed) | Name keyword | Users | Revenue | Simplicity | Volume | KD (zone) | Soft? | Keyword free? | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| CSS Scan | css checker | 8 | 9 | 9 | 6 | 8 (orange→7) | YES | YES | 48 | #1 |
| GoFullPage | page screenshot | 9 | 8 | 9 | 7 | – | YES | NO (optimized) | – | DROP — keyword occupied |
```

Then: a 2–4 sentence **recommendation** (which to build first; between a fat/high-KD and a
niche/low-KD keyword, start with the niche one), and **confidence flags** for any
low-confidence metric (no volume data, ambiguous softness, unverified monetization).
