# n8n Workflow Build Guide — Weeks 2-4: Content Factory, Follow-Up Engine, Power Dialer

Step-by-step instructions for building each workflow in the n8n editor.
Continues from the Week 1 guide (W15-W21). Build in order within each week.

**Base URL:** `https://erfank.app.n8n.cloud`
**Airtable Base ID:** `appmxWdYfVSSHszgE`
**Twilio Number:** `+16029057670`
**Personal Cell:** `+12027487308`

---

## New Environment Variables

Add these in **Settings -> Environment Variables** before starting Week 2:

| Variable | Value | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | (your Anthropic API key) | Claude API for content generation, call analysis, trade estimates |
| `OPENAI_API_KEY` | (your OpenAI API key) | Whisper API for call transcription |

These join the existing variables from Week 1: `FCG_AUTH_TOKEN`, `FCG_PIN`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE`, `PERSONAL_CELL`.

---

## New Airtable Tables

Create these tables in your Airtable base before building workflows:

### 11-Inventory

| Field | Type | Notes |
|-------|------|-------|
| VIN | Single line text | Primary identifier |
| Year | Single line text | From NHTSA decode |
| Make | Single line text | From NHTSA decode |
| Model | Single line text | From NHTSA decode |
| Trim | Single line text | From NHTSA decode |
| Engine | Single line text | From NHTSA decode |
| Drivetrain | Single line text | From NHTSA decode (AWD, FWD, RWD, 4WD) |
| Body Type | Single line text | From NHTSA decode (SUV, Sedan, Truck, etc.) |
| Fuel Type | Single line text | From NHTSA decode (Gasoline, Hybrid, Electric) |
| Color | Single line text | Manual entry |
| Price | Currency | Manual entry |
| Status | Single select | Options: Available, Pending, Sold, Hold |
| Photos | Attachment | Vehicle photos |
| QR Code | Attachment | Generated QR code image |
| Date Added | Date | Auto-set on creation |
| Page URL | URL | Link to vehicle detail page |

### 12-Templates

| Field | Type | Notes |
|-------|------|-------|
| Name | Single line text | Template identifier |
| Body | Long text | Template text with {variables} |
| Channel | Single select | Options: SMS, Email |
| Cadence Step | Number | Which cadence position uses this template |
| Variables | Single line text | Comma-separated list of available variables |

### Content Queue

| Field | Type | Notes |
|-------|------|-------|
| Platform | Single select | Options: Instagram, Facebook, YouTube, TikTok |
| Caption | Long text | Generated content |
| Status | Single select | Options: Draft, Scheduled, Posted |
| Inventory | Link to 11-Inventory | Which vehicle this content is for |
| Scheduled Date | Date | When to post |
| Posted Date | Date | When actually posted |

### Updates to 01-People

Add these fields to the existing `01-People` table if they do not already exist:

| Field | Type | Notes |
|-------|------|-------|
| Cadence Position | Number | Current step in follow-up cadence (starts at 0) |
| Next Follow-Up | Date (include time) | When the next automated action should fire |
| Last Auto Touch | Date (include time) | When the system last reached out |
| Opted Out | Checkbox | If true, cadence runner skips this contact |
| System Sourced | Checkbox | True if contact was created by automation (not manual) |
| Assigned To | Single line text | Salesperson name (default: "Erfan") |
| Temperature | Single select | Options: Hot, Warm, Cold, Unknown |
| Stage | Single select | Options: New, Contacted, Engaged, Appointment, Visited, Negotiating, Sold, Lost |

---

## Auth Middleware Pattern (Reminder)

Every authenticated workflow starts with:

1. **Webhook** (GET or POST as specified)
2. **IF** -- Check Bearer Token
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`
3. **FALSE -> Respond to Webhook** with 401:
   ```json
   { "error": "Unauthorized" }
   ```
4. **TRUE -> (your workflow logic)**

Workflows marked **NO auth** skip steps 2-3 and go straight to logic.

---

# WEEK 2: Content Factory + Lead Capture

---

## W1: VIN Decode + Inventory Creation (`/vin/process` -- POST)

**Purpose:** Decode a VIN using the NHTSA API, extract vehicle details, create an inventory record.

### Nodes

1. **Webhook** (POST)
   - Path: `vin/process`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **HTTP Request** -- Call NHTSA vPIC API
   - Method: GET
   - URL: `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{{ $json.body.vin }}?format=json`
   - Response Format: JSON

5. **Code** -- Parse NHTSA Response
   ```javascript
   const results = items[0].json.Results;
   const vin = $('Webhook').first().json.body.vin;
   const photos = $('Webhook').first().json.body.photos || [];

   // Helper: find value by VariableId or Variable name
   function getVal(variableName) {
     const match = results.find(r => r.Variable === variableName);
     return match && match.Value && match.Value.trim() !== '' ? match.Value.trim() : '';
   }

   const decoded = {
     vin: vin,
     year: getVal('Model Year'),
     make: getVal('Make'),
     model: getVal('Model'),
     trim: getVal('Trim'),
     engine: [
       getVal('Engine Number of Cylinders') ? getVal('Engine Number of Cylinders') + '-cyl' : '',
       getVal('Displacement (L)') ? getVal('Displacement (L)') + 'L' : '',
       getVal('Engine Model'),
     ].filter(Boolean).join(' '),
     drivetrain: getVal('Drive Type'),
     bodyType: getVal('Body Class'),
     fuelType: getVal('Fuel Type - Primary'),
     photos: photos,
   };

   return [{ json: decoded }];
   ```

6. **Airtable** -- Create Record
   - Resource: Record
   - Operation: Create
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `11-Inventory`
   - Fields:
     - VIN: `{{ $json.vin }}`
     - Year: `{{ $json.year }}`
     - Make: `{{ $json.make }}`
     - Model: `{{ $json.model }}`
     - Trim: `{{ $json.trim }}`
     - Engine: `{{ $json.engine }}`
     - Drivetrain: `{{ $json.drivetrain }}`
     - Body Type: `{{ $json.bodyType }}`
     - Fuel Type: `{{ $json.fuelType }}`
     - Status: `Available`
     - Date Added: `{{ new Date().toISOString().split('T')[0] }}`
     - Photos: (if photos array is provided, map to attachment format `[{ url: "..." }]`)

   For the Photos attachment field, use an expression:
   ```
   {{ $json.photos.map(url => ({ url })) }}
   ```

7. **Code** -- Format Response
   ```javascript
   const record = items[0].json;
   return [{
     json: {
       success: true,
       inventory: {
         id: record.id,
         vin: record.fields.VIN,
         year: record.fields.Year,
         make: record.fields.Make,
         model: record.fields.Model,
         trim: record.fields.Trim,
         engine: record.fields.Engine,
         status: record.fields.Status,
         dateAdded: record.fields['Date Added'],
       }
     }
   }];
   ```

8. **Respond to Webhook**
   - Response Code: 200
   - Response Body: `{{ $json }}`

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/vin/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"5TFBY5F18KX839462","photos":["https://example.com/photo1.jpg"]}'
```

---

## W2: AI Social Content Generation (`/content/generate` -- POST)

**Purpose:** Generate Instagram, Facebook, and YouTube content for a vehicle using Claude.

### Nodes

1. **Webhook** (POST)
   - Path: `content/generate`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Get Inventory Record
   - Resource: Record
   - Operation: Get
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `11-Inventory`
   - Record ID: `{{ $json.body.inventoryId }}`

5. **Code** -- Build Claude Prompt
   ```javascript
   const f = items[0].json.fields;
   const vehicle = `${f.Year} ${f.Make} ${f.Model} ${f.Trim || ''}`.trim();
   const specs = [
     f.Engine ? `Engine: ${f.Engine}` : '',
     f.Drivetrain ? `Drivetrain: ${f.Drivetrain}` : '',
     f['Fuel Type'] ? `Fuel: ${f['Fuel Type']}` : '',
     f['Body Type'] ? `Body: ${f['Body Type']}` : '',
     f.Color ? `Color: ${f.Color}` : '',
     f.Price ? `Price: $${f.Price}` : '',
   ].filter(Boolean).join(', ');

   return [{
     json: {
       vehicle,
       specs,
       inventoryId: items[0].json.id,
       prompt: `Generate social media content for this vehicle: ${vehicle}. Specs: ${specs}.

Return a JSON object with these three keys:
1. "instagram" - A punchy Instagram caption (max 200 chars), include 5 relevant hashtags
2. "facebook" - A Facebook Marketplace listing description (3-4 sentences, highlight key features, mention Camelback Toyota Phoenix AZ)
3. "youtube" - A 30-second YouTube Shorts script (casual, walking around the car, pointing out features)

Return ONLY valid JSON, no markdown.`
     }
   }];
   ```

6. **HTTP Request** -- Claude API
   - Method: POST
   - URL: `https://api.anthropic.com/v1/messages`
   - Headers:
     - `x-api-key`: `{{ $env.ANTHROPIC_API_KEY }}`
     - `anthropic-version`: `2023-06-01`
     - `Content-Type`: `application/json`
   - Body (JSON):
   ```json
   {
     "model": "claude-sonnet-4-5-20250929",
     "max_tokens": 1024,
     "system": "You write short, punchy social media posts for a car salesperson at Camelback Toyota in Phoenix, AZ. Casual, confident, never salesy. Include relevant specs. End with CTA. Always return valid JSON only.",
     "messages": [
       {
         "role": "user",
         "content": "{{ $json.prompt }}"
       }
     ]
   }
   ```

