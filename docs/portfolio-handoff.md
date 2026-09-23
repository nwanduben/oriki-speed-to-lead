# Portfolio handoff: Oriki Homes speed-to-lead, and how it fits with the other builds

**For:** the agent working in the portfolio repo (`nwanduben/Conversational-AI-website`, local folder `~/Downloads/porfolio website V2`).
**From:** the build session for `nwanduben/oriki-speed-to-lead` (local folder `~/PROJECTS/oriki-speed-to-lead`), 2026-09-23.
**Owner:** Benjamin Nwandu. All decisions about publishing, domains and spending are his.

This file does three things:
1. Explains how the four voice-AI builds relate, so the portfolio tells one story instead of four.
2. Gives an **updated, accurate entry** for the real-estate project. The one currently in `src/data/projects.ts` is out of date.
3. Explains how to put the Oriki Homes demo site online on Vercel with a domain: the steps, the config that must change, and the costs.

> **Rule for the portfolio agent:** only claim what is listed as verified below. Where this file says "not yet", the site must say so too. That matches the portfolio's own honesty rules: no synthesised recordings, and status must match reality.

---

## 1. The story: three use cases and one reliability layer

Every voice agent a business buys does one of three jobs. The builds were chosen to cover all three, with QA tooling around them:

| Business job | Build | Repo | Portfolio slug |
|---|---|---|---|
| **Customer support** (high-stakes, identity and risk) | ENTIN Bank AI Voice Support | `ai-voice-banking-support-demo` | `entin-bank-ai-support` |
| **Appointment scheduling** (write to a system of record) | Fairy Share Dental AI Receptionist | `fairy-share-dental` | `fairy-share-dental` |
| **Lead qualification** (speed, scoring, handoff) | Oriki Homes Speed-to-Lead ("Joy") | `oriki-speed-to-lead` | `real-estate-speed-to-lead` |
| **Reliability / QA** across all of them | Agent Preflight | `agent-preflight` | `agent-preflight` |

These are the same three capabilities the portfolio's **Voice AI Workflow Builder** entry names ("appointment scheduling, lead qualification, and customer support"). The builder is the *generaliser*; the three agents are the *worked examples*. Say that on the site.

**How the use cases were chosen:**
- **Support (ENTIN):** the hardest trust problem. A distressed caller asks for something consequential, and a prompt alone cannot be the security control.
- **Scheduling (Fairy Share):** the hardest *correctness* problem. The agent must not say "booked" unless the practice system actually holds the booking.
- **Lead qualification (Oriki):** the hardest *speed* problem. Leads contacted within 5 minutes are about 100× more likely to be reached than leads contacted after 30 minutes (MIT/InsideSales study, 15,000+ leads). Most businesses take hours. This build was researched against live speed-to-lead products (Aloware, CloudTalk, Telli, CallBotics) before it was designed.
- **QA (Preflight):** building the three agents showed that the failures that actually happen are *contract* failures between the agent and its workflows: a test webhook URL, `phone` vs `phone_number`, a placeholder secret. Preflight checks exactly those.

**Principles shared by all four:** these are the site's strongest selling points, so repeat them.
1. **Rules live in code or workflows, not the prompt.**
   - ENTIN: identity and risk levels are enforced by n8n nodes.
   - Oriki: the lead score comes from a tested function, not the model's judgement.
   - Fairy Share: only a read-back of the saved booking can produce "verified".
2. **Check → Act → Verify → Confirm.** Nothing is confirmed to a human until it has been checked.
3. **Synthetic or fictional data only**, stated plainly: ENTIN's 500 synthetic customers, Fairy Share's Open Dental test database, and Oriki Homes, a fictional developer with AI-generated property images.
4. **Security in the plumbing.**
   - HMAC-signed post-call webhooks (ENTIN and Oriki).
   - A shared-secret header on tool calls (Oriki).
   - Signed slot ids (Fairy Share).
   - Never asking for a PIN or OTP (ENTIN).
5. **Honest status.** Each README has a "verified / not yet verified" list. Keep that on the site.

---

## 2. Oriki Homes Speed-to-Lead: what exists now

**The pitch:** a Nigerian property enquiry gets a real conversation within a minute, day or night, on WhatsApp or by voice in the browser. The AI assistant, **Joy**, qualifies the buyer, a tested function scores them, and a hot lead triggers an instant alert to a human.

