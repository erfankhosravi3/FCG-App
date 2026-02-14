# FRIENDLY CAR GUY — FULL FEATURE ROADMAP
## Auto Dialer, Call Intelligence, Lead Generation, Automation

---

# FEATURE SET A: POWER DIALER + CALL ENGINE

## What It Does
A power dialer that auto-dials the next number in your list the moment you hang up. No dialing, no waiting, no fumbling. You talk, you hang up, next call starts. Built for cold-calling speed.

## Legal Framework (You're Clear)
- **Arizona is a one-party consent state** — you can record every call you're on
- **Power dialers are NOT autodialers under TCPA** (per Facebook v. Duguid, 2021) — they dial from stored lists, no random/sequential generation
- **You must:** Call 8AM-9PM local time, identify yourself, honor DNC list, honor opt-outs within 10 business days
- **Arizona registration:** Register as telephonic seller with AZ Secretary of State (limited registration, no bond required for solo operator)
- **Recording disclosure:** Not legally required in AZ, but best practice — add a 2-second "This call may be recorded" at the start

## Architecture: Twilio + n8n + Airtable

```
Airtable (Call List)
       ↓
   n8n (Orchestrator)
       ↓
   Twilio Voice API
       ↓
  Your Phone (Conference Bridge)
       ↓
  Contact's Phone
       ↓ (on hangup)
  n8n receives status callback
       ↓
  Auto-dials next number
       ↓ (simultaneously)
  Recording → Transcription → AI Analysis → Airtable Update
```

### How It Works (Step by Step)
1. You open the app, tap "Start Dialing" on a call list
2. n8n triggers Twilio to create a conference call
3. You're connected to the conference (your phone rings first)
4. Twilio dials the contact and bridges them in
5. Call recording starts automatically (dual-channel)
6. When the call ends, Twilio sends a status callback to n8n
7. n8n logs the call to 06-Calls in Airtable
8. n8n immediately dials the NEXT person on the list
9. Your phone rings again — you're already on the next call
10. Meanwhile: recording → Whisper transcription → Claude analysis → Airtable update

### n8n Workflows Needed

| # | Webhook Path | Method | What It Does |
|---|-------------|--------|-------------|
| D1 | `/dialer/start` | POST | Start a dialing session — takes a list ID, begins calling |
| D2 | `/dialer/next` | POST | Dial next contact in the list |
| D3 | `/dialer/pause` | POST | Pause the dialing session |
| D4 | `/dialer/stop` | POST | End the dialing session |
| D5 | `/dialer/status` | POST | Twilio status callback — call ended, trigger next |
| D6 | `/dialer/connect` | POST | Twilio webhook — call answered, bridge to conference |

### App UI Additions
- **Dialer View** — new screen or overlay
  - "Start Session" button with list selector
  - Current contact card (name, phone, notes, last interaction)
  - Call timer
  - Quick-action buttons: Log Note, Create Task, Mark Hot, Skip, Pause, Stop
  - Session stats: Calls made, Connected, Avg duration
- **Call List Management** — create/edit dialing lists from contacts with filters

### Costs
| Item | Monthly Cost |
|------|-------------|
| Twilio Voice (outbound, ~75 calls/day) | ~$165 |
| Twilio Recording (free storage) | $0 |
| Conference bridge (per minute) | ~$0.01/min |
| **Dialer Total** | **~$165-200/month** |

---

# FEATURE SET B: CALL RECORDING + TRANSCRIPTION + AI ANALYSIS

## What It Does
Every call is recorded, transcribed, and analyzed by AI. The transcript and AI summary auto-fill your CRM tables — contact preferences, vehicle interests, budget, follow-up tasks, promises made, objections raised. Zero manual data entry.

## Architecture

```
Twilio Recording (dual-channel WAV)
       ↓
   n8n downloads recording
       ↓
   OpenAI Whisper API (transcription)
       ↓
   Claude API (analysis + extraction)
       ↓
   Airtable (auto-update multiple tables)
```

