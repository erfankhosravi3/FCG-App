# FCG SYSTEM — ENGINEERING SPECIFICATION
## How every piece works mechanically. No fluff.

---

## SYSTEM INPUTS

The only things that enter this system:
1. **VIN numbers** (from cars on the lot)
2. **Photos** (from a phone camera)
3. **Voice** (phone calls — recorded and processed)
4. **Text** (inbound SMS replies)
5. **Form submissions** (from public-facing tools)
6. **Manual entry** (salesperson adds a walk-in or phone-up)

---

## SYSTEM OUTPUTS

What the system produces:
1. **Social media posts** (Instagram, TikTok, Facebook, YouTube Shorts)
2. **Shareable vehicle pages** (unique URL per car)
3. **QR codes** (printed, stuck on windshields)
4. **SMS messages** (outbound to leads and follow-ups)
5. **Email messages** (outbound nurture sequences)
6. **Call briefings** (context card before every call)
7. **Follow-up tasks** (auto-generated from AI call analysis)
8. **Contact records** (auto-filled from every interaction)
9. **Transcripts** (searchable record of every conversation)
10. **Analytics** (what's working, what isn't)

---

## THE FIVE MACHINES

Each machine is an independent subsystem. They connect through Airtable as the shared data layer.

---

### MACHINE 1: THE CONTENT FACTORY

**Input:** VIN + photos
**Output:** Social posts, vehicle pages, QR codes, inventory records

#### Data Flow

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Salesperson snaps VIN + 3-4 photos             │
│         ↓                                       │
│  App sends to n8n webhook /vin/process          │
│         ↓                                       │
│  n8n calls NHTSA vPIC API                       │
│  → Returns: year, make, model, trim, engine,    │
│    drivetrain, body type, fuel type, features    │
│         ↓                                       │
│  n8n stores in Airtable 11-Inventory:           │
│  {                                              │
│    vin: "4T1G11AK5RU...",                       │
│    year: 2024,                                  │
│    make: "Toyota",                              │
│    model: "Camry",                              │
│    trim: "XSE",                                 │
│    engine: "2.5L 4-Cyl",                        │
│    drivetrain: "FWD",                           │
│    features: ["JBL Audio", "Pano Roof", ...],   │
│    photos: [url1, url2, url3],                  │
│    status: "Available",                         │
│    assignedTo: "Mike",                          │
│    dateAdded: "2026-02-14"                      │
│  }                                              │
│         ↓                                       │
│  n8n triggers 3 parallel jobs:                  │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ SOCIAL   │  │ VEHICLE  │  │ QR CODE  │      │
│  │ CONTENT  │  │ PAGE     │  │ GENERATOR│      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       ↓              ↓              ↓            │
│  Claude API     Static HTML     QR image         │
│  generates:     page at:        linking to       │
│  - IG caption   /v/[vin]       vehicle page      │
│  - TikTok       with specs,                      │
│    script       photos,                          │
│  - FB listing   salesperson                      │
│  - YT Shorts    contact info,                    │
│    hook         "Text me"                        │
│       ↓         button                           │
│  Stored in                                       │
│  Airtable                                        │
│  "Content Queue"                                 │
│       ↓                                          │
│  Buffer API or                                   │
│  manual post                                     │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### n8n Workflows

**W1: `/vin/process`** (POST)
```
Webhook
  → NHTSA vPIC API call (GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json)
  → Code node: parse NHTSA response, extract fields
  → Upload photos to Cloudflare R2 or Airtable attachments
  → Airtable: Create record in 11-Inventory
  → Trigger W2, W3, W4 in parallel
```

**W2: `/content/generate`** (internal trigger)
```
Receive inventory record
  → Claude API: generate social content
    System prompt: "You write short, punchy social media posts for a car salesperson
    at Camelback Toyota in Phoenix. Be casual, confident, not salesy. Include relevant
    specs. End with a call to action (DM, text, or call). Include hashtags."

    User prompt: "Write posts for this car: {vehicle JSON}.
    Generate:
    1. Instagram/TikTok caption (max 150 words, hook in first line)
    2. Facebook Marketplace listing (title + description)
    3. YouTube Shorts script (30 seconds, conversational)"

  → Airtable: Create records in "Content Queue" table
    - One record per platform
    - Fields: platform, caption, status (draft), inventoryLink, scheduledDate
```