**Architecture:**
```
Website form (web/index.html) ──POST──► n8n "Intake" ──► n8n Data Table re_leads
   │                                        └─ calling unavailable / failed ──► Telegram alert to the team
   ├─ WhatsApp: opens wa.me/<Joy's number> with "Hi Joy … (ref L…)"
   └─ "Talk to Joy" live voice in the browser (ElevenLabs client SDK)
                 │
        Joy (ElevenLabs Agents, voice: Kehinde, female Nigerian accent)
          ├─ score_lead ─────────► n8n: deterministic 0–100 score + tier (hot/warm/cold) + next action
          ├─ book_consultation ──► n8n: Google Calendar (site or virtual inspection)
          └─ post-call webhook ──► n8n: HMAC verify (Crypto node) → outcome, transcript, retries → Telegram alert
```

**Verified live on 2026-09-23. These are safe to claim:**
- **A real WhatsApp conversation, end to end.**
  - Form → WhatsApp opened with the ref code.
  - Joy qualified the lead in 8 questions and extracted the ref code.
  - The score came back **hot, 97**, and the **form row was updated**.
  - The signed post-call report was verified, the outcome was saved as `transfer_missed` with summary and transcript, and a **Telegram alert** was delivered.
- **Post-call signature check:**
  - a correctly signed report is accepted
  - forged and unsigned reports are **rejected**
- **Tool security:**
  - a tool call without the shared secret gets **401**
  - a lead is matched by ref code, then by phone number
  - a caller who never filled in the form becomes a new lead
- **Scoring:** an **8/8** unit-test suite: Nigerian payment types (outright, deposit-ready, mortgage/NHF), a diaspora investor, "already has an agent" → cold, out of area → cold.
- **Form:** a real browser submission reaches n8n. A CORS problem found in testing was fixed. Nigerian numbers (`0803…`, `+234…`, `234…`) are normalised.
- **Safety limits on the public voice agent:**
  - only the approved sites can connect
  - at most 2 conversations at once and 40 a day
  - 5 minutes per call
- **Agent behaviour:**
  - Joy says she is an AI
  - she never takes payment, and never guarantees a title or a return
  - she handles "stop contacting me" by marking the lead do-not-contact

**Not yet verified. The site must not claim these:**
- **Live voice in the browser:** built, and the panel loads, but not yet heard end to end. Benjamin to test in Chrome.
- **Phone calls:** the Twilio trial is exhausted. The outbound-call path, retries and voicemail are built but haven't been run on a real phone.
- **WhatsApp voice calls:**
  - *Lead calls Joy:* Meta only enables WhatsApp calling for business numbers allowed at least **1,000 business-initiated conversations a day**, which requires business verification.
  - *Joy calls the lead:* Meta **doesn't allow business-initiated WhatsApp calls to Nigerian numbers** at all.
  - So WhatsApp is text and voice notes only.
- **Live transfer to a human:** needs Twilio (native), so for now hot leads get a callback promise plus the Telegram alert.
- **Calendar booking:** built, but not run live, because it would create real calendar events.

**Stack actually used:**
- ElevenLabs Agents: voice and WhatsApp channel, webhook tools, post-call webhook, client SDK for the browser
- n8n (cloud): 2 workflows, a Data Table, a Crypto node for the HMAC check, a Telegram node
- WhatsApp Business Cloud API, through ElevenLabs' WhatsApp integration
- Google Calendar
- The website is a single static HTML page with no build step
- Scoring, the workflow generator and the deploy scripts are written in Node.js and Python

**Engineering stories worth telling** (each is a real bug found and fixed during testing):
1. **Signature checks were silently skipped.** n8n Cloud blocks `require('crypto')` in Code nodes, so the first HMAC check "passed" forged requests. Caught by sending a forged report, and fixed by moving the check to n8n's Crypto node.
2. **Inbound WhatsApp crashed in under a second.** The greeting used `{{dynamic_variables}}`, which are only filled in when *we* start a call. Fixed by keeping constants in the prompt and matching the lead by the `ref` code in the first message.
3. **Real browser submissions never reached n8n,** even though script tests passed. The cause was a CORS preflight that n8n doesn't answer. Fixed by sending a form-encoded "simple request" and adding an `Access-Control-Allow-Origin` header.
4. **Stock photos of real houses** were replaced with AI-generated ones, so no real property is shown as if it were for sale.

---

## 3. Replacement entry for `src/data/projects.ts`

Replace the existing `real-estate-speed-to-lead` object with this. It keeps the existing cover media, which is already in `public/media/calls/`.

