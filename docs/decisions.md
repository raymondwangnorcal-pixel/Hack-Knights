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

## DEC-0004 — Disease burden is the landing-page hero

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The landing page opens with a full-screen two-column burden display showing estimated mosquito-related infections since January 1 on the left and deaths since January 1 on the right, then collapses both figures into a persistent top banner after the user scrolls past it.
- Rationale: Visitors must understand the scale of the problem before encountering Mozzy's product explanation or calls to action.
- Scope: Landing-page information hierarchy, desktop and mobile burden presentation, scroll transition, and sticky navigation behavior.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-approved design direction in the 2026-10-10 mockup session.
- Privacy waivers: none

## DEC-0005 — Burden counters use controlled tension

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The landing hero presents continuously advancing infection estimates while the death estimate advances only at whole-person thresholds with a restrained red pulse and no slot-machine animation.
- Rationale: This preserves a sense of an ongoing crisis without making mortality statistics feel gamified or visually gimmicky.
- Scope: Landing-page counter timing, number animation, visual feedback, and the collapsed sticky burden banner.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected option 3 in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0006 — Reunified landing page with a centered path switch

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: After the split burden hero collapses into its sticky banner, the landing page returns to a full-width editorial layout with a centered control that swaps between the citizen identification path and the prevention risk path.
- Rationale: The opening retains a memorable two-sided statement while each audience path receives the full canvas instead of remaining confined to half the viewport.
- Scope: Landing-page layout after the opening hero, audience navigation, content switching, and responsive behavior.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected reunified layout with a centered path toggle in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0007 — Audience control resembles a field-instrument switch

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The centered control that swaps landing-page audience paths uses a mechanical two-stop field-instrument switch rather than an editorial index, rounded segmented control, or circular dial.
- Rationale: A tactile instrument metaphor supports Mozzy's sound-detection function and gives the interaction a more distinctive identity.
- Scope: Landing-page audience control styling, labels, active-state motion, focus states, and responsive treatment.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected option 2 in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0008 — Landing page uses a public-health field-kit material system

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The redesigned landing page uses a warm bone base, deep green-black typography, oxidized-metal controls, hazard orange for infection data, and dried-blood red for mortality data.
- Rationale: The palette supports the selected mechanical field-instrument metaphor and clearly differentiates the redesign from the current pure black-and-white Vercel-inspired interface.
- Scope: Landing-page palette, surface textures, control materials, data semantics, illustration treatment, and sticky burden banner.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected public-health field-kit direction in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0009 — Citizen path opens with the listening instrument

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: When the landing-page switch is set to the citizen path, the first full-width module is the functional listening instrument with a live waveform, location control, primary capture action, and sample-buzz fallback.
- Rationale: Showing the working interaction before explanatory content proves Mozzy is an actionable tool rather than only a concept.
- Scope: Citizen landing-path hierarchy, listening module, sample-demo entry, and placement of explanatory steps.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected option 1 in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0010 — Prevention path opens with the risk map

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: When the landing-page switch is set to the prevention path, the geographic risk map is the dominant first module, with the ranked treatment list, forecast, and prevention plan presented as supporting evidence.
- Rationale: The user wants geographic risk to be understood immediately before operational details.
- Scope: Prevention landing-path hierarchy, map scale and prominence, supporting data layout, and responsive behavior.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected option 1 in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0011 — Species visuals use technical field-guide drawings

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Mosquito species are represented with species-specific technical line drawings and restrained anatomical annotations rather than macro photography or purely abstract audio graphics.
- Rationale: Field-guide illustrations support the public-health field-kit identity and make identification results tangible without sensational imagery.
- Scope: Landing-page illustration system, citizen identification results, species references, and supporting educational content.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected option 1 in the 2026-10-10 mockup design session.
- Privacy waivers: none

## DEC-0012 — Audience control uses a rounded pill

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The centered audience control uses a modern rounded-pill segmented toggle instead of a mechanical field-instrument switch.
- Rationale: The redesign should feel more contemporary and web-native than the earlier field-equipment treatment.
- Scope: Landing-page audience control, active and hover states, motion, and responsive treatment.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: DEC-0007
- Evidence: User-directed mockup revision in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0013 — Prevention map supports region switching including New York

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The prevention experience includes a region filter with New York as an available region, and changing regions replaces the geographic map and its associated risk data.
- Rationale: Health teams need a location-specific operational view rather than a single fixed launch-market map.
- Scope: Prevention map, region filters, New York dataset and geography, rankings, forecasts, and treatment recommendations.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-directed functional expansion in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0014 — Both audience paths include localized prevention measures

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The citizen path uses available or user-provided location data to recommend household actions such as draining standing water and setting traps, while the prevention path identifies specific regional treatment targets such as lakes where mosquito control may be needed.
- Rationale: Both audiences should receive concrete, location-aware action guidance rather than identification or risk data alone.
- Scope: Citizen recommendation module, prevention treatment-target module, location inputs, recommendation content, and map annotations.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-directed functional expansion in the 2026-10-10 design session.
- Privacy waivers: none