**W3: `/vehicle-page/generate`** (internal trigger)
```
Receive inventory record
  → Code node: generate static HTML from template
    - Vehicle specs section
    - Photo gallery (swipeable)
    - Salesperson card (photo, name, phone)
    - "Text me about this car" button (href=sms:{twilio_number}?body=Hi, I'm interested in the {year} {model})
    - "Schedule test drive" button (Cal.com link)
    - QR code for sharing
  → Deploy to Vercel (or save as static file on GitHub Pages)
  → Airtable: Update inventory record with page URL
```

**W4: `/qr/generate`** (internal trigger)
```
Receive vehicle page URL
  → Generate QR code (use qr-code-styling library or API)
  → Store QR image in Airtable inventory record
  → Available for download/print from app
```

#### Creative Marketing Channels

Not just social media. Think broader:

**Physical:**
- QR code windshield stickers (after-hours lot browsers)
- QR code on salesperson's business card → their vehicle portfolio page
- Flyers at local car washes, auto parts stores, gas stations
- "Text DEALS to (602) 905-7670" on everything

**Digital:**
- Instagram Reels / TikTok — short car walkarounds
- YouTube Shorts — "60-second car review"
- Facebook Marketplace listings (personal account, not dealer)
- Facebook Groups — Phoenix car groups, buy/sell groups
- Reddit r/askcarsales, r/whatcarshouldIbuy — be helpful, build reputation
- Nextdoor — local community posts
- Google Business Profile — weekly posts with car photos

**Automated:**
- n8n scheduled posting via Buffer API
- Repost same car across multiple platforms with different captions
- "Car of the Day" automated daily post from inventory queue
- Weekly "Best Deals This Week" roundup post

**Relationship-Based:**
- Every sold customer gets a referral text at Day 90
- Every service customer (if salesperson knows them) gets a trade-up inquiry
- Every friend/family member in the salesperson's contacts gets a soft ask
- Community involvement — sponsor a little league team, local events

---

### MACHINE 2: THE LEAD CAPTURE NET

**Input:** Customer inquiries from any channel
**Output:** Contact record in Airtable, assigned to a salesperson, first response sent

#### All Entry Points

```
                    ┌──────────────────┐
                    │   AIRTABLE       │
                    │   01-People      │
                    │   (Contact       │
                    │    Record)       │
                    └───────▲──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────┴────┐       ┌─────┴────┐       ┌────┴────┐
    │ TWILIO  │       │   FORM   │       │ MANUAL  │
    │ INBOUND │       │ SUBMIT   │       │  ENTRY  │
    └────▲────┘       └─────▲────┘       └────▲────┘
         │                  │                  │
    ┌────┴────────┐   ┌─────┴────────┐   ┌────┴────┐
    │ SMS reply   │   │ Trade-In     │   │ App     │
    │ to post     │   │ tool form    │   │ "Add    │
    │             │   │              │   │ Contact"│
    │ SMS keyword │   │ Vehicle page │   │ button  │
    │ "DEALS"     │   │ "Text me"    │   │         │
    │             │   │ click        │   │ Walk-in │
    │ Call to     │   │              │   │ Phone-up│
    │ Twilio #    │   │ Cal.com      │   │         │
    └─────────────┘   │ booking      │   └─────────┘
                      └──────────────┘
```

#### Contact Creation Logic

Every entry point runs through the same processing:

```
New inquiry arrives
  ↓
Is this phone/email already in 01-People?
  ├─ YES → update existing record, log new interaction
  └─ NO → create new contact:
       {
         name: (from form, or "Unknown" if SMS only),
         phone: (from Twilio or form),
         email: (from form or null),
         source: (Social/Trade Tool/QR/SMS Keyword/Walk-In/Referral/Call),
         assignedTo: (round-robin or specific salesperson),
         stage: "New",
         temperature: "Unknown",
         firstContactDate: now(),
         systemSourced: true
       }
  ↓
Assign to salesperson (round-robin if not specified)
  ↓
Send instant acknowledgment:
  - SMS: "Hey! Thanks for reaching out about the [Vehicle].
    This is [Salesperson] at Camelback Toyota.
    I'll get you some info — when's a good time to chat?"
  ↓
Notify salesperson:
  - Push notification: "New lead: [Name] interested in [Vehicle]"
  ↓
Start follow-up cadence (Machine 3)
```

#### n8n Workflows