7. **Code** -- Parse Claude Response + Prepare Airtable Records
   ```javascript
   const response = items[0].json;
   const text = response.content[0].text;
   const inventoryId = $('Code').first().json.inventoryId;

   // Parse JSON from Claude's response
   let content;
   try {
     content = JSON.parse(text);
   } catch (e) {
     // Try to extract JSON if wrapped in markdown
     const match = text.match(/\{[\s\S]*\}/);
     content = match ? JSON.parse(match[0]) : { instagram: text, facebook: text, youtube: text };
   }

   return [
     {
       json: {
         platform: 'Instagram',
         caption: content.instagram,
         inventoryId: inventoryId,
       }
     },
     {
       json: {
         platform: 'Facebook',
         caption: content.facebook,
         inventoryId: inventoryId,
       }
     },
     {
       json: {
         platform: 'YouTube',
         caption: content.youtube,
         inventoryId: inventoryId,
       }
     }
   ];
   ```

8. **Loop Over Items** -- For each content piece, create Airtable record

9. **Airtable** -- Create Record (inside loop)
   - Resource: Record
   - Operation: Create
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `Content Queue`
   - Fields:
     - Platform: `{{ $json.platform }}`
     - Caption: `{{ $json.caption }}`
     - Status: `Draft`
     - Inventory: `["{{ $json.inventoryId }}"]`

10. **Code** -- Aggregate Results After Loop
    ```javascript
    const results = items.map(item => ({
      platform: item.json.fields?.Platform || item.json.platform,
      caption: item.json.fields?.Caption || item.json.caption,
      status: 'Draft',
    }));

    return [{
      json: {
        success: true,
        content: results,
      }
    }];
    ```

11. **Respond to Webhook**
    - Response Code: 200
    - Response Body: `{{ $json }}`

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/content/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inventoryId":"recXXXXXXXXXXXXXX"}'
```

Replace `recXXXXXXXXXXXXXX` with an actual inventory record ID from Airtable.

---

## W3: Vehicle Page Generate -- SKIPPED

Using URL-parameter based template instead. No workflow needed.

---

## W4: QR Code Generation (`/qr/generate` -- POST)

**Purpose:** Generate a QR code for a URL and attach it to an inventory record.

### Nodes

1. **Webhook** (POST)
   - Path: `qr/generate`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Code** -- Build QR URL
   ```javascript
   const url = $('Webhook').first().json.body.url;
   const inventoryId = $('Webhook').first().json.body.inventoryId;
   const encodedUrl = encodeURIComponent(url);
   const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodedUrl}`;

   return [{
     json: {
       qrUrl,
       inventoryId,
       originalUrl: url,
     }
   }];
   ```

5. **HTTP Request** -- Download QR Image
   - Method: GET
   - URL: `{{ $json.qrUrl }}`
   - Response Format: File (Binary)
   - Put Output in Field: `qrImage`

6. **Airtable** -- Update Inventory Record
   - Resource: Record
   - Operation: Update
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `11-Inventory`
   - Record ID: `{{ $('Code').first().json.inventoryId }}`
   - Fields:
     - QR Code: `[{ "url": "{{ $('Code').first().json.qrUrl }}" }]`
     - Page URL: `{{ $('Code').first().json.originalUrl }}`

   Note: For the QR Code attachment, Airtable accepts an array of objects with `url` keys. Since the QR API returns a direct image URL, use:
   ```
   [{ "url": "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=YOUR_ENCODED_URL" }]
   ```

7. **Respond to Webhook**
   - Response Code: 200
   - Response Body:
   ```json
   {
     "success": true,
     "qrUrl": "{{ $('Code').first().json.qrUrl }}",
     "inventoryId": "{{ $('Code').first().json.inventoryId }}"
   }
   ```

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/qr/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://friendlycarguy.com/vehicle?id=recXXXXXX","inventoryId":"recXXXXXX"}'
```

---

## W5: Inbound SMS Handler (`/twilio/sms` -- POST, NO Auth)

**Purpose:** Handle ALL inbound SMS from Twilio. Auto-create contacts, log messages, send auto-reply to new contacts. This is the most important lead capture workflow.

### Important Setup

Before building this workflow, configure Twilio:
1. Go to **Twilio Console** -> **Phone Numbers** -> **+16029057670**
2. Under **Messaging** -> **A message comes in**
3. Set Webhook URL: `https://erfank.app.n8n.cloud/webhook/twilio/sms`
4. Set HTTP Method: POST

### Nodes

1. **Webhook** (POST)
   - Path: `twilio/sms`
   - HTTP Method: POST
   - Response Mode: "Last Node"
   - **No auth check** -- Twilio cannot send bearer tokens
   - Note: Twilio sends form-encoded data, not JSON. The fields arrive as `$json.body.From`, `$json.body.Body`, `$json.body.To`, `$json.body.MessageSid`

2. **Code** -- Extract and Clean Phone Number
   ```javascript
   const from = $('Webhook').first().json.body.From || '';
   const body = $('Webhook').first().json.body.Body || '';
   const messageSid = $('Webhook').first().json.body.MessageSid || '';

   // Clean phone: ensure +1XXXXXXXXXX format
   let phone = from.replace(/[^\d+]/g, '');
   if (!phone.startsWith('+')) {
     phone = '+' + phone;
   }
   if (phone.length === 11 && phone.startsWith('+1')) {
     // Already correct
   } else if (phone.length === 10) {
     phone = '+1' + phone;
   }

   return [{
     json: {
       phone,
       body,
       messageSid,
       rawFrom: from,
     }
   }];
   ```

3. **Airtable** -- Search for Existing Contact
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Formula: `{Phone} = '{{ $json.phone }}'`
   - Return All: false (limit 1)

4. **IF** -- Contact Found?
   - Condition: `{{ $json.id }}` is not empty
   - (Check if the Airtable search returned any results. In n8n, if no records match, the items array is empty.)
   - Alternative check: Use `{{ $input.all().length > 0 }}` equals `true`

### TRUE Branch (Existing Contact)

5a. **Airtable** -- Log Inbound Message
   - Resource: Record
   - Operation: Create
   - Table: `07-Messages`
   - Fields:
     - Body: `{{ $('Code').first().json.body }}`
     - Direction: `Inbound`
     - Person: `["{{ $('Airtable').first().json.id }}"]`
     - Twilio SID: `{{ $('Code').first().json.messageSid }}`

