# n8n Workflow Build Guide — Week 1: Foundation

Step-by-step instructions for building each workflow in the n8n editor.
Build them in this order. Each one takes 5-15 minutes.

**Base URL:** `https://erfank.app.n8n.cloud`
**Airtable Base ID:** `appmxWdYfVSSHszgE`

---

## Prerequisites: n8n Environment Variables

Before building workflows, set these in **Settings → Environment Variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `FCG_AUTH_TOKEN` | (generate a random 64-char string) | Bearer token for API auth |
| `FCG_PIN` | `685467` | PIN for login |
| `AIRTABLE_API_KEY` | (your Airtable personal access token) | Airtable access |
| `AIRTABLE_BASE_ID` | `appmxWdYfVSSHszgE` | Your base |
| `TWILIO_ACCOUNT_SID` | (your Twilio SID) | Twilio access |
| `TWILIO_AUTH_TOKEN` | (your Twilio auth token) | Twilio access |
| `TWILIO_PHONE` | `+16029057670` | Your Twilio number |
| `PERSONAL_CELL` | `+12027487308` | Forward calls here |

---

## W15: Auth (`/auth` — POST)

**Purpose:** Validate PIN, return bearer token.

### Nodes

1. **Webhook** (POST)
   - Path: `auth`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** — Check PIN
   - Condition: `{{ $json.body.pin }}` equals `{{ $env.FCG_PIN }}`

3. **TRUE → Respond to Webhook**
   - Response Code: 200
   - Response Body:
   ```json
   {
     "success": true,
     "token": "{{ $env.FCG_AUTH_TOKEN }}",
     "user": {
       "name": "Erfan",
       "role": "admin"
     }
   }
   ```

4. **FALSE → Respond to Webhook**
   - Response Code: 401
   - Response Body:
   ```json
   {
     "success": false,
     "error": "Invalid PIN"
   }
   ```

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/auth \
  -H "Content-Type: application/json" \
  -d '{"pin":"685467"}'
```

---

## Auth Middleware Pattern

Every workflow below starts the same way. Copy this pattern:

1. **Webhook** (GET or POST as specified)
2. **IF** — Check Bearer Token
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`
   - If the header comes as lowercase: `{{ $json.headers.authorization }}`
3. **FALSE → Respond to Webhook** with 401:
   ```json
   { "error": "Unauthorized" }
   ```
4. **TRUE → (your workflow logic)**

---

## W16: Contacts List + Create (`/contacts` — GET/POST)

### GET: List All Contacts

1. **Webhook** (GET) — Path: `contacts`
2. **Auth check** (IF node as above)
3. **Airtable: Search Records**
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Return All: true
   - Sort: `Name` ascending
4. **Code node** — Transform to app format:
   ```javascript
   return items.map(item => ({
     json: {
       id: item.json.id,
       name: item.json.fields.Name || '',
       phone: item.json.fields.Phone || '',
       email: item.json.fields.Email || '',
       status: item.json.fields.Status || '',
       stage: item.json.fields.Stage || 'New',
       temperature: item.json.fields.Temperature || '',
       vehicleInterest: item.json.fields['Vehicle Interest'] || '',
       budget: item.json.fields.Budget || '',
       timeline: item.json.fields.Timeline || '',
       source: item.json.fields.Source || '',
       notes: item.json.fields.Notes || '',
       assignedTo: item.json.fields['Assigned To'] || '',
     }
   }));
   ```
5. **Respond to Webhook** — Response Body: `{{ $json }}`
   (Set response mode to "All Incoming Items" or use `$items()`)

### POST: Create Contact

Create a **second workflow** or use a **Router/Switch** on the HTTP method.

1. **Webhook** (POST) — Path: `contacts`
2. **Auth check**
3. **Airtable: Create Record**
   - Table: `01-People`
   - Fields:
     - Name: `{{ $json.body.name }}`
     - Phone: `{{ $json.body.phone }}`
     - Email: `{{ $json.body.email }}`
     - Vehicle Interest: `{{ $json.body.vehicleInterest }}`
     - Source: `{{ $json.body.source }}`
     - Stage: `{{ $json.body.stage || 'New' }}`