### What AI Extracts from Every Call

| Data Point | Airtable Table | Field |
|-----------|---------------|-------|
| Vehicle interest | 01-People | Vehicle Interest |
| Budget range | 01-People | Budget |
| Timeline to buy | 01-People | Timeline |
| Credit situation | 01-People | Credit Situation |
| Trade-in details | 01-People | Trade-In fields |
| Personal details (family, work, hobbies) | 04-Life-Events | Auto-created |
| Promises YOU made | 09-Tasks | Auto-created with due dates |
| Promises THEY made | 09-Tasks | Auto-created |
| Objections raised | 08-Deals | Objections field |
| Competitor mentions | 08-Deals | Competition field |
| Sentiment / temperature | 01-People | Temperature |
| Call summary | 06-Calls | Summary |
| Full transcript | 06-Calls | Transcription |
| Follow-up needed? | 09-Tasks | Auto-created |
| Referral mentions | 03-Introductions | Auto-created |

### n8n Workflow: Post-Call Processing Pipeline

**Workflow P1: `/process-recording`** (triggered by call status callback)

1. **Twilio status callback** → call completed
2. **Wait 30 seconds** (recording needs time to finalize)
3. **HTTP Request** → download recording WAV from Twilio
4. **HTTP Request** → send to Whisper API (`POST /v1/audio/transcriptions`)
   - Model: `whisper-1`
   - Response format: `verbose_json` (includes timestamps + speaker detection)
5. **Code node** → format transcript with timestamps
6. **HTTP Request** → send transcript to Claude API with extraction prompt:

```
You are analyzing a phone call transcript between a car buying consultant (Erfan) and a potential client.

Extract the following as structured JSON:
{
  "summary": "2-3 sentence call summary",
  "sentiment": "positive/neutral/negative",
  "temperature": "hot/warm/cold",
  "vehicleInterest": "specific vehicle or null",
  "budget": { "min": number, "max": number } or null,
  "timeline": "this week/this month/3 months/just browsing" or null,
  "creditSituation": "excellent/good/fair/poor/unknown",
  "tradeIn": { "year": "", "make": "", "model": "", "condition": "" } or null,
  "personalDetails": ["wife named Sarah", "2 kids", "coaches little league"],
  "promisesMade": [{ "by": "erfan/client", "promise": "send Carfax", "deadline": "tomorrow" }],
  "objections": ["price too high", "wants to check other dealers"],
  "competitors": ["AutoNation Honda", "online quote from Carvana"],
  "referralMentions": ["friend Tom also looking for a truck"],
  "followUpNeeded": true,
  "followUpAction": "Send Carfax report and call back Thursday",
  "followUpDate": "2025-02-20"
}
```

7. **Airtable Update** → update 01-People with extracted contact data
8. **Airtable Create** → create tasks in 09-Tasks for each promise/follow-up
9. **Airtable Create** → create life events in 04-Life-Events for personal details
10. **Airtable Create** → create introductions in 03-Introductions for referral mentions
11. **Airtable Update** → update 06-Calls with summary, transcript, and sentiment

### Transcription Service Recommendation

| Service | Cost (275 hrs/mo) | Accuracy | Real-Time? | Best For |
|---------|-------------------|----------|-----------|----------|
| **OpenAI Whisper** | **$99/mo** | 6.5% WER | No | Best value, good accuracy |
| Deepgram | $127/mo | 8.1% WER | Yes (sub-300ms) | Real-time use cases |
| AssemblyAI | $69-75/mo | 5.4% WER | Yes | Best accuracy, hidden costs |
| Twilio built-in | $578/mo | ~8-10% WER | Yes | Simplest but most expensive |

**Recommendation:** Start with **Whisper at $99/month**. Upgrade to Deepgram if you want real-time transcription during calls.

### Total Costs for Recording + Transcription + AI

| Item | Monthly Cost |
|------|-------------|
| Twilio recording storage | $0 (free) |
| Whisper transcription (275 hrs) | $99 |
| Claude API (analysis, ~75 calls/day) | ~$15-30 |
| **Total** | **~$115-130/month** |

