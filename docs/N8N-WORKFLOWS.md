# Friendly Car Guy — Intelligence System Architecture

## Philosophy

You don't need a CRM. You need a **second brain** that activates your first one.

The system's job is to **hand you a briefing** the moment someone reaches out — not make you dig through records. Every interaction should feel like you have perfect memory.

---

## Core Principle: Person-Centric

The 13 Airtable tables are not 13 separate things. They are **facets of one entity: the Person**.

When John calls, you don't need:
- His contact record
- His message history
- His call log
- His tasks
- His deals

You need: **"Here's everything relevant about John, right now, in 5 seconds."**

---

## The Briefing

When someone contacts you, the system generates this:

```
┌──────────────────────────────────────────────────┐
│  JOHN SMITH                          Incoming    │
│  "Mike's coworker from Honeywell"                │
├──────────────────────────────────────────────────┤
│  LOOKING FOR: 2024 Camry Hybrid · $35-40k        │
│  TIMELINE: This month                            │
├──────────────────────────────────────────────────┤
│  LAST TALK (2 days ago):                         │
│  "Waiting on credit union pre-approval.          │
│   Asked about the red one."                      │
├──────────────────────────────────────────────────┤
│  YOU PROMISED:                                   │
│  ✗ Send Carfax (Jan 28 — overdue)                │
│  ✗ Check if red Camry still available            │
├──────────────────────────────────────────────────┤
│  PERSONAL:                                       │
│  Wife Sarah · 2 kids · Coaches little league     │
│  Dog named Max                                   │
├──────────────────────────────────────────────────┤
│  TRUST LEDGER:                                   │
│  ↑ He referred you to Tom (his coworker)         │
│  ↓ You connected him with your mechanic          │
└──────────────────────────────────────────────────┘
```

---

## System Architecture

```
                    ┌─────────────────┐
                    │   Your iPhone   │
                    │   (PWA App)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │      n8n        │
                    │  Intelligence   │
                    │     Layer       │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐        ┌─────────┐
    │ Twilio  │        │ Airtable │        │ Claude  │
    │         │        │  (Data)  │        │  (AI)   │
    │ Calls   │        │          │        │         │
    │ SMS     │        │ 13 Tables│        │ Briefs  │
    └─────────┘        └──────────┘        └─────────┘
```

---

## Three Core Workflows

### Workflow 1: Person Intelligence API

**The heart of the system.** One call returns everything about a person.

**Endpoint:** `POST /webhook/person-intel`

**Input:**
```json
{
  "phone": "+16021234567"    // OR
  "personId": "recXXXXXX"
}
```

**Output:**
```json
{
  "person": {
    "id": "recXXXXXX",
    "name": "John Smith",
    "phone": "+16021234567",
    "email": "john@email.com",
    "photo": "url",
    "source": "Referral from Mike",
    "status": "Hot",
    "createdAt": "2024-01-15"
  },
  "opportunity": {
    "vehicle": "2024 Camry Hybrid",
    "budget": "$35-40k",
    "timeline": "This month",
    "status": "Negotiating"
  },
  "lastInteraction": {
    "type": "call",
    "date": "2024-01-27",
    "summary": "Discussed financing. Waiting on CU pre-approval."
  },
  "openTasks": [
    { "title": "Send Carfax", "due": "2024-01-28", "overdue": true },
    { "title": "Check red Camry availability", "due": "2024-01-29" }
  ],
  "personalContext": {
    "family": "Wife Sarah, 2 kids",
    "work": "Engineer at Honeywell",
    "interests": "Coaches little league, has dog Max"
  },
  "valueLedger": {
    "given": ["Connected him with my mechanic"],
    "received": ["Referred me to coworker Tom"]
  },
  "recentMessages": [
    { "direction": "in", "body": "Thanks for the info!", "date": "2024-01-27" }
  ],
  "recentCalls": [
    { "direction": "in", "duration": 245, "date": "2024-01-27" }
  ],
  "briefing": "John is close to buying. He's waiting on financing and asked about the red Camry. You owe him a Carfax — send it before this call. He referred you to Tom, so reciprocity is in your favor. His wife is pushing for the hybrid for the gas savings."
}
```

**n8n Flow:**
1. Webhook receives request
2. Look up person by phone OR ID
3. Parallel fetch: Deals, Tasks, Messages, Calls, Value Log, Life Events
4. Aggregate into single object
5. Send to Claude API for briefing generation
6. Return complete profile

---

### Workflow 2: Twilio Inbound Handler

**Handles incoming calls and SMS.** Looks up person, generates briefing, pushes to app, logs interaction.

**Endpoints:**
- `POST /webhook/twilio/voice` — Incoming calls
- `POST /webhook/twilio/sms` — Incoming texts

**Call Flow:**
```
Phone rings
    │
    ▼
Twilio hits n8n webhook
    │
    ▼
n8n looks up caller by phone number
    │
    ├── Found? Get full person intel
    │         Generate briefing
    │         Push notification to app with briefing
    │
    └── Not found? Create new person record
                   Push "Unknown caller" notification
    │
    ▼
Return TwiML to forward call to your cell
    │
    ▼
Log call to Airtable Calls table
```