4. **Code node** — Transform response:
   ```javascript
   const item = items[0].json;
   return [{
     json: {
       id: item.id,
       name: item.fields.Name,
       phone: item.fields.Phone,
       email: item.fields.Email,
       stage: item.fields.Stage,
       source: item.fields.Source,
       vehicleInterest: item.fields['Vehicle Interest'],
     }
   }];
   ```
5. **Respond to Webhook**

### Test
```bash
# List contacts
curl https://erfank.app.n8n.cloud/webhook/contacts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create contact
curl -X POST https://erfank.app.n8n.cloud/webhook/contacts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Lead","phone":"6025551234","source":"Manual","stage":"New"}'
```

---

## W17: Single Contact (`/contacts/:id` — GET/PUT/DELETE)

### GET: Single Contact

1. **Webhook** (GET) — Path: `contacts/:id`
2. **Auth check**
3. **Airtable: Get Record**
   - Table: `01-People`
   - Record ID: `{{ $json.params.id }}`
4. **Code node** — Transform (same as W16)
5. **Respond to Webhook**

### PUT: Update Contact

1. **Webhook** (PUT) — Path: `contacts/:id`
2. **Auth check**
3. **Airtable: Update Record**
   - Table: `01-People`
   - Record ID: `{{ $json.params.id }}`
   - Fields: map from `$json.body` to Airtable field names
4. **Respond to Webhook**

### DELETE: Delete Contact

1. **Webhook** (DELETE) — Path: `contacts/:id`
2. **Auth check**
3. **Airtable: Delete Record**
   - Table: `01-People`
   - Record ID: `{{ $json.params.id }}`
4. **Respond to Webhook** — `{ "success": true }`

---

## W18: Messages (`/messages/:contactId` — GET)

1. **Webhook** (GET) — Path: `messages/:contactId`
2. **Auth check**
3. **Airtable: Search Records**
   - Table: `07-Messages`
   - Formula: `{Person} = '{{ $json.params.contactId }}'`
   - Sort: `Created` ascending
   - Return All: true
4. **Code node** — Transform:
   ```javascript
   return items.map(item => ({
     json: {
       id: item.json.id,
       body: item.json.fields.Body || '',
       direction: item.json.fields.Direction || 'Inbound',
       date: item.json.fields.Created || '',
       contactId: item.json.fields.Person?.[0] || '',
     }
   }));
   ```
5. **Respond to Webhook**

---

## W19: Send Message (`/messages/send` — POST)

1. **Webhook** (POST) — Path: `messages/send`
2. **Auth check**
3. **Airtable: Get Record** — Lookup contact in 01-People by ID to get phone number
   - Table: `01-People`
   - Record ID: `{{ $json.body.contactId }}`
4. **Twilio: Send SMS**
   - From: `{{ $env.TWILIO_PHONE }}`
   - To: `{{ $json.fields.Phone }}`
   - Body: `{{ $items('Webhook')[0].json.body.body }}`
5. **Airtable: Create Record** — Log message in 07-Messages
   - Table: `07-Messages`
   - Fields:
     - Body: the message text
     - Direction: `Outbound`
     - Person: `[{{ $items('Webhook')[0].json.body.contactId }}]` (linked record)
     - Twilio SID: `{{ $json.sid }}`
6. **Respond to Webhook** — `{ "success": true }`

---

## W20: Calls (`/calls` — GET)

1. **Webhook** (GET) — Path: `calls`
2. **Auth check**
3. **Airtable: Search Records**
   - Table: `06-Calls`
   - Sort: `Date` descending
   - Return All: true (or limit to 50)
4. **Code node** — Transform:
   ```javascript
   return items.map(item => ({
     json: {
       id: item.json.id,
       name: item.json.fields['Contact Name'] || 'Unknown',
       phone: item.json.fields.Phone || '',
       direction: item.json.fields.Direction || 'incoming',
       duration: item.json.fields.Duration || 0,
       date: item.json.fields.Date || '',
       summary: item.json.fields.Summary || '',
       contactId: item.json.fields.Person?.[0] || '',
     }
   }));
   ```
5. **Respond to Webhook**

---

## W21: Tasks (`/tasks` — GET/POST/PUT)

### GET: List Tasks

1. **Webhook** (GET) — Path: `tasks`
2. **Auth check**
3. **Airtable: Search Records**
   - Table: `09-Tasks`
   - Formula: `{Status} != 'Done'`
   - Sort: `Due Date` ascending
