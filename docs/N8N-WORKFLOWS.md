# n8n Workflow Setup Guide

This guide walks you through setting up the n8n workflows that power the Friendly Car Guy app.

## Prerequisites

- n8n account at https://erfank.app.n8n.cloud
- Airtable Personal Access Token configured in n8n
- Twilio credentials configured in n8n
- Airtable Base ID: `appmxWdYfVSSHszgE`

## Table Names in Airtable

Make sure your tables are named exactly as follows:
1. People
2. Value Log
3. Introductions
4. Life Events
5. Opportunities
6. Calls
7. Messages
8. Deals
9. Tasks
10. Appointments
11. Inventory
12. Templates
13. Sources

---

## Workflow 1: Get All People (Contacts)

**Purpose:** Fetch all contacts for the app's contact list.

### Setup Steps:

1. Create new workflow, name it "Get All People"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/people`
   - Response Mode: Last Node

3. Add **Airtable** node:
   - Operation: Search
   - Base: Select your base (appmxWdYfVSSHszgE)
   - Table: People
   - Return All: true

4. Add **Respond to Webhook** node:
   - Response Code: 200
   - Response Body: `{{ $json }}`

5. Connect: Webhook → Airtable → Respond to Webhook

6. Activate workflow

**Test URL:** `https://erfank.app.n8n.cloud/webhook/people`

---

## Workflow 2: Get Person by Phone

**Purpose:** Look up a person by phone number (for incoming calls/SMS).

### Setup Steps:

1. Create new workflow, name it "Get Person by Phone"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/people/phone/{phone}`
   - Response Mode: Last Node

3. Add **Airtable** node:
   - Operation: Search
   - Base: Your base
   - Table: People
   - Filter by Formula: `{Phone} = '{{ $json.params.phone }}'`

4. Add **IF** node:
   - Condition: `{{ $json.length > 0 }}`

5. Add **Respond to Webhook** node (for found):
   - Response Body: `{{ $json[0] }}`

6. Add **Respond to Webhook** node (for not found):
   - Response Code: 404
   - Response Body: `{ "error": "Person not found" }`

7. Connect appropriately

**Test URL:** `https://erfank.app.n8n.cloud/webhook/people/phone/+16021234567`

---

## Workflow 3: Get Messages (Conversations)

**Purpose:** Fetch all messages grouped by contact.

### Setup Steps:

1. Create new workflow, name it "Get Messages"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/messages/conversations`

3. Add **Airtable** node:
   - Operation: Search
   - Table: Messages
   - Sort: Created DESC
   - Return All: true

4. Add **Code** node to group by contact:
```javascript
// Group messages by Person
const messages = $input.all().map(item => item.json);
const conversations = {};

for (const msg of messages) {
  const personId = msg.fields.Person?.[0];
  if (!personId) continue;

  if (!conversations[personId]) {
    conversations[personId] = {
      personId,
      messages: [],
      lastMessage: null,
      unreadCount: 0
    };
  }

  conversations[personId].messages.push(msg);

  if (!conversations[personId].lastMessage) {
    conversations[personId].lastMessage = msg;
  }
}

return Object.values(conversations);
```

5. Add **Respond to Webhook** node

---

## Workflow 4: Get Messages for Contact

**Purpose:** Fetch message thread for a specific contact.

### Setup Steps:

1. Create new workflow, name it "Get Contact Messages"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/messages/{contactId}`

3. Add **Airtable** node:
   - Operation: Search
   - Table: Messages
   - Filter by Formula: `FIND('{{ $json.params.contactId }}', ARRAYJOIN({Person}))`
   - Sort: Timestamp ASC

4. Add **Respond to Webhook** node

---

## Workflow 5: Send SMS

**Purpose:** Send an SMS through Twilio and log to Airtable.

### Setup Steps:

1. Create new workflow, name it "Send SMS"
2. Add **Webhook** node:
   - HTTP Method: POST
   - Path: `/messages/send`
   - Response Mode: Last Node

3. Add **Twilio** node:
   - Operation: Send SMS
   - From: +16029057670
   - To: `{{ $json.body.to }}`
   - Message: `{{ $json.body.body }}`

4. Add **Airtable** node:
   - Operation: Create
   - Table: Messages
   - Fields:
     - Person: `{{ $json.body.personId }}`
     - Direction: Outbound
     - Body: `{{ $json.body.body }}`
     - Status: Sent
     - Timestamp: `{{ $now }}`
     - Twilio SID: `{{ $node["Twilio"].json.sid }}`

5. Add **Respond to Webhook** node:
   - Response Body: `{ "success": true, "messageId": "{{ $json.id }}" }`

---

## Workflow 6: Incoming SMS Handler

**Purpose:** Receive SMS from Twilio webhook and log to Airtable.

### Setup Steps:

1. Create new workflow, name it "Incoming SMS"
2. Add **Webhook** node:
   - HTTP Method: POST
   - Path: `/twilio/sms`