**W5: `/twilio/sms`** (POST — Twilio webhook)
```
Twilio sends inbound SMS
  → Code node: extract From, Body, To
  → Determine which salesperson's number received it
  → Airtable: search 01-People by phone
    → IF found: update last contact date, log message in 07-Messages
    → IF not found: create new contact
  → IF body matches keyword ("DEALS", "TRADE", vehicle name):
    → Route to appropriate handler
  → ELSE: forward to salesperson via push notification
  → Log in 07-Messages table
```

**W6: `/form/trade-in`** (POST — form webhook)
```
Form submission: { name, phone, email, year, make, model, mileage, condition }
  → Create/update contact in 01-People
  → Claude API: estimate trade range based on inputs
  → Send SMS to customer with estimate
  → Send SMS to assigned salesperson with lead info
  → Create follow-up task: "Call about trade-in appraisal"
  → Start new-lead cadence
```

**W7: `/form/vehicle-inquiry`** (POST — vehicle page "text me" clicks)
```
SMS arrives referencing a specific vehicle
  → Parse vehicle reference from SMS body
  → Create/update contact
  → Link to inventory record
  → Notify salesperson with vehicle + customer context
  → Auto-reply with vehicle details
```

**W8: `/booking/new`** (POST — Cal.com webhook)
```
New appointment booked
  → Create/update contact
  → Create appointment in 10-Appointments
  → SMS confirmation to customer
  → SMS + push notification to salesperson
  → Create pre-appointment task: "Prepare for [Name] visit"
```

---

### MACHINE 3: THE FOLLOW-UP ENGINE

**Input:** Contact record with stage and last interaction
**Output:** Perfectly timed follow-ups until the lead converts or goes cold

#### State Machine

Every contact moves through stages:

```
NEW → CONTACTED → ENGAGED → APPOINTMENT → VISITED → NEGOTIATING → SOLD
                                                              ↓
                                                          LOST/COLD
                                                              ↓
                                                       REACTIVATION
```

Each stage has rules:

| Stage | Auto-Actions | Transition Trigger |
|-------|-------------|-------------------|
| NEW | Instant text + schedule call | Reply received → CONTACTED |
| CONTACTED | Day 1, 3, 5, 7 follow-ups | Two-way conversation → ENGAGED |
| ENGAGED | Personalized touches, inventory alerts | Appointment set → APPOINTMENT |
| APPOINTMENT | Confirmation text, reminder, prep briefing | Shows up → VISITED |
| VISITED | Be-back sequence (Day 1, 3, 7, 14) | Numbers worked → NEGOTIATING |
| NEGOTIATING | Daily check-in, objection handling support | Signs → SOLD |
| SOLD | Thank you, service reminders, referral asks | — |
| LOST/COLD | Day 30, 60, 90 reactivation attempts | Re-engagement → CONTACTED |

#### Cadence Engine (n8n Implementation)

The cadence engine is a **scheduled workflow that runs every hour**:

```
W9: Cadence Runner (hourly)

  → Airtable: query all contacts WHERE:
      nextFollowUp <= now()
      AND stage != "Sold"
      AND stage != "Dead"
      AND optedOut != true

  → For each contact:
      → Determine cadence step based on:
          - stage
          - daysSinceLastContact
          - cadencePosition (which step they're on)
      → Execute the step:
          - "text" → send via Twilio
          - "call_attempt" → create task for salesperson
          - "email" → send via SendGrid
          - "wait" → update nextFollowUp to next step's date
      → Update Airtable:
          - cadencePosition += 1
          - nextFollowUp = calculated next date
          - lastAutoTouch = now()
```

#### Message Templates (stored in 12-Templates table)

Templates use variables that auto-fill:

```
Hi {firstName}! This is {salesperson} at Camelback Toyota.
{vehicleInterest ? "That " + vehicleInterest + " you were looking at is still available." : ""}
When's a good time to chat?
```

Templates by purpose:
- New lead first touch
- Follow-up #1, #2, #3
- Appointment confirmation
- Appointment reminder (1 hour before)
- Post-visit be-back
- Price/incentive change alert
- Voicemail follow-up text
- Referral ask
- Service reminder
- Birthday / anniversary
- Reactivation attempt

#### Morning Briefing Generator

**W10: Morning Briefing (daily 7:00 AM)**
```
For each active salesperson:
  → Query Airtable:
      - Overdue tasks (dueDate < today, status != Done)
      - Tasks due today
      - Hot leads (temperature = hot)
      - New leads (stage = New, assignedTo = this salesperson)
      - Total pipeline count
  → Format into briefing text
  → Send via push notification + SMS
```

