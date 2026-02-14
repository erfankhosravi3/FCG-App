# FRIENDLY CAR GUY — DEALER SALES SYSTEM v2
## Self-Generating Lead Engine for Camelback Toyota Salespeople
## NO dealer CRM access. NO store contacts. System fills itself.

---

## THE CONSTRAINT

Salespeople **cannot plug dealership resources** into this system:
- No contacts from the dealer CRM
- No internet lead feeds
- No customer databases
- No store email lists

**What they CAN use:**
- Photos of cars on the lot
- VIN numbers (visible on every car)
- Publicly available vehicle and pricing information
- Their own personal network and social media
- Their own phone and effort

**This means:** The system must generate its own leads. Every contact in the system was created by the system's lead gen channels or manually by the salesperson from their own relationships. The system is a **parallel pipeline** that exists entirely outside the dealership's infrastructure.

---

## REVISED ARCHITECTURE

```
LEAD GENERATION                    SYSTEM                      SALESPERSON
(automated inbound)                (brain)                     (closes deals)

VIN/Photo → Content Posts  ──┐
Trade-In Value Tool        ──┤
"Is This a Good Deal?"     ──┤──→  Airtable (contacts,     ──→  Morning briefing
Social Media Inquiries     ──┤     calls, messages, tasks)      Priority call list
QR Code on Lot Walkers     ──┤          ↓                       Call intelligence
Referral Engine            ──┤     n8n (automation)             Auto follow-ups
SMS Keyword Opt-In         ──┤          ↓                       Power dialer
Cold Outreach (social DMs) ──┘     Twilio (voice/SMS)          Performance stats
                                        ↓
                                   Claude AI (analysis,
                                   briefings, extraction)
```

The system generates leads → captures them → nurtures them → arms the salesperson → tracks results.

---

## REVISED PHASE ORDER

Since the system can't tap into dealership leads, **lead generation is Phase 1, not Phase 5.** Without leads flowing in, nothing else matters.

---

### PHASE 1: VIN-TO-LEAD ENGINE
**Goal:** Turn every car on the lot into a lead generation machine using just photos and VIN numbers.
**Why first:** No leads = no system. This is how you fill the pipeline from nothing.

#### The Core Loop

```
Salesperson walks lot → snaps photo + VIN
        ↓
System auto-generates:
  1. Vehicle spec sheet (from VIN decode)
  2. Social media post with script
  3. Shareable vehicle page with salesperson's contact
  4. Inventory record in Airtable
        ↓
Posts go live → customer sees car → inquires
        ↓
Inquiry captured → contact created → salesperson notified
        ↓
Salesperson calls → deal starts
```

#### Feature 1A: VIN Decode + Vehicle Profile Generator

**Input:** VIN (typed or scanned from photo)
**Process:**
1. Call NHTSA vPIC API (free, unlimited) → year, make, model, trim, engine, drivetrain, features
2. Claude enhances: generates selling points, key features, target buyer profile
3. System creates record in `11-Inventory` table

**Output:** Complete vehicle profile ready for content and sharing:
```
2024 Toyota Camry XSE
2.5L 4-Cylinder | 203 HP | FWD
28 city / 39 highway MPG
Features: JBL Audio, Panoramic Roof, Wireless CarPlay
Color: Supersonic Red
MSRP: $32,340

Why buyers love it:
- Best-in-class fuel economy for a midsize sedan
- Aggressive sport styling with the XSE package
- Toyota reliability — lowest cost of ownership in class
```

#### Feature 1B: Social Media Content Generator