## Update — 2026-10-10 — DEC-0007

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0012
- Note: The mechanical field-instrument switch was replaced by a modern rounded-pill audience toggle.
- Privacy waivers: none

## DEC-0015 — Visual system uses a modern civic aesthetic

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The redesigned landing page uses a modern civic-system aesthetic with a bright neutral canvas, disciplined grid, crisp typography, thin dividers, restrained radii, and saturated color reserved for risk data.
- Rationale: This makes the expanded location and prevention features feel contemporary and trustworthy without resembling a generic glassy SaaS dashboard.
- Scope: Landing-page palette, typography, surfaces, layout grid, controls, maps, charts, and illustration treatment.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: DEC-0008
- Evidence: User-selected modern civic-system direction in the 2026-10-10 design session.
- Privacy waivers: none

## Update — 2026-10-10 — DEC-0008

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0015
- Note: The public-health field-kit material system was replaced by a clean modern civic-system aesthetic.
- Privacy waivers: none

## DEC-0016 — Prevention geography uses two-level drilldown

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Prevention maps use a two-level geographic hierarchy, beginning with a region overview and drilling into county, city, district, or equivalent local detail.
- Rationale: A shared drilldown model can support New York, Lagos, and Sao Paulo without building a separate navigation pattern for each geography.
- Scope: Region filter, map navigation, location taxonomy, risk aggregation, treatment targets, breadcrumbs, and responsive map controls.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected two-level drilldown in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0017 — Regional treatment guidance is presented as candidate interventions

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The prevention path identifies specific candidate sites for inspection or possible treatment and displays supporting risk evidence, confidence, responsible authority, and approval status instead of issuing direct pesticide orders.
- Rationale: The product should support operational decisions without presenting simulated or model-generated output as an ecologically and legally approved treatment directive.
- Scope: Prevention recommendations, map annotations, treatment-site detail, action language, confidence display, approvals, and safety copy.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected candidate-intervention framing in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0018 — Citizen prevention combines region data with a property checklist

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Citizen prevention guidance combines coarse regional risk data with a short property-condition checklist and an optional guided inspection path for users who are unsure.
- Rationale: Location can identify locally relevant species and disease risks but cannot establish property conditions such as standing water without user input.
- Scope: Citizen location control, condition chips, inspection guidance, personalized prevention measures, and recommendation language.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected region-plus-checklist personalization in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0019 — Prevention uses an environmental operations map

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The prevention map prioritizes water bodies, wetlands, drainage corridors, mosquito hotspots, and candidate intervention sites while retaining administrative boundaries for accountability.
- Rationale: Environmental features connect modeled mosquito risk to specific inspectable breeding environments more directly than a purely administrative choropleth.
- Scope: Prevention basemap, layers, legend, map filters, local drilldown, candidate-site annotations, and jurisdiction labels.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected environmental operations map in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0020 — Revised concept uses separate stills for both audience states

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The revised concept is delivered as two separate full-page website mockups, one with the citizen path active and one with the prevention path active.
- Rationale: Separate canvases allow the listening and household-guidance flow and the environmental operations map to retain their distinct full-width hierarchies.
- Scope: Mockup deliverables, visual review, audience-state presentation, and subsequent implementation reference.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected two-still delivery format in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0021 — Both revised mockups use a New York scenario

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The citizen and prevention mockups both use New York as the active region, while the prevention region selector visibly offers Lagos and Sao Paulo as alternatives.
- Rationale: A shared region makes the two mockups read as audience states of one product while still demonstrating international extensibility.
- Scope: Mockup content, citizen location, prevention map, region selector, recommendations, and narrative continuity.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected New York for both audience states in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0022 — New York mockups drill into Queens and Jamaica Bay

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The New York scenario drills into New York City and then Queens or Jamaica Bay, using household conditions for the citizen view and storm drains, parks, shoreline wetlands, and inspection zones for the prevention view.
- Rationale: This is a recognizable urban scenario that supports both household prevention and environmental operations without requiring unrelated geographic narratives.
- Scope: Citizen location, environmental map detail, example recommendations, map labels, and treatment-candidate annotations.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected New York City and Queens or Jamaica Bay drilldown in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0023 — Citizen prevention plan follows identification

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The citizen path presents household prevention after mosquito identification, combining the detected species, Queens location, regional risk, and property checklist into a prioritized action plan.
- Rationale: This preserves listening as the primary interaction and gives every recommended action a clear evidence chain.
- Scope: Citizen journey order, result card, property checklist, prevention measures, and recommendation explanation.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-selected post-identification prevention placement in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0024 — Post-scroll landing content omits maps

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: After the visitor scrolls past the burden home screen, the landing-page audience sections do not repeat geographic maps and instead focus on audience-specific tools and recommendations.
- Rationale: The opening already establishes the global scale visually, so the next screen should advance into product utility rather than repeat map imagery.
- Scope: Post-scroll landing-page composition for citizen and prevention states; dedicated dashboard map behavior remains unchanged.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-directed post-scroll mockup revision using the approved home-screen reference on 2026-10-10.
- Privacy waivers: none

