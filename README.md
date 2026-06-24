# WhatsApp AI Bot 🤖
Auto-reply to WhatsApp messages using **Google Gemini AI** + **Meta Cloud API**  
with a live web dashboard to monitor everything.

---

## Architecture

```
WhatsApp User
     │
     ▼ (sends message)
Meta Cloud API
     │
     ▼ (POST to your webhook)
Your Node.js Server  ──►  Google Gemini API  ──►  AI Reply
     │
     ▼ (sends reply back)
Meta Cloud API  ──►  WhatsApp User

     +

Web Dashboard (http://localhost:3000)
  Live stats, message feed, activity log
```

---

## Step-by-Step Setup

### 1. Clone & Install
```bash
npm install
cp .env.example .env
```

### 2. Get Meta WhatsApp Credentials
1. Go to https://developers.facebook.com
2. Create an app → Add **WhatsApp** product
3. In **WhatsApp → API Setup**:
   - Note your **Phone Number ID**
   - Generate a **Temporary / Permanent Access Token**
4. In **WhatsApp → Configuration**:
   - Set Webhook URL: `https://YOUR_DOMAIN/webhook`
   - Set Verify Token: (same as `VERIFY_TOKEN` in your `.env`)
   - Subscribe to: `messages`

### 3. Get Google Gemini API Key (FREE)
1. Go to https://aistudio.google.com/app/apikey
2. Click **Create API Key**
3. Copy it into `.env` as `GEMINI_API_KEY`

> ✅ Gemini 1.5 Flash has a **free tier** — 15 requests/min, 1M tokens/day

### 4. Fill in .env
```
WHATSAPP_TOKEN=your_token
PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=any_secret_string
GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### 5. Run the Server
```bash
node server.js
# or for development:
npm run dev
```

### 6. Expose to Internet (for Webhooks)
Meta needs a public HTTPS URL. Use [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Copy the https:// URL → paste into Meta webhook config
```
Or deploy to:
- **Railway**: https://railway.app (free)
- **Render**: https://render.com (free)
- **Fly.io**: https://fly.io (free)

### 7. Open Dashboard
Visit http://localhost:3000 in your browser.

---

## Gemini Model Options

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| `gemini-1.5-flash` | ⚡ Very fast | ✅ Great | FREE tier |
| `gemini-2.0-flash` | ⚡ Fast | ✅ Better | FREE tier |
| `gemini-1.5-pro`   | Medium | 🏆 Best | Paid |

Set your preferred model in `.env` as `GEMINI_MODEL`.

---

## API Endpoints

| Method | Endpoint        | Description              |
|--------|-----------------|--------------------------|
| GET    | /webhook        | Meta webhook verification|
| POST   | /webhook        | Receive WhatsApp messages|
| GET    | /api/messages   | Get message log (JSON)   |
| GET    | /api/stats      | Get stats summary        |
| GET    | /api/health     | Health check             |

---

## Customizing the AI Persona
In your `.env`, set:
```
GEMINI_SYSTEM_PROMPT=You are a helpful customer support agent for Acme Corp. Always be polite and professional. If you don't know something, say so honestly.
```

---

## Production Notes
- Replace the in-memory `messageLog` array with a real database (SQLite, MongoDB, PostgreSQL)
- Add rate limiting to prevent spam
- Add a whitelist of allowed sender numbers
- Use a permanent Meta access token (not the temporary one)
- Use HTTPS in production (handled by Railway/Render automatically)