---

### MACHINE 4: THE CALL BRAIN

**Input:** Phone call audio
**Output:** Transcript, structured data extraction, auto-filled CRM, generated tasks

#### Processing Pipeline (detailed)

```
Call ends (Twilio status callback: completed)
        ↓
W11: Post-Call Processor
        ↓
    Wait 30 seconds (recording finalization)
        ↓
    HTTP GET: Twilio recording URL → download WAV
        ↓
    HTTP POST: OpenAI Whisper API
      endpoint: https://api.openai.com/v1/audio/transcriptions
      model: whisper-1
      file: recording.wav
      response_format: verbose_json
      → Returns: { text, segments: [{ start, end, text }] }
        ↓
    Code node: format transcript
      → "0:00 - 0:15  [Speaker 1]: Hi, I'm calling about..."
      → "0:15 - 0:32  [Speaker 2]: Hey! Thanks for calling..."
        ↓
    HTTP POST: Claude API (Messages endpoint)
      model: claude-sonnet-4-5-20250929 (fast + cheap)
      system: "You extract structured data from car sales call transcripts.
               Return ONLY valid JSON, no other text."
      user: "Transcript:\n{transcript}\n\nExtract: {schema}"

      → Returns JSON:
      {
        "summary": "John called about the 2024 Camry XSE. He's been
          shopping for 2 weeks, has a 2019 Accord to trade. Wife wants
          red. Worried about monthly payment. Needs credit union
          pre-approval to come through.",
        "sentiment": "positive",
        "temperature": "hot",
        "buyingSignals": ["asked about financing", "wife picked a color",
          "has trade-in ready"],
        "vehicleInterest": {
          "year": 2024,
          "make": "Toyota",
          "model": "Camry",
          "trim": "XSE",
          "color": "Supersonic Red"
        },
        "budget": { "min": 32000, "max": 36000 },
        "monthlyTarget": 450,
        "timeline": "this month",
        "creditSituation": "good - waiting on credit union",
        "tradeIn": {
          "year": 2019,
          "make": "Honda",
          "model": "Accord",
          "mileage": 87000,
          "condition": "good"
        },
        "personalDetails": [
          "Wife named Sarah",
          "2 kids",
          "Coaches little league at Desert Ridge Park",
          "Works at State Farm, 45-min commute"
        ],
        "promisesByUs": [
          { "promise": "Send Carfax for stock #T4892", "deadline": "today" },
          { "promise": "Check if red XSE is still on the lot", "deadline": "today" },
          { "promise": "Get manager to sharpen the pencil on payment", "deadline": "before next call" }
        ],
        "promisesByThem": [
          { "promise": "Call back once credit union responds", "deadline": "2 days" }
        ],
        "objections": [
          "Monthly payment might be too high",
          "Wants to check one more dealer"
        ],
        "competitors": [
          "AutoNation Honda - got a quote on Civic"
        ],
        "nextSteps": "Send Carfax today, check red XSE availability, call back in 2 days",
        "followUpDate": "2026-02-16"
      }
        ↓
    PARALLEL WRITES TO AIRTABLE:

    ┌─ 01-People: update vehicleInterest, budget, timeline,
    │  creditSituation, tradeIn fields, temperature, personalContext
    │
    ├─ 06-Calls: update with summary, transcript, sentiment, duration
    │
    ├─ 09-Tasks: create one task per promise + follow-up
    │  → "Send Carfax for stock #T4892" due today
    │  → "Check if red XSE available" due today
    │  → "Get manager to sharpen pencil" due before next call
    │  → "Call John back" due Feb 16
    │
    ├─ 04-Life-Events: create records for personal details
    │  → "Wife named Sarah"
    │  → "Coaches little league"
    │
    ├─ 03-Introductions: if referrals mentioned
    │
    └─ 08-Deals: update objections, competitors, stage
```

#### Pre-Call Briefing Generator

**W12: `/briefing/generate`** (POST — called from app before outbound call)

```
Input: { contactId }
  ↓
Parallel Airtable queries:
  → 01-People (full contact record)
  → 06-Calls (last 5 calls, sorted by date desc)
  → 07-Messages (last 10 messages)
  → 09-Tasks (open tasks for this contact)
  → 08-Deals (active deals)
  → 04-Life-Events (all personal details)
  → 03-Introductions (referral connections)
  ↓
Merge all data into unified context object
  ↓
Claude API:
  system: "You generate concise pre-call briefings for a car salesperson.
           Format as a compact card. Be direct. Highlight what matters NOW."
  user: "Generate a briefing for my next call with this person: {context}"
  ↓
Return formatted briefing to app
```