## DEC-0025 — Burden statistics replace header navigation after scroll

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Once the home-screen burden display scrolls away, the sticky header retains the Mozzy wordmark on the left and replaces everything to its right with compact infection and death statistics.
- Rationale: The burden remains continuously visible while the main canvas transitions from problem scale to product utility.
- Scope: Landing-page scroll transition, sticky header layout, compact counter presentation, navigation replacement, and responsive behavior.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-directed post-scroll mockup revision using the approved home-screen reference on 2026-10-10.
- Privacy waivers: none

## DEC-0026 — Simplified citizen layout reserves a Gemini recommendation rail

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The post-scroll citizen interface uses a simplified 65/35 layout with the essential listening and compact identification flow on the left and a dedicated individual prevention-recommendation rail on the right, attributed with “By Gemini” at its bottom.
- Rationale: Reducing secondary panels and preserving a stable recommendation area makes the interface easier to scan while clearly identifying the source of AI-generated guidance.
- Scope: Post-scroll citizen-page composition, listening result density, prevention recommendations, AI attribution, and visual hierarchy.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-approved still-mockup revision in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0027 — Sound monitoring uses a Merlin-inspired spectrogram workflow

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The citizen sound monitor uses a Merlin Bird ID-inspired interaction model with a live spectrogram, playhead, elapsed time, play or pause control, recording control, save action, and location-aware identification while retaining Mozzy's own dark visual identity.
- Rationale: A spectrogram-centered workflow communicates live acoustic analysis more clearly than a decorative waveform and provides a familiar recording hierarchy.
- Scope: Citizen listening interface, recording controls, audio visualization, session metadata, location prompt, and identification state.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-approved sound-monitor revision in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0028 — Post-scroll citizen interface uses a minimal flat grid

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The post-scroll citizen interface removes large headings, descriptive copy, badges, nested cards, decorative icons, repeated labels, gradients, and excess pills in favor of a flat grid containing only the sticky statistics, audience toggle, spectrogram controls, compact identification result, three one-line prevention actions, and Gemini attribution.
- Rationale: A smaller information set and flatter composition avoids generic AI-generated dashboard conventions and makes the essential workflow immediately scannable.
- Scope: Post-scroll citizen mockup density, typography, controls, result presentation, prevention rail, and visual hierarchy.
- Implementation: pending
- Recorded against HEAD: `15298b0fee4a4f34686ec083e44d16a90d3f0a86`
- Supersedes: none
- Evidence: User-approved visual reduction in the 2026-10-10 design session.
- Privacy waivers: none

## DEC-0029 — Household prevention panel uses current local signals

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The listening screen's three prevention rows serve individual households in Nigeria and Brazil, refresh after a location or mosquito-signal change, and use live rainfall plus reliable detections or a real recording where available.
- Rationale: Recommendations should respond to a user's region and likely mosquito genus while avoiding claims about unobserved property features.
- Scope: Listening screen, household prevention API, weather and detection inputs, concise actions with expandable reasons, and general guidance when inputs are missing.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User selections during the 2026-10-10 prevention implementation discussion; frontend/src/app/api/prevention/route.ts.
- Privacy waivers: none

