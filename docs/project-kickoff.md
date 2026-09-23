# Project kickoff: Speed-to-Lead Voice Qualifier

_Working name. Kickoff date: 2026-09-23. Owner: Benjamin. Vertical: **Nigerian real estate**: land and homes in Lagos (Lekki-Epe corridor) and Abuja. Demo company "Oriki Homes" (fictional; no matching company found in a web search, 2026-09-23). Voice platform: **ElevenLabs Agents** + Twilio._

## Goal (completion contract)

> Build a working speed-to-lead demo in which someone submits a web inquiry form (with consent to be called), an ElevenLabs voice agent calls them within 60 seconds, qualifies them against a scoring rubric, and then does one of three things: warm-transfers a hot lead to a human with a spoken summary, books a meeting for a warm lead, or logs a cold lead for nurture. Every outcome, including the score, transcript, recording URL, and time-to-first-call, must be written to a lead store and shown on a dashboard. **Done when** three recorded end-to-end test runs (one hot, one warm, one cold) each reach the correct branch, and each run's record in the store matches the call. **Out of scope:** calling anyone who did not tick consent, real customer deployment, and billing. **Stop for Benjamin** on the choice of industry (vertical), the transfer phone number, and anything that places a real call to a third party.

Persistence: this goal lives in this file. To make it an active loop in Claude Code, run:

```
/goal Real-estate speed-to-lead demo: form → ElevenLabs agent call <60s → score → hot=warm transfer (WhatsApp alert to rep if it fails or calling is down), warm=book, cold=log; 3 recorded test runs (hot/warm/cold) hit correct branch and match the lead store + dashboard. No calls without consent; stop for vertical, transfer number, and any third-party call.
```

**Current phase:** prototype. The agent config, scoring and n8n workflows are built and checked locally (see Build status). Nothing is deployed yet: that's blocked on B1–B4 below.

Evidence labels used below: **[obs]** observed · **[src]** source-backed · **[user]** user-decided · **[hyp]** hypothesis.

---

## The six Ps

