# Project Decisions

## DEC-0001 — Eight advice languages for the demo

- Date: 2026-10-09
- Owner: user
- Status at record: active
- Decision: Advice text and spoken advice target eight languages: English, Portuguese, Spanish, French, Mandarin, Cantonese, Yoruba and Hausa.
- Rationale: The user chose seven languages for the demo audience and agreed to keep Portuguese because Brazil is a launch market.
- Scope: Language codes en, pt, es, fr, zh, yue, yo, ha on the recommend and voice routes, the listen page picker, and the API contract.
- Implementation: pending
- Recorded against HEAD: `40d800e95af7d5b2365ae2c1580229459b60a847`
- Supersedes: none
- Evidence: frontend/API_CONTRACT.md (Languages section); frontend/src/lib/languages.ts; session conversation of 2026-10-09.
- Privacy waivers: none

## DEC-0002 — Speech is opt-in per language

- Date: 2026-10-09
- Owner: agent
- Status at record: active
- Decision: A language gets a play button only when its own ElevenLabs voice variable is set; every other language stays text-only.
- Rationale: Voice support for Yoruba, Cantonese and Hausa is unverified, so an untested language must not be spoken on stage by a fallback voice.
- Scope: frontend voice route (GET lists voiced languages, POST no longer falls back to the English voice), listen page play button, .env.example.
- Implementation: pending
- Recorded against HEAD: `40d800e95af7d5b2365ae2c1580229459b60a847`
- Supersedes: none
- Evidence: frontend/src/app/api/voice/route.ts; frontend/API_CONTRACT.md (Languages section).
- Privacy waivers: none

## DEC-0003 — Demo-scope location, clip length and map level

- Date: 2026-10-09
- Owner: shared
- Status at record: active
- Decision: Clips are 10 seconds; the phone sends only country and district, with detection coordinates set server-side to the district centre plus a small offset; the map uses Lagos local government areas and Sao Paulo subprefectures as centre-point columns with no boundary files.
- Rationale: The user asked for recommendations sized to a working demo; these keep the coarse-location promise and avoid boundary data work.
- Scope: API contract for classify and detections, mock district list, dashboard map; sub-city case numbers for Sao Paulo are simulated and labeled.
- Implementation: pending
- Recorded against HEAD: `40d800e95af7d5b2365ae2c1580229459b60a847`
- Supersedes: none
- Evidence: frontend/API_CONTRACT.md (Demo decisions section); buzz-check-spec.md open decisions.
- Privacy waivers: none

## Update — 2026-10-09 — DEC-0001

- Type: implementation
- Implementation commit: `3d6925adee8c0f2cde7315a268f8b3e0b5b677ab` — Add eight advice languages; make speech opt-in per language
- Superseded by: none
- Note: Implemented in the frontend app and API contract on the frontend branch.
- Privacy waivers: none

## Update — 2026-10-09 — DEC-0002

- Type: implementation
- Implementation commit: `3d6925adee8c0f2cde7315a268f8b3e0b5b677ab` — Add eight advice languages; make speech opt-in per language
- Superseded by: none
- Note: Implemented in the frontend app and API contract on the frontend branch.
- Privacy waivers: none

## Update — 2026-10-09 — DEC-0003

- Type: implementation
- Implementation commit: `3d6925adee8c0f2cde7315a268f8b3e0b5b677ab` — Add eight advice languages; make speech opt-in per language
- Superseded by: none
- Note: Implemented in the frontend app and API contract on the frontend branch.
- Privacy waivers: none