4. **Code node** — Transform:
   ```javascript
   return items.map(item => ({
     json: {
       id: item.json.id,
       title: item.json.fields.Title || item.json.fields.Name || '',
       status: item.json.fields.Status || 'Pending',
       dueDate: item.json.fields['Due Date'] || '',
       contactId: item.json.fields.Person?.[0] || '',
       contactName: item.json.fields['Contact Name'] || '',
     }
   }));
   ```
5. **Respond to Webhook**

### POST: Create Task

1. **Webhook** (POST) — Path: `tasks`
2. **Auth check**
3. **Airtable: Create Record**
   - Table: `09-Tasks`
   - Fields:
     - Title: `{{ $json.body.title }}`
     - Due Date: `{{ $json.body.dueDate }}`
     - Status: `Pending`
     - Person: `[{{ $json.body.contactId }}]` (if provided)
4. **Code node** — Transform response
5. **Respond to Webhook**

### PUT: Update/Complete Task (`/tasks/:id`)

1. **Webhook** (PUT) — Path: `tasks/:id`
2. **Auth check**
3. **Airtable: Update Record**
   - Table: `09-Tasks`
   - Record ID: `{{ $json.params.id }}`
   - Fields from body (status, title, etc.)
4. **Respond to Webhook** — `{ "success": true }`

---

## Conversations List (`/messages/conversations` — GET)

1. **Webhook** (GET) — Path: `messages/conversations`
2. **Auth check**
3. **Airtable: Search Records**
   - Table: `07-Messages`
   - Sort: `Created` descending
   - Return All: true
4. **Code node** — Group by contact, get latest message per person:
   ```javascript
   const byContact = {};
   for (const item of items) {
     const f = item.json.fields;
     const contactId = f.Person?.[0];
     if (!contactId) continue;
     if (!byContact[contactId] || new Date(f.Created) > new Date(byContact[contactId].date)) {
       byContact[contactId] = {
         id: contactId,
         contactId: contactId,
         name: f['Contact Name'] || 'Unknown',
         phone: f.Phone || '',
         lastMessage: f.Body || '',
         date: f.Created || '',
         unread: 0,
       };
     }
   }
   return Object.values(byContact).map(c => ({ json: c }));
   ```
5. **Respond to Webhook**

---

## Dashboard Stats (`/dashboard/stats` — GET)

1. **Webhook** (GET) — Path: `dashboard/stats`
2. **Auth check**
3. **Parallel Airtable queries** (use a Split In Batches or multiple branches):
   - Count calls today: `06-Calls` where `Date = TODAY()`
   - Count texts today: `07-Messages` where `Created = TODAY()`
   - Count new leads: `01-People` where `Stage = 'New'`
   - Count overdue tasks: `09-Tasks` where `Due Date < TODAY() AND Status != 'Done'`
4. **Code node** — Aggregate counts
5. **Respond to Webhook**

---

## CORS Headers

Every Respond to Webhook node should include these headers for the app to work:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

In n8n, you can set these in the Webhook node under "Options → Response Headers", or in the Respond to Webhook node.

---

## n8n Tips

1. **Webhook paths don't need the full URL.** Just enter `auth`, `contacts`, etc. n8n auto-generates the full URL at `https://erfank.app.n8n.cloud/webhook/auth`.

2. **For path parameters** like `/contacts/:id`, n8n provides the value in `{{ $json.params.id }}`.

3. **For query parameters** like `/contacts/search?q=john`, access via `{{ $json.query.q }}`.

4. **Request body** is at `{{ $json.body }}` (for POST/PUT).

5. **Airtable linked records** are arrays of record IDs. To set a linked field, pass `["recXXXXXX"]`.

6. **Test each workflow** as you build it using the curl commands above. Verify the response format matches what the app expects.

7. **Activate workflows** when done testing. Inactive workflows don't respond to webhooks.

---

## Build Order (priority)

1. W15: Auth — needed to test everything else
2. W16: Contacts GET — needed for the app to show data
3. W16: Contacts POST — needed for Add Contact modal
4. W21: Tasks GET — needed for Today view
5. W18: Messages GET — needed for conversations
6. W19: Messages Send — needed for SMS
7. W20: Calls GET — needed for call history
8. Dashboard Stats — nice to have

Once these 7 workflows are live, the app is functional end-to-end.