---

### MACHINE 5: THE POWER DIALER

**Input:** List of contacts to call
**Output:** High-speed sequential calls with auto-disposition

#### Conference Bridge Architecture

```
Salesperson taps "Start Dialing"
        ↓
W13: /dialer/start
  → Create Twilio Conference room (unique name per session)
  → Call salesperson's cell → connect to conference
  → Call first contact in queue → connect to conference
  → Enable recording on conference
  → Store session state in n8n static data:
    {
      sessionId: "sess_...",
      salesperson: "Mike",
      conferenceId: "CF...",
      queue: ["recA", "recB", "recC", ...],
      currentIndex: 0,
      stats: { dialed: 0, connected: 0, totalDuration: 0 }
    }
        ↓
Call connects (or doesn't)
        ↓
W14: /dialer/status (Twilio status callback)
  → Call completed/no-answer/busy/failed
  → Log disposition in 06-Calls
  → Update session stats
  → IF disposition = "no-answer":
      → Auto-send voicemail text via Twilio
      → "Hey {name}, just tried to reach you about {vehicleInterest || 'a great deal at Camelback Toyota'}.
         Give me a call back when you get a chance! - {salesperson}"
  → Increment queue index
  → IF more contacts in queue AND session not paused/stopped:
      → Call next contact → bridge to existing conference
      → Salesperson stays connected (their line doesn't drop)
  → ELSE:
      → End conference
      → Send session summary to salesperson
```

#### Quick Disposition (App UI)

After each call ends, before next dials, salesperson sees for 3 seconds:

```
[Connected ✓] [Voicemail 📱] [No Answer ✗] [Skip ⏭]
```

One tap → logged → next call starts.

If they tap nothing in 5 seconds, default to the Twilio-detected outcome and auto-advance.

#### Smart Queue Ordering

The dialer doesn't just go top-to-bottom. It prioritizes:
1. Overdue follow-ups (hottest first)
2. New leads (speed to lead)
3. Warm leads due for contact
4. Cold leads / reactivation attempts

Query: `SELECT * FROM 01-People WHERE assignedTo = {salesperson} AND nextFollowUp <= now() ORDER BY temperature DESC, nextFollowUp ASC`

---

## DATA ARCHITECTURE

### Airtable Tables (Existing 13 + 1 New)

| # | Table | Primary Purpose | Key Fields Added |
|---|-------|----------------|-----------------|
| 01 | People | Contact records | assignedTo, source, systemSourced, temperature, stage, cadencePosition, nextFollowUp, lastAutoTouch |
| 02 | Value-Log | Trust/value tracking | (unchanged) |
| 03 | Introductions | Referral tracking | autoDetected (from call AI) |
| 04 | Life-Events | Personal details | autoDetected (from call AI) |
| 05 | Opportunities | (unused for now) | — |
| 06 | Calls | Call records | transcript, summary, sentiment, recordingUrl, duration, disposition |
| 07 | Messages | SMS records | direction, twilioSid, cadenceStep |
| 08 | Deals | Sales pipeline | objectionsFromAI, competitorsFromAI |
| 09 | Tasks | Follow-ups | autoGenerated, cadenceSource |
| 10 | Appointments | Scheduled visits | source (QR/Web/Phone), confirmed |
| 11 | Inventory | Vehicles on lot | vin, photos, pageUrl, qrCode, contentGenerated |
| 12 | Templates | Message templates | variables, cadenceStep, channel |
| 13 | Sources | Lead source tracking | (unchanged) |
| 14 | Salespeople | User accounts | name, phone, twilioNumber, pin, active |

### Airtable Views (Per Salesperson)

Each salesperson sees only their contacts via filtered views:
- "My Pipeline" — all contacts where assignedTo = me
- "My Hot Leads" — temperature = hot
- "My Overdue" — tasks where dueDate < today
- "My Today" — tasks due today
- "My Inventory" — cars I've posted content for

---

## n8n WORKFLOW REGISTRY (COMPLETE)