---

# FEATURE SET C: AUTOMATED LEAD GENERATION CHANNELS

## The Lead Generation Engine

You need leads flowing in without manually hunting. Here are the channels ranked by **impact vs effort** for a solo operator.

---

### TIER 1: START NOW (Free - $50/month)

#### C1. Google Business Profile
- **Setup:** Create GBP for "Friendly Car Guy" in Phoenix
- **Keywords:** "car buying consultant Phoenix", "car buying help Phoenix AZ"
- **Automation:** n8n posts weekly tips, auto-requests reviews after consultations
- **Cost:** FREE
- **Impact:** HIGH — local searchers have strong buying intent
- **Time:** 3-4 hours setup, 30 min/week maintenance

#### C2. VIN Analyzer Lead Magnet
- **What:** Landing page: "Is this a good deal? Enter VIN + price, get instant report"
- **How:** Form → n8n → NHTSA API (free VIN decode) → Claude (analysis) → PDF emailed
- **Captures:** Name, email, phone — warm leads actively shopping
- **Cost:** $10-30/month (email service)
- **Impact:** HIGH — every submission is a potential consultation client
- **Time:** 12-16 hours to build, then fully automated

**n8n Workflow: VIN Analyzer**
1. Form submission (Typeform/website) → webhook
2. Call NHTSA vPIC API → decode VIN (free, unlimited)
3. Call Claude API → analyze deal: price vs market, features, known issues, verdict
4. Generate PDF report (Carbone.io or HTML email)
5. Email to user via SendGrid
6. Add lead to Airtable 01-People
7. Trigger nurture sequence (Day 2: tips, Day 5: service offer, Day 14: CTA)
8. SMS notification to you: "New VIN check from [Name] — [Vehicle] at $[Price]"

#### C3. SMS Keyword Opt-In
- **What:** "Text DEALS to (602) 905-7670 for Phoenix car deals"
- **How:** Twilio receives keyword → n8n → auto-reply confirmation → add to Airtable list
- **Where to promote:** Business card, social media bio, Craigslist ads, flyers
- **Cost:** ~$20-30/month (Twilio SMS costs)
- **Impact:** MEDIUM-HIGH — opt-in list you own
- **Time:** 6-8 hours setup, then automated

**n8n Workflow: SMS Opt-In**
1. Twilio receives "DEALS" from new number
2. Look up in 01-People — new or existing?
3. If new: create contact, set Source = "SMS Opt-In"
4. Reply: "You're in! Expect 2-4 deal alerts/month. Reply STOP anytime."
5. Add to "Deal Alerts" list in Airtable
6. Weekly n8n trigger → pull top 3 deals → send to all opted-in numbers

---

### TIER 2: WEEK 2-4 ($50-150/month)

#### C4. Social Media Content Engine
- **Platforms:** Instagram Reels, TikTok, YouTube Shorts, Facebook
- **Content formula:** VIN + photos → vehicle spec lookup → script → short video
- **Batch process:** 1 day of filming = 20-30 videos for the week
- **Scheduling:** Buffer ($5/month) or Meta Business Suite (free)
- **High-performing content types:**
  - "Is this a good deal?" VIN reviews
  - "What dealers don't tell you" tips
  - Vehicle comparisons
  - Behind-the-scenes negotiation breakdowns

**n8n Workflow: Content Pipeline**
1. Add VIN + photos to Airtable "Content Queue"
2. n8n triggers NHTSA API → get specs
3. Claude generates script: "This [Year] [Make] [Model] is listed at $[Price]. Here's the truth..."
4. You record the video (30-60 seconds)
5. Buffer schedules across all platforms
6. Track engagement in Airtable

**Cost:** $25-100/month (Buffer + video tools)
**Time:** 4-6 hours/week for content creation (batched)