6a. **Airtable** -- Update Contact lastContactDate
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $('Airtable').first().json.id }}`
   - Fields:
     - Last Contact Date: `{{ new Date().toISOString() }}`

7a. **Respond to Webhook** -- Empty TwiML
   - Response Code: 200
   - Response Content Type: `text/xml`
   - Response Body:
   ```
   <?xml version="1.0" encoding="UTF-8"?><Response></Response>
   ```

### FALSE Branch (New Contact)

5b. **Airtable** -- Create New Contact
   - Resource: Record
   - Operation: Create
   - Table: `01-People`
   - Fields:
     - Name: `Unknown`
     - Phone: `{{ $('Code').first().json.phone }}`
     - Source: `SMS`
     - Stage: `New`
     - Temperature: `Unknown`
     - System Sourced: `true`
     - Cadence Position: `0`
     - Last Contact Date: `{{ new Date().toISOString() }}`

6b. **Airtable** -- Log Inbound Message
   - Resource: Record
   - Operation: Create
   - Table: `07-Messages`
   - Fields:
     - Body: `{{ $('Code').first().json.body }}`
     - Direction: `Inbound`
     - Person: `["{{ $json.id }}"]` (uses the ID from the newly created contact)
     - Twilio SID: `{{ $('Code').first().json.messageSid }}`

7b. **HTTP Request** -- Send Auto-Reply via Twilio
   - Method: POST
   - URL: `https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json`
   - Authentication: Basic Auth
     - Username: `{{ $env.TWILIO_ACCOUNT_SID }}`
     - Password: `{{ $env.TWILIO_AUTH_TOKEN }}`
   - Content Type: `application/x-www-form-urlencoded`
   - Body Parameters:
     - From: `{{ $env.TWILIO_PHONE }}`
     - To: `{{ $('Code').first().json.phone }}`
     - Body: `Hey! Thanks for reaching out. This is Erfan at Camelback Toyota. I'll get back to you shortly!`

8b. **Airtable** -- Log Auto-Reply Message
   - Resource: Record
   - Operation: Create
   - Table: `07-Messages`
   - Fields:
     - Body: `Hey! Thanks for reaching out. This is Erfan at Camelback Toyota. I'll get back to you shortly!`
     - Direction: `Outbound`
     - Person: `["{{ $('Airtable2').first().json.id }}"]` (link to the newly created contact; adjust node reference name as needed)

9b. **Respond to Webhook** -- Empty TwiML
   - Response Code: 200
   - Response Content Type: `text/xml`
   - Response Body:
   ```
   <?xml version="1.0" encoding="UTF-8"?><Response></Response>
   ```

### Why Empty TwiML?

Twilio expects a TwiML response. We return an empty `<Response></Response>` because we handle our own replies via the Twilio REST API. If you put message text in the TwiML, Twilio would send a SECOND reply on top of yours.

### Test
```bash
# Simulate Twilio sending an inbound SMS (form-encoded)
curl -X POST https://erfank.app.n8n.cloud/webhook/twilio/sms \
  -d "From=%2B16025551234&Body=Hey%20I%20saw%20your%20Tundra%20for%20sale&To=%2B16029057670&MessageSid=SMtest123"
```

---

## W6: Trade-In Form Handler (`/form/trade-in` -- POST, NO Auth)

**Purpose:** Handle trade-in form submissions. Estimate value with Claude, send SMS, create follow-up task.

### Nodes

1. **Webhook** (POST)
   - Path: `form/trade-in`
   - HTTP Method: POST
   - Response Mode: "Last Node"
   - **No auth** -- public-facing form

2. **Code** -- Extract and Validate Input
   ```javascript
   const b = $('Webhook').first().json.body;
   const fields = {
     year: b.year || '',
     make: b.make || '',
     model: b.model || '',
     mileage: b.mileage || '',
     condition: b.condition || 'Good',
     name: b.name || 'Unknown',
     phone: (b.phone || '').replace(/[^\d+]/g, ''),
     email: b.email || '',
   };

   // Ensure phone format
   if (fields.phone && !fields.phone.startsWith('+')) {
     fields.phone = '+1' + fields.phone.replace(/^1/, '');
   }

   if (!fields.year || !fields.make || !fields.model) {
     throw new Error('Missing required fields: year, make, model');
   }

   return [{ json: fields }];
   ```

3. **Airtable** -- Search for Existing Contact
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Formula: `{Phone} = '{{ $json.phone }}'`

4. **IF** -- Contact Exists?
   - Condition: `{{ $input.all().length > 0 }}` equals `true`

### TRUE Branch (Contact Exists)

5a. **Airtable** -- Update Existing Contact
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $json.id }}`
   - Fields:
     - Vehicle Interest: `{{ $('Code').first().json.year }} {{ $('Code').first().json.make }} {{ $('Code').first().json.model }}`
     - Source: `Trade Tool`
     - Name: `{{ $('Code').first().json.name }}` (only if current name is "Unknown")

5a-merge. **Set** node -- Store contact ID for downstream use
   - contactId: `{{ $json.id }}`

### FALSE Branch (New Contact)

5b. **Airtable** -- Create New Contact
   - Resource: Record
   - Operation: Create
   - Table: `01-People`
   - Fields:
     - Name: `{{ $('Code').first().json.name }}`
     - Phone: `{{ $('Code').first().json.phone }}`
     - Email: `{{ $('Code').first().json.email }}`
     - Source: `Trade Tool`
     - Stage: `New`
     - Temperature: `Warm`
     - Vehicle Interest: `{{ $('Code').first().json.year }} {{ $('Code').first().json.make }} {{ $('Code').first().json.model }}`
     - System Sourced: `true`

5b-merge. **Set** node -- Store contact ID for downstream use
   - contactId: `{{ $json.id }}`

### Merge Branch (continues for both paths)

6. **Merge** -- Merge the two branches back together

7. **HTTP Request** -- Claude API for Trade Estimate
   - Method: POST
   - URL: `https://api.anthropic.com/v1/messages`
   - Headers:
     - `x-api-key`: `{{ $env.ANTHROPIC_API_KEY }}`
     - `anthropic-version`: `2023-06-01`
     - `Content-Type`: `application/json`
   - Body (JSON):
   ```json
   {
     "model": "claude-sonnet-4-5-20250929",
     "max_tokens": 256,
     "system": "You estimate used car trade-in values for a Toyota dealership in Phoenix, AZ. Give a realistic low-high range based on year, make, model, mileage, and condition. Return ONLY valid JSON: {\"low\": number, \"high\": number}. No other text.",
     "messages": [
       {
         "role": "user",
         "content": "Estimate trade-in value for: {{ $('Code').first().json.year }} {{ $('Code').first().json.make }} {{ $('Code').first().json.model }}, {{ $('Code').first().json.mileage }} miles, condition: {{ $('Code').first().json.condition }}"
       }
     ]
   }
   ```

8. **Code** -- Parse Trade Estimate
   ```javascript
   const response = items[0].json;
   const text = response.content[0].text;
   let estimate;
   try {
     estimate = JSON.parse(text);
   } catch (e) {
     const match = text.match(/\{[\s\S]*\}/);
     estimate = match ? JSON.parse(match[0]) : { low: 0, high: 0 };
   }

   const inputData = $('Code').first().json;
   const contactId = $('Merge').first().json.contactId || $('Merge').first().json.id;

   return [{
     json: {
       low: estimate.low,
       high: estimate.high,
       contactId,
       name: inputData.name,
       phone: inputData.phone,
       year: inputData.year,
       make: inputData.make,
       model: inputData.model,
     }
   }];
   ```

9. **HTTP Request** -- Send SMS via Twilio
   - Method: POST
   - URL: `https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json`
   - Authentication: Basic Auth
     - Username: `{{ $env.TWILIO_ACCOUNT_SID }}`
     - Password: `{{ $env.TWILIO_AUTH_TOKEN }}`
   - Content Type: `application/x-www-form-urlencoded`
   - Body Parameters:
     - From: `{{ $env.TWILIO_PHONE }}`
     - To: `{{ $json.phone }}`
     - Body: `Hey {{ $json.name }}! Based on what you told me about your {{ $json.year }} {{ $json.model }}, I'd estimate your trade is worth ${{ $json.low.toLocaleString() }}-${{ $json.high.toLocaleString() }}. Want to get an exact number? I can appraise it in person - takes 10 min. Text me back to set up a time! - Erfan`

10. **Airtable** -- Log Outbound Message
    - Resource: Record
    - Operation: Create
    - Table: `07-Messages`
    - Fields:
      - Body: (same text as SMS above)
      - Direction: `Outbound`
      - Person: `["{{ $json.contactId }}"]`

11. **Airtable** -- Create Follow-Up Task
    - Resource: Record
    - Operation: Create
    - Table: `09-Tasks`
    - Fields:
      - Title: `Call {{ $json.name }} about trade-in appraisal`
      - Due Date: `{{ new Date().toISOString().split('T')[0] }}`
      - Status: `Pending`
      - Person: `["{{ $json.contactId }}"]`