**Input:** VIN + 2-4 photos (from salesperson's phone)
**Process:**
1. VIN decoded → specs ready
2. Claude generates 3 versions:
   - Instagram/TikTok caption (short, hook-driven)
   - Facebook Marketplace listing
   - YouTube Shorts script
3. Salesperson records quick video if they want (optional)
4. System schedules posts via Buffer or Meta Business Suite

**Instagram/TikTok output example:**
```
🔥 Just hit the lot — 2024 Camry XSE in Supersonic Red

This thing is LOADED:
- Panoramic roof
- JBL premium audio
- 39 MPG highway

DM me "CAMRY" or text (602) 905-7670 for pricing.
I'm [Name] at Camelback Toyota — I'll get you right.

#CamelbackToyota #ToyotaCamry #PhoenixCars #NewCar
```

**All inquiries (DMs, texts, calls) route into the system → contact created → salesperson notified.**

#### Feature 1C: Shareable Vehicle Page

For each car in inventory, auto-generate a simple web page:
```
friendlycarguy.com/vehicles/[vin-or-stock]
```

Contains:
- Vehicle photos
- Specs from VIN decode
- Key selling points
- Salesperson's photo, name, phone
- "Text me about this car" button → opens SMS to their Twilio number
- "Schedule test drive" button → Cal.com booking
- QR code version for lot stickers

**Use cases:**
- Salesperson texts the link to interested contacts
- QR code on the car's window sticker (after-hours shoppers scan it)
- Share on social media
- Send in follow-up emails

#### Feature 1D: QR Code Lot Walker Capture

After-hours shoppers browse the lot but nobody's there. Put QR stickers on windshields:
```
[QR CODE]
Interested in this car?
Scan for full details + pricing
```

QR → vehicle page → customer submits name/phone → salesperson gets instant notification next morning.

**This turns the lot into a 24/7 lead gen machine.**

#### Feature 1E: SMS Keyword Opt-In

Promote everywhere: business cards, social bios, lot signage, CL ads:
```
Text DEALS to (602) 905-7670 for Phoenix Toyota deals
```

1. Customer texts "DEALS" → Twilio webhook → n8n
2. Auto-reply: "You're in! I'll send you the best deals from Camelback Toyota. Reply STOP anytime."
3. Contact created in Airtable → assigned to salesperson in rotation
4. Weekly deal blast: top 3-5 cars from inventory queue

#### Feature 1F: "What's My Trade Worth?" Lead Magnet

Landing page (on friendlycarguy.com):
```
WHAT'S YOUR CAR WORTH?
Get an instant estimate — no strings attached.

[Year] [Make] [Model] [Mileage] [Condition]
[Your Name] [Phone] [Email]
[GET MY ESTIMATE]
```

1. Form → n8n webhook
2. Basic valuation generated (from KBB ranges or Claude estimation)
3. Email/text: "Your [Car] is worth approximately $X-$Y. Want an exact number? Bring it in for a free appraisal — takes 10 minutes. Ask for [Salesperson]."
4. Contact created → follow-up scheduled

**Why it works:** Everyone with a trade-in wants to know the number. It's the #1 automotive lead magnet.

#### n8n Workflows — Phase 1

| # | Name | Trigger | What It Does |
|---|------|---------|-------------|
| V1 | VIN Decode | App/webhook | Decode VIN → create inventory record |
| V2 | Content Generator | New inventory record | Generate social captions + scripts |
| V3 | Vehicle Page Builder | New inventory record | Generate shareable vehicle page |
| V4 | SMS Opt-In Handler | Twilio keyword | Create contact, send confirmation |
| V5 | Trade-In Form Handler | Form webhook | Estimate value, create contact, notify salesperson |
| V6 | Social Inquiry Router | Inbound SMS/DM | Create contact, assign salesperson, send notification |
| V7 | Weekly Deal Blast | Scheduled (Saturday 10AM) | Pull top inventory → text to opt-in list |

#### Costs — Phase 1

| Item | Monthly |
|------|---------|
| NHTSA API (VIN decode) | $0 (free) |
| Claude API (content/analysis) | $15-30 |
| Twilio (SMS for 3-5 numbers) | $30-50 |
| Buffer (social scheduling) | $0-10 |
| Vercel (vehicle pages hosting) | $0 (free tier) |
| **Total** | **$45-90/month** |

#### Estimated Build Time: 5-7 days

---

### PHASE 2: CONTACT MANAGEMENT + SMART FOLLOW-UPS
**Goal:** Once leads come in, never lose one. Auto-sequence every contact.
**Why second:** Leads from Phase 1 are flowing in. Now organize and follow up perfectly.

#### What the Salesperson Sees Each Morning

Push notification at 7:00 AM:
```
Good morning [Name]! You have:
🔴 2 overdue follow-ups
🟡 5 due today
🔥 3 hot leads
📱 12 in your pipeline
```

Open the app → priority list sorted by urgency:

```
TODAY — Wednesday, Feb 12

OVERDUE
  ❗ Maria Garcia — promised pricing 2 days ago
  ❗ Tom Wilson — was supposed to call back yesterday

DUE TODAY
  📞 David Lee — follow up on test drive
  📱 Sarah Chen — send her the red Camry link
  📞 Lisa Park — check if financing came through
  📱 James Brown — trade-in estimate ready
  📞 New lead from Trade Tool — Alex Rodriguez

HOT LEADS
  🔥 John Smith — ready to buy this week, needs final numbers
  🔥 Karen Davis — coming in Saturday, hold the RAV4
  🔥 Mike Torres — approved for financing yesterday
```

Tap any contact → full briefing + one-tap call/text.

#### Auto-Follow-Up Cadences

**New Lead (from any Phase 1 channel):**
- Minute 0: Instant text acknowledgment
- Hour 1: Phone call attempt
- Hour 4: If no contact → second text
- Day 1: Call attempt #2
- Day 2: Text with vehicle info or content
- Day 3: Call attempt #3
- Day 5: "Checking in" text
- Day 7: Value content (market update, tip)
- Day 14: Reactivation attempt
- Day 30: Monthly touch
- Archive after 90 days of no response

**Post-Visit (they came to the lot but didn't buy):**
- Day 1: "Great meeting you! That [Vehicle] is still here."
- Day 3: If price/incentive changed → update text
- Day 5: Call attempt
- Day 7: "Anything I can help answer?"
- Day 14: New inventory that matches
- Day 30: "Thinking of you" touch

**Sold Customer:**
- Day 1: Thank you text
- Day 7: "How's the new ride?"
- Day 30: First service reminder
- Day 90: Referral ask
- Day 365: Anniversary + trade-up inquiry

All cadences auto-run through n8n. Salesperson can override or add manual touches at any time.

#### n8n Workflows — Phase 2

| # | Name | Trigger | What It Does |
|---|------|---------|-------------|
| F1 | Morning Briefing | Daily 7AM | Push notification + priority list to each salesperson |
| F2 | Cadence Engine | Scheduled per contact | Send next message in sequence |
| F3 | Overdue Alert | Hourly | Notify if follow-up is overdue |
| F4 | Auto-Task Creator | After any interaction | Schedule next follow-up based on stage |
| F5 | Lead Scorer | After each interaction | Update temperature (hot/warm/cold) based on engagement |

#### Estimated Build Time: 3-4 days
#### Monthly Cost: ~$20-40 (Twilio auto-texts)

---

### PHASE 3: CALL INTELLIGENCE
**Goal:** Record, transcribe, and analyze every call. CRM fills itself.
**Why third:** Salespeople are now making calls from the system. Capture the gold.

*(Same as v1 — this doesn't change. Calls through the system get:)*
- Auto-recorded (Twilio, one-party consent in AZ)
- Transcribed (Whisper API)
- AI-analyzed (Claude extracts vehicle interest, budget, timeline, objections, promises, personal details, next steps)
- Auto-fills Airtable tables (contact record, tasks, life events, deal data)
- Generates pre-call briefing for next interaction

#### The "Zero Typing" Promise
Salesperson makes a call → hangs up → by the time they dial the next person, the system has already:
- Summarized the call
- Updated the contact record
- Created follow-up tasks
- Identified buying signals
- Prepared a briefing for the next call to this person

**They never type anything.** They just talk.

#### n8n Workflows — Phase 3

| # | Name | Trigger | What It Does |
|---|------|---------|-------------|
| C1 | Post-Call Processor | Call status callback | Recording → Whisper → Claude → Airtable |
| C2 | Pre-Call Briefing | Before outbound call | Assemble context → Claude → formatted briefing |
| C3 | Weekly Call Analytics | Scheduled Sunday | Patterns, trends, coaching insights per salesperson |

#### Estimated Build Time: 4-5 days
#### Monthly Cost: ~$65-85 (Whisper + Claude API)

---

### PHASE 4: POWER DIALER
**Goal:** 3x call volume. Auto-dial next on hangup.
**Why fourth:** Pipeline is full, follow-ups are scheduled, intelligence is capturing. Now go fast.

*(Same architecture as v1:)*
- Conference bridge via Twilio
- Auto-dials next in queue on hangup
- Quick disposition (Connected/VM/No Answer)
- Voicemail auto-triggers follow-up text
- Session stats (dialed, connected, avg duration)

#### Estimated Build Time: 4-5 days
#### Monthly Cost: ~$100-200 (Twilio voice)

---

### PHASE 5: PERFORMANCE DASHBOARD + ROI TRACKING
**Goal:** Prove the system works with hard numbers.
**Why fifth:** Enough data has accumulated to show real ROI.

#### Per-Salesperson Metrics
- Leads generated (by source)
- Calls made / connected
- Texts sent / replied
- Appointments set
- Deals closed (self-reported + tracked)
- Gross profit per deal
- Speed of follow-up
- Pipeline size and health

#### System-Wide Metrics (Erfan's View)
- Total leads generated across all channels
- Cost per lead by channel
- Lead-to-deal conversion rate
- Total gross profit attributed to system
- Revenue share earned
- System cost vs. revenue (ROI)
- Per-user performance comparison

#### Data You Need for Scaling
When you pitch this to other dealerships, you show:
```
"4 salespeople at Camelback Toyota used this system for 60 days.

Before: 12% close rate, 45-minute avg lead response time
After: 19% close rate, 38-second avg response time

System-sourced leads: 147
Deals from system leads: 22
Average front gross: $3,200
Total incremental gross: $70,400

System cost: $350/month
ROI: 20,000%+"
```

That's your pitch deck. Built from real data, not projections.

#### Estimated Build Time: 2-3 days
#### Monthly Cost: $0 (dashboard runs on existing infrastructure)

---

## COMPLETE BUILD ORDER (REVISED)

```
PHASE 1: VIN-to-Lead Engine (5-7 days)               ← Fills the pipeline
    ↓
PHASE 2: Contact Management + Smart Follow-Ups (3-4 days)  ← Never lose a lead
    ↓
PHASE 3: Call Intelligence (4-5 days)                  ← CRM fills itself
    ↓
PHASE 4: Power Dialer (4-5 days)                      ← 3x call speed
    ↓
PHASE 5: Dashboard + ROI Tracking (2-3 days)           ← Prove it works
```

**Total: ~18-24 days focused build time**

---

## TOTAL SYSTEM COST

### Launch (Month 1-2)

| Tool | Monthly |
|------|---------|
| n8n Cloud | $20 |
| Twilio (5 numbers + SMS + voice) | $80-150 |
| Airtable Pro | $20 |
| Claude API | $30-50 |
| Whisper API | $45-65 |
| Buffer (social scheduling) | $0-10 |
| Vercel (vehicle pages) | $0 |
| NHTSA API | $0 |
| **TOTAL** | **$195-315/month** |

### At Scale (Month 3+, heavy usage)

| Tool | Monthly |
|------|---------|
| Everything above | $195-315 |
| More Twilio minutes (power dialer) | +$100-200 |
| More Whisper (higher volume) | +$30-50 |
| Enhanced VIN API (market values) | +$50-100 |
| **TOTAL** | **$375-665/month** |

### Revenue Model

At 10% rev share on front-end gross from system-sourced deals:
- 4 salespeople × 3 system deals/month × $3,000 avg gross = **$36,000 total gross**
- Your 10% = **$3,600/month**
- System cost: $375-665
- **Net profit: $2,935-3,225/month**
- **ROI: 440-860%**

Even at a conservative 2 system deals per salesperson per month:
- 4 × 2 × $3,000 = $24,000 gross
- Your 10% = $2,400/month
- Still profitable from month 1.

---

## WHAT THE SALESPERSON'S DAY LOOKS LIKE WITH THIS SYSTEM

**7:00 AM** — Phone buzzes: "3 hot leads, 5 follow-ups due, 2 new inquiries from last night's lot QR scans"

**7:30 AM** — Opens app on drive to work. Reviews briefings for today's hot leads.

**8:00 AM** — Arrives at Camelback. Walks the lot for 15 minutes. Snaps 5 new cars → VINs entered → content auto-generated → posts scheduled for today.

**8:30 AM** — Opens power dialer. Burns through 20 follow-up calls in 30 minutes. Every call recorded, transcribed, analyzed. Tasks auto-created. Next follow-ups auto-scheduled.

**9:00 AM** — Notification: "New inquiry from Trade-In tool — Alex Rodriguez wants to know what his 2020 Highlander is worth." Calls Alex. 5-minute conversation. System captures everything.

**10:00 AM** — Walk-in customer from last night's QR scan. App already has their briefing: "Scanned the 2024 Tundra at 9:47 PM. No other info." Salesperson greets them by name (from the form they filled out), walks them straight to the truck.

**12:00 PM** — Checks app over lunch. 2 new text replies from morning outreach. Responds immediately through the app. System logs everything.

**2:00 PM** — Notification: "Your post about the Camry XSE got 3 DMs. Contacts created." Reviews and calls each one.

**5:00 PM** — Quick dashboard check: 34 calls today, 12 connected, 2 appointments set for Saturday, 1 deal in the works.

**They never opened the dealer CRM once for any of this.** Everything lives in the parallel system. They still use the dealer CRM to desk deals and process paperwork — but the selling happens in your system.

---

## SCALE PATH

### Phase A: Camelback Toyota (3-5 users, 60 days)
Prove it works. Collect data. Refine the system.

### Phase B: 2-3 More Phoenix Dealerships (10-15 users)
Different brands (Honda, Hyundai, Ford) to prove it's not Toyota-specific.

### Phase C: SaaS Product
- White-label
- Self-serve onboarding
- Per-user pricing ($149-299/month per salesperson)
- 50 dealerships × 10 users × $200 = **$100,000/month**

### Phase D: Other Industries
Same core system, different verticals:
- Real estate agents
- Solar sales teams
- Insurance agencies
- Mortgage brokers
- Any high-ticket, relationship-based sales

---

*The key insight: this system doesn't need the dealership's data or permission. It generates its own leads, manages its own pipeline, and proves its own value with tracked ROI. The salesperson brings their hustle. You bring the machine.*