#### C5. Email Nurture Sequences
- **Trigger:** Any lead capture (VIN analyzer, form, SMS, social)
- **Sequence:**
  - Day 0: Deliver requested content (report, guide, etc.)
  - Day 2: Educational tip ("3 red flags to watch for")
  - Day 5: Your value prop + testimonial
  - Day 9: Social proof ("Phoenix buyers save $3,200 on average")
  - Day 14: CTA with urgency ("Book your consultation — limited slots")
- **Tool:** Mailchimp free tier (up to 500 contacts) or SendGrid
- **Cost:** $0-15/month
- **Time:** 6-8 hours to write sequences, then automated

#### C6. Craigslist Ads
- **Post in:** "Automotive Services" category
- **Title:** "Car Buying Consultant — Save Thousands on Your Next Car"
- **Rotate:** Re-post every 48 hours across Phoenix, Scottsdale, Mesa, Tempe
- **Lead capture:** Direct to website or "Text DEAL to (602) 905-7670"
- **Cost:** $5 per post × 4 cities × 15 posts/month = ~$300/month (or less with service)
- **Time:** 2-3 hours setup, 1 hour/week maintenance

---

### TIER 3: MONTH 2+ ($100-300/month)

#### C7. Deal Alert Subscription Service
- **What:** Customers tell you their preferences (budget, make/model, features)
- **You curate:** Weekly "deal alerts" matched to their criteria
- **How:** Manual curation from Cars.com/CarGurus/AutoTrader (legal, no scraping)
- **Revenue:** Free tier (email alerts) → paid tier ($29/month for priority + consultation)
- **Lead magnet:** "Tell me what you want. I'll find the deals."

**n8n Workflow: Deal Alerts**
1. Customer submits preferences via form → Airtable
2. You manually add 3-5 matching deals weekly to Airtable "Deals" view
3. n8n weekly trigger → match deals to subscriber preferences
4. Twilio SMS: "Found a 2024 Camry Hybrid at $32K — $3K below market! Details: [link]"
5. Email with full details + "Want help buying this? Book consultation"

#### C8. Buyer's Guide Lead Magnets (Downloadable PDFs)
- "The Phoenix Car Buyer's Checklist: 27 Things to Check Before Signing"
- "How to Negotiate at a Dealership: Scripts from a Former Salesman"
- "Avoid These 10 Dealer Tricks (2026 Phoenix Edition)"
- **Gated download:** Email required → nurture sequence
- **Cost:** Free (time to create)
- **Time:** 4-6 hours per guide

#### C9. Google Ads (Pay-Per-Click)
- **Keywords:** "car buying help Phoenix", "car consultant Phoenix"
- **Budget:** Start at $10-20/day
- **Landing page:** VIN analyzer or consultation booking
- **Cost:** $300-600/month
- **Time:** 4-6 hours setup, 1 hour/week optimization

---

## MASTER LEAD FLOW ARCHITECTURE

```
INBOUND CHANNELS                    CAPTURE                    NURTURE                 CONVERT
─────────────────                   ───────                    ───────                 ───────
Google Search (GBP)  ──┐
Facebook/Instagram   ──┤
TikTok/YouTube       ──┤
Craigslist Ads       ──┤──→  Website / Form  ──→  Airtable  ──→  Email Sequence  ──→  Book
SMS Keyword          ──┤──→  Twilio Opt-In   ──→  Airtable  ──→  SMS Sequence    ──→  Consultation
VIN Analyzer         ──┤──→  Instant Report  ──→  Airtable  ──→  Follow-up Call  ──→  Close
Referrals            ──┤──→  Direct Contact  ──→  Airtable  ──→  Personal Touch  ──→  Repeat
Cold Calls (Dialer)  ──┘──→  Power Dialer    ──→  Airtable  ──→  Auto-Tasks      ──→  Business
                                                      ↓
                                                 AI Analysis
                                                 (Claude API)
                                                      ↓
                                              Auto-fill CRM tables
                                              Auto-create tasks
                                              Auto-score leads
                                              Auto-brief on next contact
```

---