12. **Respond to Webhook**
    - Response Code: 200
    - Response Body:
    ```json
    {
      "success": true,
      "estimate": {
        "low": "{{ $('Code1').first().json.low }}",
        "high": "{{ $('Code1').first().json.high }}"
      }
    }
    ```

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/form/trade-in \
  -H "Content-Type: application/json" \
  -d '{
    "year": "2020",
    "make": "Toyota",
    "model": "Camry",
    "mileage": "45000",
    "condition": "Good",
    "name": "John",
    "phone": "6025559876",
    "email": "john@example.com"
  }'
```

---

## W7: Vehicle Inquiry Form -- SKIPPED

Handled by W5 (the inbound SMS handler). When someone texts the Twilio number from a vehicle page, W5 catches it, creates/finds the contact, and logs the message. No separate workflow needed.

---

## W8: Calendar Booking Webhook -- SKIPPED

Cal.com integration comes later. Placeholder for future build.

---

## W23: Inventory List + Create (`/inventory` -- GET/POST)

**Purpose:** List all inventory or create a new inventory record.

### GET: List Inventory

1. **Webhook** (GET)
   - Path: `inventory`
   - HTTP Method: GET
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Search Records
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `11-Inventory`
   - Return All: true
   - Sort: `Date Added` descending

5. **Code** -- Transform to App Format
   ```javascript
   return items.map(item => ({
     json: {
       id: item.json.id,
       vin: item.json.fields.VIN || '',
       year: item.json.fields.Year || '',
       make: item.json.fields.Make || '',
       model: item.json.fields.Model || '',
       trim: item.json.fields.Trim || '',
       engine: item.json.fields.Engine || '',
       color: item.json.fields.Color || '',
       price: item.json.fields.Price || '',
       status: item.json.fields.Status || 'Available',
       photos: (item.json.fields.Photos || []).map(p => p.url),
       dateAdded: item.json.fields['Date Added'] || '',
     }
   }));
   ```

6. **Respond to Webhook**
   - Response Code: 200
   - Response Body: `{{ $json }}`

### POST: Create Inventory

Create a **separate workflow** or use a **Switch** node on HTTP method.

1. **Webhook** (POST)
   - Path: `inventory`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Create Record
   - Resource: Record
   - Operation: Create
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `11-Inventory`
   - Fields:
     - VIN: `{{ $json.body.vin }}`
     - Year: `{{ $json.body.year }}`
     - Make: `{{ $json.body.make }}`
     - Model: `{{ $json.body.model }}`
     - Trim: `{{ $json.body.trim }}`
     - Engine: `{{ $json.body.engine }}`
     - Color: `{{ $json.body.color }}`
     - Price: `{{ $json.body.price }}`
     - Status: `{{ $json.body.status || 'Available' }}`
     - Date Added: `{{ new Date().toISOString().split('T')[0] }}`

5. **Code** -- Format Response
   ```javascript
   const record = items[0].json;
   return [{
     json: {
       success: true,
       inventory: {
         id: record.id,
         vin: record.fields.VIN || '',
         year: record.fields.Year || '',
         make: record.fields.Make || '',
         model: record.fields.Model || '',
         trim: record.fields.Trim || '',
         status: record.fields.Status || 'Available',
       }
     }
   }];
   ```

6. **Respond to Webhook**
   - Response Code: 200
   - Response Body: `{{ $json }}`

### Test
```bash
# List inventory
curl https://erfank.app.n8n.cloud/webhook/inventory \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create inventory manually
curl -X POST https://erfank.app.n8n.cloud/webhook/inventory \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vin":"1234567890ABCDEFG",
    "year":"2024",
    "make":"Toyota",
    "model":"Tundra",
    "trim":"TRD Pro",
    "engine":"3.4L V6 Twin Turbo",
    "color":"White",
    "price":"62000",
    "status":"Available"
  }'
```

---

# WEEK 3: Follow-Up Engine + Call Brain

---

## W9: Cadence Runner (Schedule Trigger -- Every Hour)

**Purpose:** Automatically follow up with contacts based on their cadence position. Runs every hour. No webhook -- triggered by schedule.

### Nodes

1. **Schedule Trigger**
   - Trigger Interval: Every 1 hour
   - (In n8n: Add node -> Search "Schedule Trigger" -> Set interval to "Hours" = 1)

2. **Airtable** -- Search Contacts Due for Follow-Up
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Formula: `AND({Next Follow-Up} <= NOW(), {Stage} != 'Sold', {Stage} != 'Lost', {Opted Out} != TRUE())`
   - Return All: true

3. **IF** -- Any Contacts Found?
   - Condition: `{{ $input.all().length > 0 }}` equals `true`
   - FALSE -> **No Op** (nothing to do, workflow ends)

4. **Code** -- Determine Action for Each Contact
   ```javascript
   const now = new Date();

   return items.map(item => {
     const f = item.json.fields;
     const position = parseInt(f['Cadence Position'] || '0', 10);
     const name = f.Name || 'there';
     const firstName = name.split(' ')[0];
     const vehicle = f['Vehicle Interest'] || '';
     const contactId = item.json.id;
     const phone = f.Phone || '';

     let action = 'none';
     let messageBody = '';
     let taskTitle = '';
     let daysUntilNext = 1;

     switch (position) {
       case 0:
         // Day 0: Initial text
         action = 'text';
         messageBody = `Hey ${firstName}! This is Erfan at Camelback Toyota. Thanks for your interest${vehicle ? ' in the ' + vehicle : ''}. How can I help you today?`;
         daysUntilNext = 1;
         break;
       case 1:
         // Day 1: Call task
         action = 'call';
         taskTitle = `Call ${name} - first follow-up`;
         daysUntilNext = 2;
         break;
       case 2:
         // Day 3: Check-in text
         action = 'text';
         messageBody = `Hi ${firstName}, just checking in! Any questions I can answer${vehicle ? ' about the ' + vehicle : ''}? Happy to help. - Erfan`;
         daysUntilNext = 2;
         break;
       case 3:
         // Day 5: Text with inventory link if vehicle interest known
         action = 'text';
         if (vehicle) {
           messageBody = `Hey ${firstName}! Just wanted to let you know the ${vehicle} is still available. Want me to hold it for you? I can get you in for a test drive anytime this week. - Erfan`;
         } else {
           messageBody = `Hey ${firstName}! Have you had a chance to think about what you're looking for? I've got some great options right now. - Erfan`;
         }
         daysUntilNext = 2;
         break;
       case 4:
         // Day 7: Final follow-up call
         action = 'call';
         taskTitle = `Final follow-up call for ${name}`;
         daysUntilNext = 7;
         break;
       case 5:
         // Day 14: Reactivation text
         action = 'text';
         messageBody = `Hey ${firstName}! It's Erfan from Camelback Toyota. Just wanted to check if you're still in the market. We've got some new inventory and great deals this month. Let me know! - Erfan`;
         daysUntilNext = 16;
         break;
       case 6:
         // Day 30: Long-term reactivation
         action = 'text';
         messageBody = `Hi ${firstName}, Erfan here from Camelback Toyota. If you're ever looking for a vehicle or know someone who is, I'm always here to help. Have a great week!`;
         daysUntilNext = 30;
         break;
       default:
         // Position 7+: Monthly check-in
         if (position % 2 === 1) {
           action = 'text';
           messageBody = `Hey ${firstName}! Just a quick hello from Erfan at Camelback Toyota. Hope all is well. If you ever need anything auto-related, don't hesitate to reach out!`;
           daysUntilNext = 30;
         } else {
           action = 'none';
           daysUntilNext = 30;
         }
     }

     const nextFollowUp = new Date(now.getTime() + daysUntilNext * 24 * 60 * 60 * 1000);

     return {
       json: {
         contactId,
         name,
         phone,
         position,
         action,
         messageBody,
         taskTitle,
         nextPosition: position + 1,
         nextFollowUp: nextFollowUp.toISOString(),
       }
     };
   });
   ```

5. **Switch** -- Route by Action Type
   - Field: `{{ $json.action }}`
   - Rules:
     - `text` -> Text Branch
     - `call` -> Call Branch
     - `none` -> Update Only Branch

### Text Branch

6a. **HTTP Request** -- Send SMS via Twilio
   - Method: POST
   - URL: `https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json`
   - Authentication: Basic Auth
     - Username: `{{ $env.TWILIO_ACCOUNT_SID }}`
     - Password: `{{ $env.TWILIO_AUTH_TOKEN }}`
   - Content Type: `application/x-www-form-urlencoded`
   - Body Parameters:
     - From: `{{ $env.TWILIO_PHONE }}`
     - To: `{{ $json.phone }}`
     - Body: `{{ $json.messageBody }}`

7a. **Airtable** -- Log Outbound Message
   - Resource: Record
   - Operation: Create
   - Table: `07-Messages`
   - Fields:
     - Body: `{{ $json.messageBody }}`
     - Direction: `Outbound`
     - Person: `["{{ $json.contactId }}"]`

8a. **Airtable** -- Update Contact Cadence
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $json.contactId }}`
   - Fields:
     - Cadence Position: `{{ $json.nextPosition }}`
     - Next Follow-Up: `{{ $json.nextFollowUp }}`
     - Last Auto Touch: `{{ new Date().toISOString() }}`
     - Stage: (if currently "New", update to "Contacted")