**SMS Flow:**
```
Text arrives
    │
    ▼
Twilio hits n8n webhook
    │
    ▼
n8n looks up sender by phone
    │
    ├── Found? Get person intel
    │         Log message to Airtable
    │         Push notification with context
    │
    └── Not found? Create person
                   Log message
                   Push "New contact" notification
    │
    ▼
Return empty TwiML (no auto-reply)
```

---

### Workflow 3: Quick Capture API

**Fast endpoints for logging after interactions.**

**Endpoints:**

`POST /webhook/capture/note`
```json
{
  "personId": "recXXX",
  "note": "Discussed financing options. Wife wants hybrid."
}
```

`POST /webhook/capture/task`
```json
{
  "personId": "recXXX",
  "title": "Send Carfax",
  "dueDate": "2024-01-28"
}
```

`POST /webhook/capture/value`
```json
{
  "personId": "recXXX",
  "type": "given",  // or "received"
  "description": "Connected him with my mechanic"
}
```

`POST /webhook/send-sms`
```json
{
  "personId": "recXXX",
  "body": "Hey John, here's that Carfax you asked for..."
}
```

---

## Airtable Table Relationships

```
                         ┌─────────────┐
                         │   PEOPLE    │
                         │  (Central)  │
                         └──────┬──────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Calls  │ │Messages │ │  Tasks  │ │  Deals  │ │Value Log│
   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘

        ┌───────────┬───────────┬───────────┐
        ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Life   │ │ Intro-  │ │Appoint- │ │ Oppor-  │
   │ Events  │ │ ductions│ │  ments  │ │tunities │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

Every table links back to People via a "Person" linked record field.

---

## App Screens Updated

### Incoming Call Screen
When call comes in, app shows the **briefing** immediately:
- Who they are (name, photo, how you met)
- What they want (vehicle, budget, timeline)
- What you last discussed
- What you owe them (overdue tasks highlighted)
- Personal context
- AI-generated "what to know for this call"

### Person Profile Screen
Full view of a person with sections:
- Header: Name, photo, status, source
- Quick actions: Call, Text, Add Note, Add Task
- Current opportunity/deal
- Communication timeline (calls + texts merged)
- Open tasks
- Value ledger
- Personal notes
- Life events

### Inbox
Conversations sorted by recency. Each shows:
- Person name
- Last message preview
- Time
- Unread badge
- **Mini-context:** "Looking for Camry · Hot lead"

### Dashboard
- Follow-ups due today
- Overdue tasks (highlighted)
- People you haven't contacted in 2+ weeks
- Recent activity

---

## AI Integration (Claude)

Claude is used for:

1. **Briefing Generation**
   - Input: All person data
   - Output: 2-3 sentence "what you need to know right now"

2. **Interaction Summarization**
   - After calls, summarize the conversation
   - Extract: promises made, personal details learned, next steps

3. **Relationship Health**
   - Weekly: "These 5 people need attention"
   - Flag: "You promised X to Y, it's overdue"

**Claude Prompt for Briefing:**
```
You are a sales assistant. Given this customer data, write a 2-3 sentence briefing for the salesperson who is about to talk to them. Focus on:
1. What's most important right now (overdue tasks, pending deals)
2. Personal context that builds rapport
3. The trust balance (who owes who)

Be concise. This will be read in 5 seconds before answering the phone.

Customer Data:
{json}
```

---

## Implementation Steps

### Phase 1: Core Infrastructure
- [ ] Create Person Intelligence workflow in n8n
- [ ] Test with sample Airtable data
- [ ] Verify all linked records are fetched correctly

### Phase 2: Twilio Integration
- [ ] Create Inbound Call workflow
- [ ] Create Inbound SMS workflow
- [ ] Update Twilio webhooks
- [ ] Test call forwarding + logging
- [ ] Test SMS logging

### Phase 3: App Updates
- [ ] Update app to call Person Intelligence API
- [ ] Build incoming call briefing screen
- [ ] Build full person profile screen
- [ ] Update inbox with mini-context

### Phase 4: Quick Capture
- [ ] Build capture endpoints in n8n
- [ ] Add "Add Note" UI to app
- [ ] Add "Add Task" UI to app
- [ ] Add "Log Value" UI to app

### Phase 5: AI Briefings
- [ ] Integrate Claude API in n8n
- [ ] Generate briefings on person lookup
- [ ] Add briefing display to app

### Phase 6: Proactive Intelligence
- [ ] Daily digest: who needs attention
- [ ] Overdue task alerts
- [ ] Relationship health scoring

---

## Technical Reference

**Airtable Base ID:** `appmxWdYfVSSHszgE`

**n8n Base URL:** `https://erfank.app.n8n.cloud`

**Twilio Number:** `+16029057670`

**Personal Cell:** `+12027487308`

**App URL:** `https://app.friendlycarguy.com`

**App PIN:** `685467`

---

## What This Enables

With this system, when John calls:

1. Phone rings
2. You glance at your screen
3. You see: "John Smith — waiting on financing, you owe him a Carfax, his wife wants the hybrid, he referred you to Tom"
4. You answer: "John! Hey, I was just about to send you that Carfax. How'd it go with the credit union?"

**You sound like you have perfect memory. Because now you do.**