# PRIORITY MATRIX — WHAT TO BUILD AND WHEN

## Phase 1: Core App (Current Plan — Phases 1-4)
**Auth + Contacts + Messages + Calls + Tasks + Dashboard**
Already planned. This is the foundation everything else plugs into.

## Phase 2A: Call Recording + Transcription Pipeline
**Build immediately after core app works**
- Recording is Twilio config (1 hour)
- Whisper integration is one n8n workflow
- Claude extraction is one n8n workflow
- Auto-fills your CRM from every call
- **This is the highest-leverage feature** — eliminates data entry entirely

## Phase 2B: Lead Gen Tier 1
**Build in parallel with 2A**
- Google Business Profile (afternoon project)
- VIN Analyzer lead magnet (1-2 day build)
- SMS keyword opt-in (half-day build)
- Email nurture sequence (1 day to write)

## Phase 3: Power Dialer
**Build after core CRM is populated with real data**
- You need contacts in the system first
- Conference-based architecture via Twilio
- n8n orchestrates the dial-next-on-hangup loop
- App UI for dialer screen

## Phase 4: Lead Gen Tier 2
**Build once you have 10+ consultations under your belt**
- Social media content engine
- Craigslist ads
- Deal alert subscription
- Buyer's guide PDFs

## Phase 5: Person Intelligence (Already Planned)
**Build when you have enough data to make briefings valuable**
- Pulls from all tables: calls, messages, tasks, personal details, deals
- Claude generates briefing before every interaction
- Most powerful when you have 50+ contacts with rich data

## Phase 6: Advanced Lead Gen
**Build when revenue justifies the spend**
- Google Ads ($300-600/month)
- Enhanced VIN APIs (DataOne/MarketCheck)
- Listing aggregation
- Corporate fleet consulting pipeline

---

# TOTAL SYSTEM COST ESTIMATE

## Minimum Viable Stack (Months 1-3)

| Tool | Monthly |
|------|---------|
| n8n Cloud | $20 |
| Twilio (phone + SMS + voice) | $50-100 |
| Airtable (Pro) | $20 |
| Whisper API (transcription) | $30-50 (lower volume initially) |
| Claude API | $15-30 |
| Mailchimp (free tier) | $0 |
| Buffer (free tier) | $0 |
| Google Business Profile | $0 |
| NHTSA API | $0 |
| **TOTAL** | **$135-220/month** |

## Full Stack (Months 6+)

| Tool | Monthly |
|------|---------|
| Everything above | $135-220 |
| Twilio (heavy calling) | +$100-200 |
| Whisper (full volume) | +$50-70 |
| Buffer paid | +$10 |
| Video creation tool | +$20-30 |
| Craigslist posting | +$50-175 |
| Enhanced VIN APIs | +$100-300 |
| **TOTAL** | **$465-1,000/month** |

At 4-6 consultations/month ($125 each) + deal alerts + cold-calling commissions, this system pays for itself fast.

---

# VIN → EVERYTHING AUTOMATION

You mentioned wanting to waste no time — just provide photos and VIN numbers. Here's what happens:

**You input:** VIN + 4-6 photos
**The system does:**
1. Decodes VIN → year, make, model, trim, features, specs (NHTSA, free)
2. Looks up market value (Auto.dev or manual)
3. Generates "Is this a good deal?" analysis (Claude)
4. Creates social media post script (Claude)
5. Creates short video from photos + script (Pictory/InVideo)
6. Schedules posts across all platforms (Buffer)
7. Creates Airtable record in 11-Inventory
8. If it matches any subscriber preferences → sends deal alert SMS
9. If posting to FB Marketplace → auto-generates listing

**Your time:** 30 seconds to input VIN + snap photos.
**System time:** 2-3 minutes, fully automated.

---

*This feature roadmap turns the FCG app from a CRM into a full business operating system. Every call fills itself. Every lead gets nurtured. Every VIN becomes content. Every interaction builds intelligence. You just talk to people and let the system do the rest.*