```ts
 {slug:'real-estate-speed-to-lead',title:'Oriki Homes: Real Estate Speed-to-Lead Agent',category:'Lead qualification',status:'In Development',summary:'An AI assistant, Joy, who answers a Nigerian property enquiry in under a minute on WhatsApp or by live voice, qualifies the buyer against a tested scoring rubric, and alerts a human the moment a hot lead appears.',cover:{video:'/media/calls/home-services-survey-booker.mp4',poster:'/media/calls/home-services-survey-booker.jpg',alt:'A woman standing in her kitchen taking a phone call.'},problem:'Leads contacted within five minutes are far more likely to be reached and to qualify than leads contacted after thirty, yet first responses are commonly measured in hours, and nobody answers at 2am, which is exactly when diaspora buyers are awake. Nigerian buyers live on WhatsApp, pay on instalment plans, and worry most about title documents and fraud.',solution:'Joy reaches every enquiry on the channel the lead chose: WhatsApp, or live voice on the website. She qualifies one question at a time (land or house, location, budget in naira, outright or payment plan, timeline, Nigeria or diaspora, who else decides) and passes the answers to a deterministic scoring function in n8n. Hot leads trigger an instant Telegram alert to a human; warm leads are offered a site or virtual inspection; cold leads go to nurture. Every step lands in a lead table.',steps:['Website enquiry (fictional developer, Oriki Homes)','WhatsApp or live voice in under a minute','One-question-at-a-time qualification','Deterministic score and tier in n8n','Signed post-call report','Human alert · inspection · nurture'],decisions:['Score in code, not by model judgement. The same answers always give the same tier, and every score stores its reasons.','Make WhatsApp the default and never place a phone call without explicit consent.','Match the WhatsApp conversation to the web enquiry with a reference code in the pre-filled first message, falling back to the phone number.','Verify every post-call report with an HMAC signature and reject forged or unsigned ones.','Joy states she is an AI, never takes payment, and never guarantees a title or a return. “Stop contacting me” becomes a do-not-contact flag.','Treat the public voice agent as untrusted: an allowlist of sites, concurrency and daily caps, and a five-minute limit per conversation.'],evaluation:['Scoring rubric covered by an 8-case test suite, including Nigerian payment types and hard disqualifiers.','A real WhatsApp conversation ran end to end: scored hot (97), matched to its web enquiry, signed report verified, Telegram alert delivered.','A forged and an unsigned post-call report were both rejected on the live workflow; a correctly signed one was accepted.','A tool call without the shared secret is refused with 401.','Not yet verified: phone calls and live transfer (needs a paid telephony account), WhatsApp voice calls (Meta requires a verified 1,000-conversation tier, and business-initiated calls to Nigerian numbers are not permitted), and live calendar booking.'],stack:built('ElevenLabs Agents','n8n','WhatsApp Cloud API','Telegram','Google Calendar'),role:'Researched the speed-to-lead market, then designed and built the agent, the scoring rubric and its tests, the n8n workflows, the signature verification, the WhatsApp and browser-voice channels, and the Oriki Homes site. Oriki Homes is fictional; property images are AI-generated and no real listings or customer data are used.',results:['A working WhatsApp and web-voice speed-to-lead prototype for a fictional Nigerian developer, verified end to end on a real conversation.','Every lead, score, outcome and transcript is recorded; hot leads reach a human through an instant alert.'],challenges:['n8n Cloud blocks the crypto module in Code nodes, so the first signature check silently accepted forged requests. It was caught by testing with a forged request and moved to the Crypto node.','Inbound WhatsApp conversations do not carry custom variables, so the agent crashed on greeting until lead context moved to a reference code.','WhatsApp calling is gated by Meta tiers and country rules, so voice moved to the browser for the demo.'],lessons:['Test the unhappy path on the live system. The forged signature and the real browser submission each exposed a bug the happy-path tests passed.']},
```

**Notes for the portfolio agent:**
- Keep `status:'In Development'` until phone calls and live transfer are verified.
- `githubUrl`: **leave it out.** The repo is private. Add `githubUrl:'https://github.com/nwanduben/oriki-speed-to-lead'` only if Benjamin makes it public.
- `demoUrl`: add it once the Oriki site is deployed (section 4). Example: `demoUrl:'https://oriki.<your-domain>'`.
- `call`, `demoVideo`: **leave them out** until a real recording exists. A scripted browser-voice call with Joy would be honest evidence if the page labels it that way (see `CallRecording.context`).
- Screenshots worth adding once deployed: the hero, the estate cards, the "Talk to Joy" voice panel, the WhatsApp conversation (blur the phone number), a Telegram alert (test lead), and the n8n workflow canvas.
- Existing entries for ENTIN, Fairy Share and Agent Preflight already match their READMEs. Their `githubUrl`s point to repos that are currently **private**, so either make those repos public or remove the links, or visitors will hit a 404.