### Call Branch

6b. **Airtable** -- Create Call Task
   - Resource: Record
   - Operation: Create
   - Table: `09-Tasks`
   - Fields:
     - Title: `{{ $json.taskTitle }}`
     - Due Date: `{{ new Date().toISOString().split('T')[0] }}`
     - Status: `Pending`
     - Person: `["{{ $json.contactId }}"]`

7b. **Airtable** -- Update Contact Cadence
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $json.contactId }}`
   - Fields:
     - Cadence Position: `{{ $json.nextPosition }}`
     - Next Follow-Up: `{{ $json.nextFollowUp }}`
     - Last Auto Touch: `{{ new Date().toISOString() }}`

### Update Only Branch (action = "none")

6c. **Airtable** -- Update Contact Cadence
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $json.contactId }}`
   - Fields:
     - Cadence Position: `{{ $json.nextPosition }}`
     - Next Follow-Up: `{{ $json.nextFollowUp }}`

### No Test Command

This workflow has no webhook. To test:
1. Manually set a contact's `Next Follow-Up` to a past date and ensure `Opted Out` is not checked
2. Click "Execute Workflow" in the n8n editor
3. Check that the contact received a text or a task was created
4. Verify the cadence position incremented

---

## W10: Morning Briefing (Schedule Trigger -- Daily 7:00 AM MST)

**Purpose:** Send a morning summary SMS with overdue tasks, today's tasks, hot leads, and new leads.

### Nodes

1. **Schedule Trigger**
   - Trigger Interval: Every day
   - Hour: 7
   - Minute: 0
   - Timezone: `America/Phoenix` (MST, no daylight saving)

2. **Airtable** -- Overdue Tasks
   - Resource: Record
   - Operation: Search
   - Table: `09-Tasks`
   - Formula: `AND({Due Date} < TODAY(), {Status} != 'Done')`
   - Return All: true

3. **Airtable** -- Tasks Due Today
   - Resource: Record
   - Operation: Search
   - Table: `09-Tasks`
   - Formula: `AND({Due Date} = TODAY(), {Status} != 'Done')`
   - Return All: true

4. **Airtable** -- Hot Leads
   - Resource: Record
   - Operation: Search
   - Table: `01-People`
   - Formula: `{Temperature} = 'Hot'`
   - Return All: true

5. **Airtable** -- New Leads from Yesterday
   - Resource: Record
   - Operation: Search
   - Table: `01-People`
   - Formula: `AND({Stage} = 'New', CREATED_TIME() >= DATEADD(TODAY(), -1, 'day'))`
   - Return All: true

6. **Code** -- Format Briefing Text
   ```javascript
   const overdue = $('Airtable').all();
   const today = $('Airtable1').all();
   const hot = $('Airtable2').all();
   const newLeads = $('Airtable3').all();

   let msg = `Good morning! Here's your day:\n\n`;

   // Overdue tasks
   msg += `OVERDUE (${overdue.length} tasks)\n`;
   if (overdue.length === 0) {
     msg += `- None! You're caught up.\n`;
   } else {
     overdue.slice(0, 5).forEach(t => {
       msg += `- ${t.json.fields.Title || t.json.fields.Name || 'Untitled'}\n`;
     });
     if (overdue.length > 5) msg += `- ...and ${overdue.length - 5} more\n`;
   }

   msg += `\n`;

   // Today's tasks
   msg += `TODAY (${today.length} tasks)\n`;
   if (today.length === 0) {
     msg += `- Nothing scheduled yet.\n`;
   } else {
     today.slice(0, 5).forEach(t => {
       msg += `- ${t.json.fields.Title || t.json.fields.Name || 'Untitled'}\n`;
     });
     if (today.length > 5) msg += `- ...and ${today.length - 5} more\n`;
   }

   msg += `\n`;

   // Hot leads
   msg += `HOT LEADS (${hot.length})\n`;
   if (hot.length === 0) {
     msg += `- None right now.\n`;
   } else {
     hot.slice(0, 5).forEach(p => {
       const vi = p.json.fields['Vehicle Interest'] || '';
       msg += `- ${p.json.fields.Name || 'Unknown'}${vi ? ' - ' + vi : ''}\n`;
     });
     if (hot.length > 5) msg += `- ...and ${hot.length - 5} more\n`;
   }

   msg += `\n`;

   // New leads
   msg += `NEW LEADS (${newLeads.length})\n`;
   if (newLeads.length === 0) {
     msg += `- No new leads overnight.\n`;
   } else {
     msg += `- ${newLeads.length} new lead${newLeads.length > 1 ? 's' : ''} overnight\n`;
     newLeads.slice(0, 3).forEach(p => {
       msg += `  - ${p.json.fields.Name || 'Unknown'} (${p.json.fields.Source || 'Unknown source'})\n`;
     });
   }

   msg += `\nLet's get it!`;

   return [{ json: { briefing: msg } }];
   ```

   Note on node references: In n8n, when you have multiple Airtable nodes, they get auto-named `Airtable`, `Airtable1`, `Airtable2`, `Airtable3`. Rename them for clarity (e.g., "Overdue Tasks", "Today Tasks", "Hot Leads", "New Leads") and update the `$()` references accordingly. The pattern is `$('Node Name').all()`.

7. **HTTP Request** -- Send Briefing SMS via Twilio
   - Method: POST
   - URL: `https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json`
   - Authentication: Basic Auth
     - Username: `{{ $env.TWILIO_ACCOUNT_SID }}`
     - Password: `{{ $env.TWILIO_AUTH_TOKEN }}`
   - Content Type: `application/x-www-form-urlencoded`
   - Body Parameters:
     - From: `{{ $env.TWILIO_PHONE }}`
     - To: `{{ $env.PERSONAL_CELL }}`
     - Body: `{{ $json.briefing }}`

### No Test Command

This is a scheduled workflow. To test:
1. Click "Execute Workflow" manually in the n8n editor
2. Check your phone for the briefing SMS at +12027487308
3. Verify counts match your Airtable data

### Node Naming Tip

Rename the four Airtable nodes to descriptive names:
- `Overdue Tasks`
- `Today Tasks`
- `Hot Leads`
- `New Leads`

Then update the Code node references:
```javascript
const overdue = $('Overdue Tasks').all();
const today = $('Today Tasks').all();
const hot = $('Hot Leads').all();
const newLeads = $('New Leads').all();
```

---

## W11: Post-Call Processor (`/call/process` -- POST, NO Auth)

**Purpose:** When a call ends, Twilio sends a callback. This workflow downloads the recording, transcribes it with Whisper, extracts insights with Claude, and updates Airtable.

### Twilio Setup

Configure the status callback URL on your Twilio number:
1. **Twilio Console** -> **Phone Numbers** -> **+16029057670**
2. Under **Voice** -> **A call comes in** -> ensure call handling is configured
3. For recording callbacks, set the recording status callback URL in your TwiML or Twilio Studio flow to: `https://erfank.app.n8n.cloud/webhook/call/process`

Alternatively, if using the Twilio REST API to initiate calls, pass `RecordingStatusCallback=https://erfank.app.n8n.cloud/webhook/call/process` when creating the call.