### 1. Pain
- Inbound leads go cold because follow-up is slow. In the MIT/InsideSales study of 15,000+ leads, firms that responded within 5 minutes were about 100× more likely to make contact and about 21× more likely to qualify the lead than firms that waited 30 minutes. **[src]** ([ainora summary of studies](https://ainora.lt/blog/lead-response-time-statistics-every-study-2026), [revenue.io](https://www.revenue.io/inside-sales-glossary/what-is-lead-response-time))
- The average response time is widely reported at about 42 hours, and many B2B firms never respond at all. **[src]** ([digitalapplied benchmarks](https://www.digitalapplied.com/blog/speed-to-lead-response-time-benchmarks-2026-data-playbook))
- Human sales development reps (SDRs, the people who make first contact with leads) typically take 5–30 minutes to respond, and only during business hours. **[src]** ([leadgen-economy](https://www.leadgen-economy.com/blog/voice-ai-conversational-lead-qualification-guide/))
- Paid products already exist in this category (Aloware, CloudTalk, Telli, CallBotics), so buyers are paying for it. **[src]** ([Aloware](https://aloware.com/blog/speed-to-lead-ai-voice-agent), [CloudTalk list](https://www.cloudtalk.io/blog/best-ai-voice-agents-for-lead-qualification/))
- **Would falsify it:** leads in the chosen vertical are low-intent, or they reject AI calls (for example, a pickup rate or completion rate far below that of human callers). **[hyp]** This is testable only with real traffic, not in this demo.

### 2. Promise
"Every inquiry gets a call within a minute, day or night. Your reps only talk to qualified buyers, and they get the context before they say hello." **[hyp]**. Stated as a demo capability, not a proven revenue lift.

### 3. Product: the first slice
| | |
|---|---|
| User | A prospect on the demo business's landing page, plus one sales rep (Benjamin's phone) |
| Trigger | Form submit (name, phone, email, interest, free-text need, **TCPA consent checkbox**) |
| Call | Outbound ElevenLabs Agents call (via Twilio) within 60 s. The agent discloses that it is an AI, confirms the lead's interest, and asks qualification questions (BANT-style: budget, authority, need, timeline, adapted to the vertical) |
| Output | A structured record: `score (0–100)`, `tier (hot/warm/cold)`, BANT fields, `summary`, `outcome`, `transcript`, `duration_secs`, `seconds_to_first_dial` |
| Hot branch | Warm transfer. The rep hears a short AI summary first, then the caller is connected. If the rep doesn't answer, fall back to booking **and WhatsApp the rep** |
| Warm branch | Book a slot on the calendar and confirm it by SMS/email |
| Cold branch | Log the lead and tag it for nurture. No transfer |
| No answer | Retry every 5 min up to 3 attempts, leave a voicemail, then send the rep a WhatsApp alert |
| Opt-out | "Stop calling me" ends the call and marks the lead do-not-call (DNC) |

**Non-goals (v1):** calling partial or abandoned forms that have no consent; multi-language support; a real CRM sync beyond one store; payments or closing the deal on the AI call; a multi-tenant SaaS.

> Benjamin's "maybe you don't fill in the details" idea: this becomes **partial-form capture only after the phone field and consent checkbox are both filled**. Calling people without consent is out of scope (see Plumbing → Compliance).

### 4. Plumbing
| Need | Choice | Status |
|---|---|---|
| Form + landing page | A static page (the portfolio piece) that posts to an n8n webhook. Tally is an alternative | [hyp] |
| Orchestration | n8n: webhook → validate → store → ElevenLabs `POST /v1/convai/twilio/outbound-call` → retries → post-call routing → WhatsApp fallback | Built (`n8n/`). The n8n API key is currently rejected [obs] |
| Voice agent | ElevenLabs agent "Joy": webhook tools `score_lead` and `book_consultation`, `data_collection` fields, evaluation criteria, dynamic variables (`lead_id`, `first_name`, …) | [src] ([create agent](https://elevenlabs.io/docs/api-reference/agents/create), [tools](https://elevenlabs.io/docs/api-reference/tools/create), [outbound call](https://elevenlabs.io/docs/api-reference/twilio/outbound-call)) |
| Transfer | `transfer_to_number` system tool, conference transfer to Benjamin's phone. The warm message to the rep needs a Twilio number imported natively (not SIP) | [src] ([transfer docs](https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/transfer-to-human)) |
| Booking | Google Calendar via n8n (no free/busy check in v1: an invalid date or API error makes the agent promise an email follow-up) | default (D3) |
| Lead store | n8n Data Table `re_leads` | default (D3) |
| Post-call | ElevenLabs post-call webhook (`post_call_transcription`, `call_initiation_failure`), HMAC-verified → n8n → outcome → retry or WhatsApp | [src] ([post-call webhooks](https://elevenlabs.io/docs/agents-platform/workflows/post-call-webhooks)) |
| WhatsApp fallback | Meta WhatsApp Cloud API template messages from n8n | built; needs templates approved (B4) |
| Latency | Tool webhooks answer after one Data Table write (score_lead timeout set to 10 s). The form gets its reply before the call is placed | [hyp], measure on first live run |
| **Compliance** | Under the FCC's Feb 2024 ruling, AI voices count as "artificial voice" under the Telephone Consumer Protection Act (TCPA), so calls need **prior express consent**. The agent must identify the caller and offer an opt-out. Store the consent text, timestamp, and IP | [src] ([FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf), [FCC summary](https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices)) |
| Failure paths | Invalid phone / no consent → stored, no call. Telephony missing or call API error → WhatsApp to rep. No answer → retry ×3 then WhatsApp. Transfer not connected → book + WhatsApp to rep. Bad webhook signature → rejected | built, untested live |
| Payments / auth | N/A for the demo | — |

### 5. Packaging
- A portfolio case study page: the problem stats, an architecture diagram, a 60–90 s screen recording (form submit → phone rings → transfer), and a live dashboard showing time-to-dial, score distribution, and branch outcomes. **[hyp]**
- An optional "Try it" form that calls the visitor. It needs consent, rate limits, and a cost cap. Decide later (D4).

### 6. Proof
| Level | What proves it | This milestone? |
|---|---|---|
| Working prototype | 3 recorded runs (hot/warm/cold) reach the correct branch; each record in the store matches the transcript; `seconds_to_first_dial` < 60 | **Yes** |
| Robustness | No-answer retry fires; opt-out marks DNC; a transfer that isn't answered falls back to booking | Yes (scripted tests) |
| Customer validation | A real business runs it on live traffic and the contact/qualification rate beats their baseline | No. Not claimed |

---

## Decision log

| # | Decision | Status | Owner |
|---|---|---|---|
| — | Build a speed-to-lead qualification voice agent with human escalation, for the portfolio | Decided | Benjamin |
| D1 | Vertical = **real estate** (buyers + sellers). Demo brokerage "Harbor & Oak Realty", Austin metro (both fictional/configurable) | Decided 2026-09-23 | Benjamin |
| D2 | Transfer destination = **Benjamin's phone** | Decided; **the number itself is still needed** | Benjamin |
| D6 | Voice platform = **ElevenLabs Agents** (replaces Vapi) | Decided 2026-09-23 | Benjamin |
| D7 | **WhatsApp fallback**: if a hot lead's transfer doesn't connect, the lead is unreachable after 3 tries, the call fails, or telephony isn't configured, send the rep a WhatsApp alert. The lead also gets a WhatsApp only if they ticked a WhatsApp consent box | Decided 2026-09-23 (lead-side consent rule proposed by Claude) | Benjamin |
| — | Only call leads who ticked the call-consent checkbox | Proposed (compliance) | Benjamin to confirm |
| D3 | Lead store = n8n Data Table `re_leads`; booking = Google Calendar | Default, not yet confirmed | Benjamin |
| D4 | Public "try it" demo that calls visitors? | Open, later | Benjamin |
| D9 | **WhatsApp channel, user-initiated**: the form offers "Call me now" or "WhatsApp". WhatsApp leads get a "Talk to Joy on WhatsApp" button (wa.me link with their reference) and call Joy themselves. That's free and needs no call permission. Joy matches them to the form lead by caller number; people who call without the form become new leads | Decided 2026-09-23 | Benjamin |
| D10 | Twilio trial exhausted, so phone calls are paused. Build and test on the WhatsApp and browser paths first; top up Twilio (~$20) only to record the phone and transfer demo | Decided 2026-09-23 | Benjamin |
| D11 | **Market = Nigeria.** Demo brand "Oriki Homes" (replaces Harbor & Oak / Austin). Scoring uses payment readiness (outright / deposit-ready / mortgage-NHF / not started) instead of US pre-approval. Bookings are site or virtual inspections. +234 numbers, naira, Africa/Lagos time. The page follows patterns seen on Veritasi Homes and Landwey: "From ₦" estate cards with location, title type and status; a site-inspection CTA; payment plans | Decided 2026-09-23 | Benjamin |
| D8 | WhatsApp provider = Meta WhatsApp Cloud API (works without Twilio, which matters because "Twilio not set up" is one of the fallback cases) | Proposed | Benjamin |

### Design choices worth knowing
- **The LLM collects, the code decides.** The agent calls `score_lead` with structured answers; the tier comes from the tested deterministic function in `agent/scoring.js`, not from the model's judgement. Same inputs always give the same tier, and every score saves its reasons.
- **The warm-transfer message needs Twilio imported natively** into ElevenLabs. SIP trunks can't send the summary to the rep ([ElevenLabs transfer docs](https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/transfer-to-human)).
- WhatsApp messages that the business starts must use **Meta-approved templates**. Two are needed (text below).

## Build status (2026-09-23)

| Piece | File | Verified |
|---|---|---|
| Scoring rubric | `agent/scoring.js` | 8/8 unit cases pass (Nigerian payment types) (`node agent/scoring.test.js`) |
| Agent prompt | `agent/system-prompt.md` | Written; not yet heard on a live call |
| ElevenLabs setup (tools + agent) | `scripts/setup-elevenlabs.mjs` | `--dry-run` output is valid JSON; **no API call made yet** (no key). Payload shape is from the docs, not yet confirmed against the live API |
| n8n intake workflow (13 nodes) | `n8n/build/lead-intake.json` (generated) | Code nodes parse; connections resolve |
| n8n tools + post-call workflow (30 nodes) | `n8n/build/agent-tools-and-postcall.json` (generated) | Passed the n8n-mcp validator: 0 errors, 0 warnings |
| Workflow generator | `scripts/build-n8n.mjs` + `n8n/config.example.json` | Rebuild after editing config |
| Landing page (Oriki Homes) | `web/index.html` | Rendered in preview at phone width, no sideways scroll; "Ask Joy about this" fills in the form; not yet submitted to the live webhook |
| n8n table `re_leads` | n8n (id 5SHiMxUi3YERRD3C) | Created via API, 35 columns |
| **Deployed (2026-09-23)** | n8n `g4zu4LYf616CE6Sd` (intake), `nRDrwzYzghG3v9u9` (tools + post-call), both **active** | Live tests with fake leads (all rows prefixed "TEST"): WhatsApp lead → `whatsapp_invited` ✓; phone lead with no telephony → `whatsapp_fallback` with reason ✓; no consent → stored, no call ✓; score_lead without secret → 401 ✓; score_lead hot → tier hot, 89 ✓; direct WhatsApp caller → new "W…" lead, cold ✓; simulated post-call for a hot lead with no transfer → `transfer_missed` ✓. All 7 executions succeeded. **Not tested live:** booking (would create a real event in Benjamin's calendar), HMAC check (no secret yet), retries, sending WhatsApp |
| Dashboard | — | Not started |

### Blockers (need Benjamin)
- **B1** Your transfer phone number (E.164, e.g. +15551234567) and your WhatsApp number (can be the same).
- ~~B2 n8n API key~~ Fixed 2026-09-23. The new key works; `~/.claude.json` is updated (the MCP picks it up next session). Cloudflare on the host blocks the default Python user agent, so `scripts/n8n_api.py` sends a browser one.
- ~~B2b~~ Approved and done 2026-09-23.
- **B3** An ElevenLabs API key, plus a Twilio number imported into ElevenLabs (Phone Numbers → Import → Twilio).
- **B4** WhatsApp Cloud API: a Meta app, a WhatsApp phone-number ID, a permanent token, and the two templates below submitted for approval.

### WhatsApp templates to submit (category: Utility)
- `new_lead_alert` (to rep): "New lead: {{1}} ({{2}}). {{3}} Phone: {{4}}. Notes: {{5}}"
- `lead_followup` (to lead): "Hi {{1}}, thanks for reaching out to us! We tried to reach you by phone. {{2}} will follow up shortly, or you can pick a time here: {{3}}"

### Setup runbook (once blockers clear)
1. Create the n8n Data Table `re_leads` with columns: lead_id, received_at, updated_at, first_name, last_name, email, phone, inquiry_type, message, consent_call, consent_whatsapp, consent_text, source_page, status, attempts, conversation_id, dialed_at, seconds_to_first_dial, fallback_reason, intent, timeline, financing, seller_motivation, price_range, area, notes, score, tier, score_reasons, next_action, outcome, booked_slot, summary, transcript, duration_secs.
2. In n8n, create header-auth credentials: "ElevenLabs API (xi-api-key)" (header `xi-api-key`) and "WhatsApp Cloud API (Bearer)" (header `Authorization: Bearer <token>`), plus Google Calendar OAuth.
3. `ELEVENLABS_API_KEY=… TRANSFER_NUMBER=+1… N8N_BASE_URL=https://qr4v3tgj.rcld.app TOOL_SECRET=… node scripts/setup-elevenlabs.mjs` → note the agent id.
4. In ElevenLabs: set the workspace post-call webhook to `<n8n>/webhook/re-elevenlabs-postcall` (transcription + call-initiation-failure events) and copy its HMAC secret.
5. Copy `n8n/config.example.json` → `n8n/config.json`, fill in the ids/secrets, run `node scripts/build-n8n.mjs`, then `python3 scripts/deploy-n8n.py` (creates or updates both workflows and activates them).
6. Run the proof checks below.

## Proof checks
- [ ] Submit a form with consent → the phone rings in < 60 s (`seconds_to_first_dial` logged).
- [ ] Submit a form **without** consent → no call; the lead is stored as `no_consent`.
- [ ] Hot script → the rep's phone hears the summary, then the caller is connected; the store shows `tier=hot, outcome=transferred`.
- [ ] Warm script → a calendar event exists at the booked time; the store shows `outcome=booked`.
- [ ] Cold script → no transfer or booking; the store shows `outcome=nurture`.
- [ ] Say "stop calling me" → the call ends; the lead is marked `dnc`; no retry fires.
- [ ] No answer → retries every 5 min up to 3 attempts; the store shows the attempts.
- [ ] Transfer target doesn't answer → falls back to booking, and the rep gets a WhatsApp alert (`outcome=transfer_missed`).
- [ ] Calling not configured / ElevenLabs call API errors → lead saved as `whatsapp_fallback`; rep gets a WhatsApp alert; lead gets one only if they ticked WhatsApp consent.
- [ ] Unreachable after 3 attempts → rep gets a WhatsApp alert (`outcome=unreachable`).
- [ ] Dashboard numbers match the store for all runs.