3. Add **Airtable** node (lookup person):
   - Operation: Search
   - Table: People
   - Filter: `{Phone} = '{{ $json.body.From }}'`

4. Add **IF** node to check if person exists

5. If person exists branch:
   - Add **Airtable** node to create message with Person link

6. If person doesn't exist branch:
   - Add **Airtable** node to create new Person
   - Add **Airtable** node to create message with new Person link

7. Add **Respond to Webhook** node:
   - Return TwiML: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

**Twilio Webhook URL:** `https://erfank.app.n8n.cloud/webhook/twilio/sms`

---

## Workflow 7: Incoming Call Handler

**Purpose:** Handle incoming calls - forward to cell and log.

### Setup Steps:

1. Create new workflow, name it "Incoming Call"
2. Add **Webhook** node:
   - HTTP Method: POST
   - Path: `/twilio/voice`

3. Add **Airtable** node (lookup person):
   - Operation: Search
   - Table: People
   - Filter: `{Phone} = '{{ $json.body.From }}'`

4. Add **Airtable** node (log call):
   - Operation: Create
   - Table: Calls
   - Fields:
     - Person: Link if found
     - Direction: Inbound
     - Caller ID: `{{ $json.body.From }}`
     - Timestamp: `{{ $now }}`
     - Twilio SID: `{{ $json.body.CallSid }}`
     - Status: Ringing

5. Add **Respond to Webhook** node:
   - Content Type: text/xml
   - Response Body:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="25" callerId="+16029057670" record="record-from-answer-dual">
    +12027487308
  </Dial>
  <Say>The person you are trying to reach is unavailable. Please leave a message after the beep.</Say>
  <Record maxLength="120" playBeep="true" transcribe="true"/>
</Response>
```

**Twilio Webhook URL:** `https://erfank.app.n8n.cloud/webhook/twilio/voice`

---

## Workflow 8: Call Status Update

**Purpose:** Update call record when call ends.

### Setup Steps:

1. Create new workflow, name it "Call Status"
2. Add **Webhook** node:
   - HTTP Method: POST
   - Path: `/twilio/voice/status`

3. Add **Airtable** node:
   - Operation: Search
   - Table: Calls
   - Filter: `{Twilio SID} = '{{ $json.body.CallSid }}'`

4. Add **Airtable** node:
   - Operation: Update
   - Table: Calls
   - Fields:
     - Duration: `{{ $json.body.CallDuration }}`
     - Status: `{{ $json.body.CallStatus }}`
     - Recording URL: `{{ $json.body.RecordingUrl }}`

**Twilio Status Callback URL:** `https://erfank.app.n8n.cloud/webhook/twilio/voice/status`

---

## Workflow 9: Get Calls

**Purpose:** Fetch all calls for the call log.

### Setup Steps:

1. Create new workflow, name it "Get Calls"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/calls`

3. Add **Airtable** node:
   - Operation: Search
   - Table: Calls
   - Sort: Timestamp DESC
   - Return All: false
   - Limit: 50

4. Add **Respond to Webhook** node

---

## Workflow 10: Dashboard Stats

**Purpose:** Get stats for dashboard.

### Setup Steps:

1. Create new workflow, name it "Dashboard Stats"
2. Add **Webhook** node:
   - HTTP Method: GET
   - Path: `/dashboard/stats`

3. Add multiple **Airtable** nodes in parallel:
   - Calls today (filter by date)
   - Messages today
   - New leads (People with Status = New)
   - Pending tasks

4. Add **Code** node to combine:
```javascript
return [{
  callsToday: $('Calls Today').first().json.length || 0,
  textsToday: $('Messages Today').first().json.length || 0,
  newLeads: $('New Leads').first().json.length || 0,
  followups: $('Pending Tasks').first().json.length || 0
}];
```

5. Add **Respond to Webhook** node

---

## Twilio Configuration

After creating the workflows, update your Twilio phone number settings:

1. Go to Twilio Console → Phone Numbers → +1 602-905-7670

2. Voice & Fax:
   - Configure with: Webhook
   - A call comes in: `https://erfank.app.n8n.cloud/webhook/twilio/voice`
   - HTTP: POST
   - Call status callback URL: `https://erfank.app.n8n.cloud/webhook/twilio/voice/status`

3. Messaging:
   - Configure with: Webhook
   - A message comes in: `https://erfank.app.n8n.cloud/webhook/twilio/sms`
   - HTTP: POST

---

## Testing

1. **Test Contacts:** Visit `https://erfank.app.n8n.cloud/webhook/people` in browser
2. **Test SMS:** Send a text to +1 602-905-7670
3. **Test Calls:** Call +1 602-905-7670
4. **Test App:** Open app.friendlycarguy.com, login with PIN 685467

---

## Security Notes

- All webhooks should validate Authorization header in production
- PIN should be hashed, not stored in plain text
- Consider adding rate limiting on login attempts
- Twilio webhooks can be validated using X-Twilio-Signature header