### Nodes

1. **Webhook** (POST)
   - Path: `call/process`
   - HTTP Method: POST
   - Response Mode: "Respond Immediately"
   - Response Code: 200
   - (Respond immediately so Twilio doesn't timeout. Process asynchronously.)
   - **No auth** -- this is a Twilio callback

2. **Code** -- Extract Call Data
   ```javascript
   const b = $('Webhook').first().json.body;
   return [{
     json: {
       callSid: b.CallSid || '',
       recordingUrl: b.RecordingUrl || '',
       recordingSid: b.RecordingSid || '',
       duration: parseInt(b.CallDuration || b.RecordingDuration || '0', 10),
       from: b.From || '',
       to: b.To || '',
       callStatus: b.CallStatus || '',
       recordingStatus: b.RecordingStatus || '',
     }
   }];
   ```

3. **IF** -- Has Recording and Long Enough?
   - Condition (AND):
     - `{{ $json.duration }}` is greater than `30`
     - `{{ $json.recordingUrl }}` is not empty

### TRUE Branch (Recording exists, call > 30 seconds)

4a. **Wait** -- Let Recording Finalize
   - Wait For: 30 seconds
   - (Twilio needs time to process the recording)

5a. **HTTP Request** -- Download Recording from Twilio
   - Method: GET
   - URL: `{{ $('Code').first().json.recordingUrl }}.mp3`
   - Authentication: Basic Auth
     - Username: `{{ $env.TWILIO_ACCOUNT_SID }}`
     - Password: `{{ $env.TWILIO_AUTH_TOKEN }}`
   - Response Format: File (Binary)
   - Put Output in Field: `audioFile`

6a. **HTTP Request** -- Whisper Transcription
   - Method: POST
   - URL: `https://api.openai.com/v1/audio/transcriptions`
   - Headers:
     - `Authorization`: `Bearer {{ $env.OPENAI_API_KEY }}`
   - Content Type: `multipart/form-data`
   - Body Parameters:
     - `file`: (binary data from previous node -- use the `audioFile` binary field)
     - `model`: `whisper-1`
   - In n8n: Set "Send Binary Data" to ON, Binary Property = `audioFile`, and add `model` as an additional form field

7a. **Code** -- Prepare Claude Analysis Input
   ```javascript
   const transcript = items[0].json.text || '';
   const callData = $('Code').first().json;

   return [{
     json: {
       transcript,
       callSid: callData.callSid,
       from: callData.from,
       to: callData.to,
       duration: callData.duration,
     }
   }];
   ```

8a. **HTTP Request** -- Claude API for Call Analysis
   - Method: POST
   - URL: `https://api.anthropic.com/v1/messages`
   - Headers:
     - `x-api-key`: `{{ $env.ANTHROPIC_API_KEY }}`
     - `anthropic-version`: `2023-06-01`
     - `Content-Type`: `application/json`
   - Body (JSON):
   ```json
   {
     "model": "claude-sonnet-4-5-20250929",
     "max_tokens": 1024,
     "system": "You extract structured data from car sales call transcripts. Return ONLY valid JSON with these fields: summary (string, 2-3 sentences), sentiment (string: positive/neutral/negative), temperature (string: Hot/Warm/Cold), buyingSignals (array of strings), vehicleInterest (string, specific vehicle if mentioned), budget (string, budget range if mentioned), timeline (string, when they want to buy if mentioned), objections (array of strings), nextSteps (array of strings, promises made or actions needed), followUpDate (string, ISO date if a specific date was mentioned, otherwise empty).",
     "messages": [
       {
         "role": "user",
         "content": "Analyze this car sales call transcript:\n\n{{ $json.transcript }}"
       }
     ]
   }
   ```

9a. **Code** -- Parse Claude Analysis and Prepare Updates
   ```javascript
   const response = items[0].json;
   const text = response.content[0].text;
   const callData = $('Code').first().json;
   const transcript = $('Code1').first().json.transcript;

   let analysis;
   try {
     analysis = JSON.parse(text);
   } catch (e) {
     const match = text.match(/\{[\s\S]*\}/);
     analysis = match ? JSON.parse(match[0]) : {
       summary: 'Could not parse call analysis',
       sentiment: 'neutral',
       temperature: 'Unknown',
       buyingSignals: [],
       vehicleInterest: '',
       budget: '',
       timeline: '',
       objections: [],
       nextSteps: [],
       followUpDate: '',
     };
   }

   // Clean phone for contact lookup
   let phone = callData.from;
   if (phone === $env.TWILIO_PHONE || phone === $env.PERSONAL_CELL) {
     phone = callData.to; // Outbound call, customer is on the "to" side
   }

   return [{
     json: {
       phone,
       callSid: callData.callSid,
       duration: callData.duration,
       transcript,
       analysis,
     }
   }];
   ```

10a. **Airtable** -- Search for Contact by Phone
   - Resource: Record
   - Operation: Search
   - Table: `01-People`
   - Formula: `{Phone} = '{{ $json.phone }}'`

11a. **IF** -- Contact Found?
   - Condition: `{{ $input.all().length > 0 }}` equals `true`

12a. **Airtable** -- Create Call Record in 06-Calls (if contact found)
   - Resource: Record
   - Operation: Create
   - Table: `06-Calls`
   - Fields:
     - Person: `["{{ $('Airtable').first().json.id }}"]` (adjust node reference)
     - Duration: `{{ $('Code2').first().json.duration }}`
     - Summary: `{{ $('Code2').first().json.analysis.summary }}`
     - Transcript: `{{ $('Code2').first().json.transcript }}`
     - Sentiment: `{{ $('Code2').first().json.analysis.sentiment }}`
     - Twilio SID: `{{ $('Code2').first().json.callSid }}`
     - Date: `{{ new Date().toISOString() }}`
     - Direction: (determine based on whether `from` matches your Twilio number)

13a. **Airtable** -- Update Contact with Extracted Insights
   - Resource: Record
   - Operation: Update
   - Table: `01-People`
   - Record ID: `{{ $('Airtable').first().json.id }}` (the contact found in step 10a)
   - Fields (only update if analysis has values):
     - Vehicle Interest: `{{ $('Code2').first().json.analysis.vehicleInterest }}`
     - Budget: `{{ $('Code2').first().json.analysis.budget }}`
     - Timeline: `{{ $('Code2').first().json.analysis.timeline }}`
     - Temperature: `{{ $('Code2').first().json.analysis.temperature }}`
     - Last Contact Date: `{{ new Date().toISOString() }}`

14a. **Code** -- Create Tasks from Next Steps
   ```javascript
   const analysis = $('Code2').first().json.analysis;
   const contactId = $('Airtable').first().json.id;
   const contactName = $('Airtable').first().json.fields.Name || 'Contact';
   const nextSteps = analysis.nextSteps || [];

   if (nextSteps.length === 0) {
     return [{ json: { noTasks: true } }];
   }

   return nextSteps.map(step => ({
     json: {
       title: `${step} - ${contactName}`,
       contactId,
       dueDate: analysis.followUpDate || new Date(Date.now() + 86400000).toISOString().split('T')[0],
     }
   }));
   ```

15a. **IF** -- Has Tasks to Create?
   - Condition: `{{ $json.noTasks }}` does not equal `true`

16a. **Airtable** -- Create Tasks (for each item from Code node)
   - Resource: Record
   - Operation: Create
   - Table: `09-Tasks`
   - Fields:
     - Title: `{{ $json.title }}`
     - Due Date: `{{ $json.dueDate }}`
     - Status: `Pending`
     - Person: `["{{ $json.contactId }}"]`

### FALSE Branch (Short call or no recording)

4b. **Code** -- Prepare Short Call Log
   ```javascript
   const callData = $('Code').first().json;

   let phone = callData.from;
   if (phone === $env.TWILIO_PHONE || phone === $env.PERSONAL_CELL) {
     phone = callData.to;
   }

   return [{
     json: {
       phone,
       callSid: callData.callSid,
       duration: callData.duration,
       summary: callData.duration === 0 ? 'Missed call' : `Short call (${callData.duration}s)`,
     }
   }];
   ```

5b. **Airtable** -- Search for Contact
   - Table: `01-People`
   - Formula: `{Phone} = '{{ $json.phone }}'`

6b. **Airtable** -- Create Call Record (short/missed)
   - Table: `06-Calls`
   - Fields:
     - Person: `["{{ $('Airtable').first().json.id }}"]` (if found)
     - Duration: `{{ $json.duration }}`
     - Summary: `{{ $json.summary }}`
     - Twilio SID: `{{ $json.callSid }}`
     - Date: `{{ new Date().toISOString() }}`

### Test

This workflow is triggered by Twilio, not manually. To test:
1. Make a call to your Twilio number that lasts more than 30 seconds
2. Watch the n8n execution log
3. Check `06-Calls` for the new record with transcript and summary
4. Check `01-People` for updated fields

You can also simulate with curl:
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/call/process \
  -d "CallSid=CAtest123&RecordingUrl=https://api.twilio.com/recordings/REtest&CallDuration=120&From=%2B16025551234&To=%2B16029057670&CallStatus=completed&RecordingStatus=completed"
```

---

## W12: Pre-Call Briefing (`/briefing/generate` -- POST)

**Purpose:** Generate a quick briefing card before calling a contact. Pulls recent history and uses Claude to summarize what matters.

### Nodes

1. **Webhook** (POST)
   - Path: `briefing/generate`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Get Contact Record
   - Resource: Record
   - Operation: Get
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Record ID: `{{ $json.body.contactId }}`

5. **Airtable** -- Get Recent Calls
   - Resource: Record
   - Operation: Search
   - Table: `06-Calls`
   - Formula: `FIND("{{ $json.body.contactId }}", ARRAYJOIN({Person}))`
   - Sort: `Date` descending
   - Limit: 3

6. **Airtable** -- Get Recent Messages
   - Resource: Record
   - Operation: Search
   - Table: `07-Messages`
   - Formula: `FIND("{{ $json.body.contactId }}", ARRAYJOIN({Person}))`
   - Sort: `Created` descending
   - Limit: 10

7. **Airtable** -- Get Open Tasks
   - Resource: Record
   - Operation: Search
   - Table: `09-Tasks`
   - Formula: `AND(FIND("{{ $json.body.contactId }}", ARRAYJOIN({Person})), {Status} != 'Done')`

   Note: Steps 4-7 can run in parallel in n8n if you connect them all directly from the auth IF-TRUE output.

8. **Code** -- Build Context Object
   ```javascript
   // Reference nodes by their names (rename them for clarity)
   const contact = $('Get Contact').first().json;
   const calls = $('Get Recent Calls').all();
   const messages = $('Get Recent Messages').all();
   const tasks = $('Get Open Tasks').all();

   const f = contact.fields;

   const context = {
     name: f.Name || 'Unknown',
     phone: f.Phone || '',
     email: f.Email || '',
     stage: f.Stage || 'Unknown',
     temperature: f.Temperature || 'Unknown',
     vehicleInterest: f['Vehicle Interest'] || 'Not specified',
     budget: f.Budget || 'Not specified',
     timeline: f.Timeline || 'Not specified',
     source: f.Source || 'Unknown',
     notes: f.Notes || '',

     recentCalls: calls.map(c => ({
       date: c.json.fields.Date || '',
       duration: c.json.fields.Duration || 0,
       summary: c.json.fields.Summary || 'No summary',
     })),

     recentMessages: messages.map(m => ({
       date: m.json.fields.Created || '',
       direction: m.json.fields.Direction || '',
       body: (m.json.fields.Body || '').substring(0, 100),
     })),

     openTasks: tasks.map(t => ({
       title: t.json.fields.Title || t.json.fields.Name || '',
       dueDate: t.json.fields['Due Date'] || '',
     })),
   };

   return [{ json: { context: JSON.stringify(context) } }];
   ```

9. **HTTP Request** -- Claude API for Briefing
   - Method: POST
   - URL: `https://api.anthropic.com/v1/messages`
   - Headers:
     - `x-api-key`: `{{ $env.ANTHROPIC_API_KEY }}`
     - `anthropic-version`: `2023-06-01`
     - `Content-Type`: `application/json`
   - Body (JSON):
   ```json
   {
     "model": "claude-sonnet-4-5-20250929",
     "max_tokens": 512,
     "system": "Generate a concise pre-call briefing card for a car salesperson. Max 150 words. Be direct, highlight what matters NOW. Format with sections: WHO (name, stage, temperature), SITUATION (what they want, budget, timeline), LAST CONTACT (when and what happened), OPEN ITEMS (tasks, promises), APPROACH (how to handle this call).",
     "messages": [
       {
         "role": "user",
         "content": "Generate briefing for: {{ $json.context }}"
       }
     ]
   }
   ```

10. **Code** -- Format Response
    ```javascript
    const response = items[0].json;
    const briefing = response.content[0].text;

    return [{
      json: {
        success: true,
        briefing,
      }
    }];
    ```

11. **Respond to Webhook**
    - Response Code: 200
    - Response Body: `{{ $json }}`

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/briefing/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contactId":"recXXXXXXXXXXXXXX"}'
```

---

# WEEK 4: Power Dialer + Dashboard

---

## W13: Start Dialer Session (`/dialer/start` -- POST)

**Purpose:** Query contacts that need calls, return a prioritized call queue to the app. For v1, this is a simple list -- the app handles individual calls via `tel:` links. Conference bridge dialing is deferred to v2.

### Nodes

1. **Webhook** (POST)
   - Path: `dialer/start`
   - HTTP Method: POST
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Query Contacts to Dial
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `01-People`
   - Formula: `AND({Assigned To} = 'Erfan', OR({Next Follow-Up} <= NOW(), {Next Follow-Up} = BLANK()), {Stage} != 'Sold', {Stage} != 'Lost', {Opted Out} != TRUE(), {Phone} != '')`
   - Return All: true

5. **Code** -- Sort by Temperature and Build Queue
   ```javascript
   const tempOrder = { 'Hot': 0, 'Warm': 1, 'Cold': 2, 'Unknown': 3 };

   const contacts = items.map(item => {
     const f = item.json.fields;
     return {
       id: item.json.id,
       name: f.Name || 'Unknown',
       phone: f.Phone || '',
       temperature: f.Temperature || 'Unknown',
       stage: f.Stage || 'New',
       vehicleInterest: f['Vehicle Interest'] || '',
       lastContactDate: f['Last Contact Date'] || '',
       notes: f.Notes || '',
       cadencePosition: f['Cadence Position'] || 0,
     };
   });

   // Sort: Hot first, then Warm, then Cold, then Unknown
   contacts.sort((a, b) => {
     return (tempOrder[a.temperature] || 3) - (tempOrder[b.temperature] || 3);
   });

   return [{
     json: {
       success: true,
       sessionId: `session_${Date.now()}`,
       totalInQueue: contacts.length,
       queue: contacts,
     }
   }];
   ```

6. **Respond to Webhook**
   - Response Code: 200
   - Response Body: `{{ $json }}`

### Test
```bash
curl -X POST https://erfank.app.n8n.cloud/webhook/dialer/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### v2 Enhancement (Future)

In v2, this workflow would also:
- Create a Twilio Conference room via REST API
- Call the salesperson's cell and connect to conference
- Call the first contact in queue and connect to conference
- Enable recording with status callback to W11

For now, the app displays the queue and the salesperson taps a phone number to call via native dialer.

---

## W14: Dialer Status / Call Completion -- SIMPLIFIED

**Purpose:** For v1, the dialer is manual. The app presents a queue (from W13) and the salesperson logs call results manually through the existing tasks/calls endpoints. No separate workflow needed.

When the power dialer conference bridge is built in v2, this webhook will:
- Receive Twilio status callbacks when conference calls end
- Log disposition in `06-Calls`
- Update contact's `lastContactDate`
- Trigger W11 (post-call processor) if a recording exists

For now, call logging goes through the existing W20 (Calls GET) and W21 (Tasks) endpoints.

---

## W22: Dashboard Statistics (`/dashboard/stats` -- GET)

**Purpose:** Return aggregated stats for the dashboard: calls today, texts today, new leads, follow-ups due, pipeline breakdown by stage.

### Nodes

1. **Webhook** (GET)
   - Path: `dashboard/stats`
   - HTTP Method: GET
   - Response Mode: "Last Node"

2. **IF** -- Auth Check
   - Condition: `{{ $json.headers.authorization }}` equals `Bearer {{ $env.FCG_AUTH_TOKEN }}`

3. **FALSE -> Respond to Webhook**
   - Response Code: 401
   - Body: `{ "error": "Unauthorized" }`

4. **Airtable** -- Calls Today
   - Resource: Record
   - Operation: Search
   - Base ID: `{{ $env.AIRTABLE_BASE_ID }}`
   - Table: `06-Calls`
   - Formula: `IS_SAME(CREATED_TIME(), TODAY(), 'day')`
   - Return All: true

5. **Airtable** -- Texts Today
   - Resource: Record
   - Operation: Search
   - Table: `07-Messages`
   - Formula: `IS_SAME(CREATED_TIME(), TODAY(), 'day')`
   - Return All: true

6. **Airtable** -- All People (for pipeline and new leads)
   - Resource: Record
   - Operation: Search
   - Table: `01-People`
   - Return All: true

7. **Airtable** -- Follow-Ups Due
   - Resource: Record
   - Operation: Search
   - Table: `09-Tasks`
   - Formula: `AND({Due Date} <= TODAY(), {Status} != 'Done')`
   - Return All: true

   Note: Steps 4-7 can all run in parallel from the auth IF-TRUE output.

8. **Code** -- Aggregate All Stats
   ```javascript
   const calls = $('Calls Today').all();
   const texts = $('Texts Today').all();
   const people = $('All People').all();
   const tasks = $('Follow-Ups Due').all();

   // Pipeline breakdown by stage
   const pipeline = {};
   const stages = ['New', 'Contacted', 'Engaged', 'Appointment', 'Visited', 'Negotiating', 'Sold', 'Lost'];
   stages.forEach(s => pipeline[s.toLowerCase()] = 0);

   let newLeads = 0;
   let hotLeads = 0;

   people.forEach(p => {
     const stage = p.json.fields.Stage || 'New';
     const key = stage.toLowerCase();
     if (pipeline.hasOwnProperty(key)) {
       pipeline[key]++;
     } else {
       pipeline[key] = 1;
     }

     if (stage === 'New') newLeads++;
     if (p.json.fields.Temperature === 'Hot') hotLeads++;
   });

   // Calculate texts by direction
   let textsInbound = 0;
   let textsOutbound = 0;
   texts.forEach(t => {
     if (t.json.fields.Direction === 'Inbound') textsInbound++;
     else textsOutbound++;
   });

   return [{
     json: {
       callsToday: calls.length,
       textsToday: texts.length,
       textsInbound,
       textsOutbound,
       newLeads,
       hotLeads,
       followUpsDue: tasks.length,
       totalContacts: people.length,
       pipeline,
     }
   }];
   ```

   Rename the Airtable nodes to `Calls Today`, `Texts Today`, `All People`, `Follow-Ups Due` for the `$()` references to work.

9. **Respond to Webhook**
   - Response Code: 200
   - Response Body: `{{ $json }}`

### Test
```bash
curl https://erfank.app.n8n.cloud/webhook/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Note on the Existing Dashboard Stats Workflow

If you already built a basic dashboard stats workflow in Week 1, this replaces it with more detailed stats. Either update the existing workflow or deactivate the old one and activate this one. Both use the same webhook path `dashboard/stats`.

---

# Cross-Cutting Concerns

---

## CORS Headers (Reminder)

Every **Respond to Webhook** node should include these headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

Set these in the Respond to Webhook node under **Options -> Response Headers**, or globally in the Webhook node settings.

---

## Error Handling

For production stability, wrap risky operations in try/catch within Code nodes. Key places:

1. **Claude API responses** -- Always try/catch JSON.parse since the model may not return valid JSON
2. **Airtable searches** -- Check for empty results before accessing `.fields`
3. **Twilio SMS** -- Check for valid phone numbers before sending

Pattern for Code nodes with error handling:

```javascript
try {
  // Your logic here
  return [{ json: { success: true, data: result } }];
} catch (error) {
  return [{ json: { success: false, error: error.message } }];
}
```

---

## Workflow Naming Convention

Name your n8n workflows consistently:

| ID | Name | Type |
|----|------|------|
| W1 | FCG: VIN Process | Webhook |
| W2 | FCG: Content Generate | Webhook |
| W4 | FCG: QR Generate | Webhook |
| W5 | FCG: Inbound SMS | Webhook (no auth) |
| W6 | FCG: Trade-In Form | Webhook (no auth) |
| W9 | FCG: Cadence Runner | Schedule |
| W10 | FCG: Morning Briefing | Schedule |
| W11 | FCG: Post-Call Processor | Webhook (no auth) |
| W12 | FCG: Pre-Call Briefing | Webhook |
| W13 | FCG: Dialer Start | Webhook |
| W22 | FCG: Dashboard Stats | Webhook |
| W23 | FCG: Inventory | Webhook |

---

## Build Order (Priority)

### Week 2 -- Build in this order:
1. **W5: Inbound SMS** -- Critical for lead capture. Build and test first.
2. **W1: VIN Process** -- Needed for inventory.
3. **W23: Inventory GET/POST** -- Needed for the app to display vehicles.
4. **W4: QR Generate** -- Nice to have, quick build.
5. **W6: Trade-In Form** -- Important for lead gen.
6. **W2: Content Generate** -- Lower priority, AI content.

### Week 3 -- Build in this order:
1. **W9: Cadence Runner** -- Core follow-up automation. Test carefully.
2. **W10: Morning Briefing** -- Quick build, immediate value.
3. **W12: Pre-Call Briefing** -- Useful for call quality.
4. **W11: Post-Call Processor** -- Most complex, requires Whisper + Claude.

### Week 4 -- Build in this order:
1. **W22: Dashboard Stats** -- Replace/upgrade the Week 1 version.
2. **W13: Dialer Start** -- Simple queue query for v1.
3. **W14: Dialer Status** -- Skip for v1, handled by existing endpoints.

---

## External Service Configuration Summary

### Twilio Console Settings

| Setting | Value |
|---------|-------|
| Phone Number | +16029057670 |
| Messaging Webhook | `https://erfank.app.n8n.cloud/webhook/twilio/sms` (POST) |
| Voice Recording Callback | `https://erfank.app.n8n.cloud/webhook/call/process` (POST) |

### API Keys Needed

| Service | Variable | Where to Get |
|---------|----------|-------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| OpenAI (Whisper) | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Airtable | `AIRTABLE_API_KEY` | https://airtable.com/create/tokens |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | https://console.twilio.com |

---

## Quick Reference: Airtable Formulas Used

| Workflow | Table | Formula |
|----------|-------|---------|
| W5 | 01-People | `{Phone} = '{phone}'` |
| W6 | 01-People | `{Phone} = '{phone}'` |
| W9 | 01-People | `AND({Next Follow-Up} <= NOW(), {Stage} != 'Sold', {Stage} != 'Lost', {Opted Out} != TRUE())` |
| W10 | 09-Tasks | `AND({Due Date} < TODAY(), {Status} != 'Done')` |
| W10 | 09-Tasks | `AND({Due Date} = TODAY(), {Status} != 'Done')` |
| W10 | 01-People | `{Temperature} = 'Hot'` |
| W10 | 01-People | `AND({Stage} = 'New', CREATED_TIME() >= DATEADD(TODAY(), -1, 'day'))` |
| W11 | 01-People | `{Phone} = '{phone}'` |
| W12 | 06-Calls | `FIND("{contactId}", ARRAYJOIN({Person}))` |
| W12 | 07-Messages | `FIND("{contactId}", ARRAYJOIN({Person}))` |
| W12 | 09-Tasks | `AND(FIND("{contactId}", ARRAYJOIN({Person})), {Status} != 'Done')` |
| W13 | 01-People | `AND({Assigned To} = 'Erfan', OR({Next Follow-Up} <= NOW(), {Next Follow-Up} = BLANK()), {Stage} != 'Sold', {Stage} != 'Lost', {Opted Out} != TRUE(), {Phone} != '')` |
| W22 | 06-Calls | `IS_SAME(CREATED_TIME(), TODAY(), 'day')` |
| W22 | 07-Messages | `IS_SAME(CREATED_TIME(), TODAY(), 'day')` |
| W22 | 09-Tasks | `AND({Due Date} <= TODAY(), {Status} != 'Done')` |
