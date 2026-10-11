 # AgriGuard AI 🌾🛡️
### Proactive Crop Risk Intelligence Agent & Monitoring Dashboard

AgriGuard AI is an AI-assisted agricultural monitoring platform that transforms standard WhatsApp interactions into a structured, proactive crop intelligence workflow. 

Farmers communicate directly through WhatsApp by sending **text messages**, **crop photos**, and **location pins**. AgriGuard collects the available field context, retrieves live weather and vegetation indices, executes transparent deterministic risk rules, and utilizes **Google Gemini Multimodal AI** to synthesize an evidence-based, cautious advisory—without making false disease diagnoses.

---

## 🏛️ System Architecture

```
 Farmer (WhatsApp)
   │ (Text / Crop Photos / GPS Location Pin)
   ▼
Meta Cloud API Webhook (POST /webhook)
   │
   ├─► Immediate 200 OK ACK & Deduplication
   ├─► Farmer & Field Profile Onboarding Service
   ├─► Supabase PostgreSQL Database (Messages & Contacts)
   ├─► Live Weather Telemetry (Open-Meteo API)
   ├─► Agro-Climatic & Vegetation Indices Engine (Sentinel-2 Grid Proxy)
   ├─► Transparent Deterministic Risk Engine (Fungal, Heat, Drought, Flood)
   ├─► Google Gemini Multimodal Engine (Symptom extraction & safe advisory)
   │
   ├─► Outbound WhatsApp Advisory Dispatch
   │
   ▼
Organization Command Dashboard (http://localhost:3000)
   ├── Executive Overview & Risk Watchlist
   ├── Crop Assessments & Full Evidence Dossiers
   ├── Alerts & Field Officer Verification Workflow
   ├── Farmers & Monitored Fields Directory
   └── 1-Click Live Demonstration Simulator
```

---

## 🔬 Core Principles & Safety Guardrails

1. **Observed vs. Inferred Data Distinction**:
   Every assessment strictly separates:
   - **Observed Data**: Exact symptoms visually seen in leaf photos or reported by the farmer.
   - **Calculated Indicators**: Quantifiable metrics like relative humidity, consecutive leaf wetness hours, and heat thresholds.
   - **Environmental Risk Factors**: Climate and weather favorability.
   - **Disease Hypotheses**: Clearly flagged as **Unconfirmed Hypotheses**.
   - **Missing Evidence**: What must be inspected before any treatment (e.g. spore microscopy, soil pH).
   - **Recommended Verification Actions**: Safe cultural practices and scouting steps; avoids advising harsh chemical sprays without extension officer confirmation.
2. **Conservative Alert Policy**:
   High-risk alerts are generated only when deterministic rule thresholds are breached, never purely from speculative LLM text.
3. **Transparent Data Provenance**:
   All weather observations are explicitly tagged (`source: "Open-Meteo API"`, `status: "live"`). Regional models and demo samples are explicitly labeled.

---

## 🚀 Live Demonstration Steps (For Hackathon Judges)

### Demonstration Flow 1: Web Dashboard & Evidence Dossier
1. Open `http://localhost:3000` in your web browser.
2. Observe the **Executive Overview**: Monitored Farmers, Registered Fields, Active Alerts, and API Health.
3. Click on the **1-Click Demo Simulator** buttons at the top:
   - 🌾 **Simulate Rice Blast (Paddy, 91% Humidity)**: Injects an active high-risk fungal scenario.
   - ☀️ **Simulate Heat Stress (Cotton, 39.4°C)**: Injects an abiotic thermal shock alert.
4. Navigate to **Crop Assessments** and click **"Evidence"** on any assessment to open the deep-dive **Evidence Dossier Modal**.
   - View Weather Telemetry, Satellite Vegetation Index, Triggered Rules, Unconfirmed Hypotheses, and Missing Evidence.
5. Navigate to **Alerts & Review**:
   - Change an alert status from `Pending` to `Verified in Field` or `Dismissed` and enter supervisor verification notes.

### Demonstration Flow 2: Live WhatsApp Interaction
1. A farmer sends a message or location pin:
   ```
   "My paddy crop leaves have brown spindle-shaped spots. Location: 16.3067, 80.4365"
   ```
2. AgriGuard receives the webhook, queries Open-Meteo for live weather at those coordinates, checks fungal microclimate rules, and generates an evidence-based WhatsApp reply.
3. The farmer receives an advisory formatted with clear risk levels, observed facts, unconfirmed possibilities, and safe next steps.
4. Extension officers can view the live chat in the **Live WhatsApp Feed** tab and send direct verified guidance.

---

## ⚙️ Environment Variables

Configure these in your `.env` file:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Local server port | `3000` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini Model Candidate | `gemini-2.5-flash` or `gemini-3.1-flash-lite` |
| `SUPABASE_URL` | Supabase Project URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJhbG...` |
| `META_VERIFY_TOKEN` | Webhook verification token | `your_verify_token` |
| `META_ACCESS_TOKEN` | Meta WhatsApp Cloud API Token | `EAA...` |
| `PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID | `1234567890` |

*Note: Open-Meteo Weather API requires no API key and runs automatically.*

---

## 🧪 Automated Testing & Health Verification

Run the full platform test suite (57/57 tests passing):
```bash
# Complete MVP Integration & Prompt 9 Audit (Scenarios A-E, Handshake, Dedupe, Demo)
node scripts/test_prompt9_mvp_audit.js

# WhatsApp End-to-End Pipeline & Conversation Examples
node scripts/test_whatsapp_pipeline.js

# Dashboard & Operations Center APIs
node scripts/test_dashboard_endpoints.js

# Multimodal Botanical Vision & Fallbacks
node scripts/test_multimodal_unit.js

# Agent Orchestrator & Risk Engine
node scripts/test_orchestrator_unit.js

# Sentinel-2 Satellite & Cloud Rejection
node scripts/test_satellite_unit.js

# Open-Meteo Weather Telemetry
node scripts/test_weather_unit.js
```

---

## 📋 Hackathon MVP Modules Implemented

- [x] **Module A**: Farmer & Field Profile Management (Conversational onboarding state machine).
- [x] **Module B**: Live Weather Data Collection (Open-Meteo API with rain forecasts).
- [x] **Module C**: Satellite & Vegetation Data Integration (NDVI proxy & canopy vigor).
- [x] **Module D**: Transparent Crop Risk Assessment Engine (Deterministic agronomic rules).
- [x] **Module E**: Gemini Multimodal Evidence Explanation (Strictly unconfirmed hypotheses).
- [x] **Module F**: WhatsApp Conversational Interaction (Text, Photo, and Location pin parsing).
- [x] **Module G**: Organization Monitoring Dashboard (Overview, Assessments, Alerts, Directory, Live Chat).
- [x] **Module H**: Assessment History & Evidence Tracking.
- [x] **Module I**: Alert Status & Review Workflow (`Pending`, `Under Review`, `Verified`, `Dismissed`).
- [x] **Module J**: 1-Click Live Demo Simulator for hackathon judging.

---

## 🛡️ Known Limitations
- Disease hypotheses are environmental vulnerability estimates and require physical confirmation before chemical spraying.
- Satellite NDVI indices currently utilize regional agro-climatic proxies when live orbital satellite passes are occluded by cloud cover.