---

## 4. Deploying the Oriki Homes demo site (Vercel + domain)

The site is **one static file**, `web/index.html`, plus `web/img/`. It has no build step, and **no secrets live in the page.** The two values it exposes are public by design:
- the n8n intake webhook URL
- Joy's public agent ID, which is protected by the site allowlist and the caps

### Recommended setup
- **Host:** Vercel Hobby (free) from the GitHub repo, with **Root Directory = `web`**, framework "Other", no build command.
- **Address**, in order of preference:
  1. A subdomain of Benjamin's portfolio domain, e.g. `oriki.<portfolio-domain>`. No extra cost, and it keeps the brand together.
  2. The free `oriki-speed-to-lead.vercel.app`.
  3. A separate domain such as `orikihomes.com`. **Not recommended:** a real-looking brand domain for a fictional company can mislead people. Keep "Portfolio demo · fictional company" visible if one is ever used.

### Steps
1. In Vercel: **Add New → Project → Import `nwanduben/oriki-speed-to-lead`** (Vercel needs GitHub access to the private repo). Set **Root Directory: `web`**, then Deploy.
2. **Custom domain:** Vercel Project → Settings → Domains → add `oriki.<portfolio-domain>`. At the DNS provider, add the `CNAME` record Vercel shows (usually `cname.vercel-dns.com`).
3. **Allow the new host to use the voice agent.** Without this, "Talk to Joy" is refused on the live site. In the Oriki repo:
   ```bash
   ALLOWED_HOSTS=localhost,oriki.<portfolio-domain>,oriki-speed-to-lead.vercel.app python3 scripts/create-agent.py
   ```
   `create-agent.py` needs `ELEVENLABS_API_KEY` in `.env`.
4. *(Optional hardening)* Tighten which sites can use the form. In `n8n/config.json`, set `"ALLOWED_ORIGINS": "https://oriki.<portfolio-domain>"`, then run:
   ```bash
   node scripts/build-n8n.mjs
   ```
   ```bash
   python3 scripts/deploy-n8n.py
   ```
5. **Check it on the live site:**
   - submit the form (WhatsApp choice) and confirm WhatsApp opens with the ref code
   - press "Talk to Joy" and allow the microphone; Joy should greet you
   - the n8n `re_leads` table should get a row
   - delete test rows (named "TEST …") before recording anything
6. In the portfolio, set `demoUrl` on the entry to the live address.

### Costs

| Item | Cost | Notes |
|---|---|---|
| Vercel Hobby | **Free** | Fine for a personal portfolio demo. Vercel's terms treat commercial use differently, so re-check them if this becomes a paid client deployment |
| Custom domain | **Free** if a subdomain of an existing domain; about $10–15/year for a new `.com` | Vercel can also sell domains |
| ElevenLabs Agents | Per minute of conversation, depending on Benjamin's plan | Joy is capped at 40 conversations a day, 5 minutes each. Check the plan's included minutes in the ElevenLabs dashboard |
| n8n | Existing n8n Cloud plan | 2 workflows; each lead uses a handful of executions |
| WhatsApp Cloud API | Replies within 24 hours of the lead messaging first: **free** | Messages the business starts, and business-initiated calls, are billed by Meta and need a payment method |
| Telegram alerts | **Free** | |
| Phone calls / live transfer (optional) | About $20 Twilio credit to start, plus per-minute rates | Only needed for the phone and transfer demo. Calls to Nigerian numbers are relatively expensive |
| Images | **Free** | AI-generated property images; one Unsplash cityscape (free licence) |

---

## 5. Where things live

| Thing | Location |
|---|---|
| Oriki code | `nwanduben/oriki-speed-to-lead` (private) → `~/PROJECTS/oriki-speed-to-lead` |
| Brief, decisions, proof checks | `docs/project-kickoff.md` |
| Image prompts | `docs/image-prompts.md` |
| Agent | ElevenLabs agent "Joy - Oriki Homes Speed-to-Lead" (id in `agent/deployed.json`) |
| Workflows | n8n: "RE Speed-to-Lead: Intake", "RE Speed-to-Lead: Agent tools + post-call" (ids in `n8n/deployed.json`) |
| Lead table | n8n Data Table `re_leads` |
| WhatsApp line | +234 812 773 3062 (assigned to Joy in ElevenLabs) |
| Secrets | `.env` and `n8n/config.json` in the Oriki folder, both git-ignored. Never copy them into the portfolio repo |