## DEC-0030 — Chemical guidance links to local registration search

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The household panel may name a candidate active ingredient with a country regulator search link, while actual use remains conditional on checking a locally registered product and its site-specific label.
- Rationale: This provides useful ingredient-level guidance before a verified consumer product-label catalogue exists for both countries.
- Scope: Household action catalogue, Brazil and Nigeria regulatory links, Gemini action constraints, and chemical recommendation copy.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User selection during the 2026-10-10 prevention implementation discussion; frontend/src/lib/prevention.ts.
- Privacy waivers: none

## DEC-0031 — Compare recording with regional prevalence for household advice

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: A confident real mosquito recording triggers a lookup of recent regional prevalence, and when the recorded genus differs from the district's leading genus the three household actions cover both signals.
- Rationale: A single recording and a regional pattern answer different questions, so neither should silently override the other.
- Scope: Household prevention API, detection-source reconciliation, action selection, and displayed evidence language.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User choice in the 2026-10-10 genus-specific prevention discussion.
- Privacy waivers: none

## DEC-0032 — Genus names appear once above household actions

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: The household prevention panel names the relevant genus or genera in a context line above its three actions rather than repeating genus names in action titles or expanded reasons.
- Rationale: The panel can be scientifically specific without making three short actions verbose or repetitive.
- Scope: Household prevention panel context line, action copy, and expanded explanations.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User choice in the 2026-10-10 genus-specific prevention discussion.
- Privacy waivers: none

## DEC-0033 — Sparse prevalence falls back to the recording alone

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: When the regional mosquito feed has too few real district detections to establish prevalence, household prevention uses a confident real recording alone and explicitly marks regional prevalence unavailable.
- Rationale: A single recording can guide an individual action without being misrepresented as a regional pattern or padded with broader unsupported data.
- Scope: Household prevention data fallback, context wording, and genus-specific action selection.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User choice in the 2026-10-10 genus-specific prevention discussion.
- Privacy waivers: none

## DEC-0034 — Genus-specific household copy uses behavior, not pesticide susceptibility

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Household recommendations explain genus-specific breeding sites and biting times, but do not claim a genus is susceptible to a particular pesticide without local resistance and verified product evidence.
- Rationale: Genus-level identification supports behavioral prevention advice but does not establish local insecticide efficacy.
- Scope: Household action catalogue, Gemini prompt constraints, expanded explanations, and evidence links.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: User choice in the 2026-10-10 genus-specific prevention discussion.
- Privacy waivers: none

## DEC-0035 — Use a generation-capable Gemini default

- Date: 2026-10-10
- Owner: agent
- Status at record: active
- Decision: The household prevention route defaults to Gemini 3.8 Flash with low thinking while retaining the GEMINI_MODEL override and curated-rule fallback.
- Rationale: The configured key receives a model-unavailable error when generating with the former default, while a real generation request succeeds with Gemini 3.8 Flash.
- Scope: Household prevention model selection, latency, recurring inference cost, and environment template.
- Implementation: pending
- Recorded against HEAD: `a7c271ceb6493ec39fb9681c323c27de12144bf4`
- Supersedes: none
- Evidence: Local API verification and frontend/src/app/api/prevention/route.ts in the 2026-10-10 prevention implementation.
- Privacy waivers: none

## DEC-0036 — Voices for spoken advice

- Date: 2026-10-10
- Owner: user
- Status at record: active
- Decision: Six languages are spoken: English (Tobi, Nigerian), Portuguese (Fabi, Brazilian), Hausa (Ibrahim, on eleven_v3), and Spanish, French and Mandarin (Sarah, ElevenLabs' built-in multilingual voice). Yoruba and Cantonese stay text-only. Results are read aloud automatically, with a mute toggle remembered per device. Spoken lines are cached by the CDN and on the phone.
- Rationale: ElevenLabs lists no model for Yoruba or Cantonese; Hausa is supported only from Eleven v3. The account is on the free plan, which has 3 library-voice slots, so native voices go to the demo languages.
- Scope: voice route (cacheable GET), listening screen (auto-speak, mute, replay), Vercel env vars ELEVENLABS_VOICE_{EN,PT,HA,ES,FR,ZH} and ELEVENLABS_MODEL_HA.
- Implementation: elevenlabs-voice branch, rebased onto the household prevention panel (DEC-0029)
- Supersedes: none (refines DEC-0002)
- Evidence: https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support ; session conversation of 2026-10-10.
- Privacy waivers: none