### Content Factory
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W1 | `/vin/process` | App POST | Decode VIN, create inventory, trigger content gen |
| W2 | `/content/generate` | W1 trigger | Claude generates social posts from vehicle data |
| W3 | `/vehicle-page/generate` | W1 trigger | Generate static vehicle page |
| W4 | `/qr/generate` | W3 trigger | Generate QR code for vehicle page |

### Lead Capture
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W5 | `/twilio/sms` | Twilio webhook | Handle all inbound SMS |
| W6 | `/form/trade-in` | Form webhook | Process trade-in value requests |
| W7 | `/form/vehicle-inquiry` | Form webhook | Process vehicle page inquiries |
| W8 | `/booking/new` | Cal.com webhook | Process new appointment bookings |

### Follow-Up Engine
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W9 | `/cadence/run` | Hourly schedule | Execute due cadence steps for all contacts |
| W10 | `/briefing/morning` | Daily 7AM | Send morning briefing to each salesperson |

### Call Brain
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W11 | `/call/process` | Twilio status callback | Record → transcribe → extract → fill CRM |
| W12 | `/briefing/generate` | App POST | Generate pre-call briefing for a contact |

### Power Dialer
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W13 | `/dialer/start` | App POST | Start dialing session |
| W14 | `/dialer/status` | Twilio callback | Handle call end, auto-dial next |

### Core CRM
| ID | Path | Trigger | Description |
|----|------|---------|-------------|
| W15 | `/auth` | App POST | PIN login, return token |
| W16 | `/contacts` | App GET/POST | List/create contacts |
| W17 | `/contacts/:id` | App GET/PUT/DELETE | Read/update/delete contact |
| W18 | `/messages/:contactId` | App GET | Get message history |
| W19 | `/messages/send` | App POST | Send SMS via Twilio |
| W20 | `/calls` | App GET | Get call history |
| W21 | `/tasks` | App GET/POST/PUT | Manage tasks |
| W22 | `/dashboard/stats` | App GET | Dashboard numbers |
| W23 | `/inventory` | App GET/POST | Manage inventory |

**Total: 23 n8n workflows**

---

## APP SCREENS

### 1. Login (existing)
PIN pad → authenticate via W15

### 2. Today (new — replaces Messages as default)
Morning briefing view:
- Overdue tasks (red)
- Due today tasks (yellow)
- Hot leads (fire)
- New leads (blue)
- Tap any → contact detail with briefing

### 3. Messages (existing — enhanced)
Conversation list → tap → chat view with real SMS via Twilio

### 4. Calls (existing — enhanced)
Call history with transcripts. Tap a call → see summary + full transcript.

### 5. Contacts (existing — enhanced)
Full contact list with filters (hot/warm/cold, stage, source)
Add contact button → manual entry form
Tap contact → full detail with briefing + history

### 6. Inventory (new)
Grid of cars on the lot. Each card shows photo + specs.
"Add Car" → VIN input + photo capture
Tap car → see generated content, share vehicle page, print QR

### 7. Dialer (new)
Power dialer screen:
- Current contact card + briefing
- Call timer
- Queue progress (14/30 dialed)
- Quick disposition buttons
- Session stats

### 8. Dashboard (existing — enhanced)
Performance metrics:
- Calls, texts, appointments, deals
- Pipeline breakdown
- Lead sources
- Activity timeline

---

## BUILD SEQUENCE

```
WEEK 1: Foundation
  ├─ W15: Auth
  ├─ W16-W17: Contacts CRUD
  ├─ W18-W19: Messages (Twilio SMS send/receive)
  ├─ W20: Calls (logging)
  ├─ W21: Tasks
  └─ App: wire to real API, remove sample data

WEEK 2: Content Factory + Lead Capture
  ├─ W1-W4: VIN processing pipeline
  ├─ W5: Twilio inbound SMS handler
  ├─ W6-W8: Form handlers (trade-in, vehicle inquiry, booking)
  ├─ W23: Inventory management
  └─ App: Inventory screen, VIN input, photo capture

WEEK 3: Follow-Up Engine + Call Brain
  ├─ W9: Cadence runner
  ├─ W10: Morning briefing
  ├─ W11: Post-call processing (record → transcribe → extract)
  ├─ W12: Pre-call briefing generator
  └─ App: Today screen, call transcripts, briefing cards

WEEK 4: Power Dialer + Dashboard
  ├─ W13-W14: Dialer workflows
  ├─ W22: Dashboard stats
  └─ App: Dialer screen, dashboard with real data
```

4 weeks. 23 workflows. 8 app screens. One machine that fills itself.
