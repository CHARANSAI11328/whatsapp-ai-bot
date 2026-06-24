const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Secure server using Helmet with custom CSP allowing CDN assets and inline scripts/styles (for the dashboard)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      "font-src": ["'self'", "https://cdnjs.cloudflare.com"],
    },
  },
}));

app.use(express.json());

// Secure CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

let aiModeActive = true;

// Environment Variable Mapping with Legacy Fallbacks
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Structured console logging function
function logEvent(level, message, meta = {}) {
  const logObj = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(logObj));
}

logEvent('INFO', 'Booting Control Command Engine...', { model: GEMINI_MODEL, port: PORT });

// Verify critical environment configurations on boot
if (!SUPABASE_URL || !SUPABASE_KEY) {
  logEvent('ERROR', 'CRITICAL: Supabase URL or Key environment variables are missing! Server might fail database tasks.');
}
if (!GEMINI_API_KEY) {
  logEvent('ERROR', 'CRITICAL: Gemini API Key is missing! AI reply engine will fail.');
}
if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  logEvent('ERROR', 'CRITICAL: Meta WhatsApp credentials missing! Bot will not be able to send messages.');
}

// Initialize Database & Google Gen AI Clients safely
let supabase;
let ai;

try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    logEvent('INFO', 'Supabase Client Initialized.');
  }
} catch (err) {
  logEvent('ERROR', 'Supabase Client initialization failure:', { error: err.message });
}

try {
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    logEvent('INFO', 'Gemini AI Client Initialized.');
  }
} catch (err) {
  logEvent('ERROR', 'Gemini AI Client initialization failure:', { error: err.message });
}

// ─── ABSOLUTE ROUTE ROOT INTERCEPTOR ───
app.get('/', (req, res) => {
  // If the client explicitly requests JSON (e.g. for health checks / uptime monitors),
  // return the status JSON. Otherwise, serve the HTML dashboard.
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ status: "online" });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
  let dbConnected = false;
  if (supabase) {
    try {
      const { error } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
      if (!error) {
        dbConnected = true;
      } else {
        logEvent('ERROR', 'Health check database query failure:', { error: error.message });
      }
    } catch (err) {
      logEvent('ERROR', 'Health check database exception:', { error: err.message });
    }
  }

  const status = dbConnected ? "healthy" : "degraded";
  res.status(dbConnected ? 200 : 500).json({
    status: status,
    database: dbConnected ? "connected" : "disconnected"
  });
});

// Chronological history string formatter with clean identity tracking
async function getPastHistoryString(phoneNum, contactName, excludeMsgId) {
  if (!supabase) {
    logEvent('WARNING', 'Database client uninitialized. Skipping history retrieval.');
    return "";
  }
  try {
    logEvent('INFO', 'Querying chat history for database sync...', { phone_number: phoneNum });
    let query = supabase
      .from('messages')
      .select('id, sender_type, message_body')
      .eq('phone_number', phoneNum);

    if (excludeMsgId) {
      query = query.neq('id', excludeMsgId);
    }

    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      logEvent('ERROR', 'History acquisition error:', { error: error.message });
      return "";
    }
    if (!data || data.length === 0) return "";

    const targetLabel = contactName || "Them";

    return data.reverse().map(m => {
      const label = m.sender_type === 'user' ? targetLabel : 'You';
      return `${label}: ${m.message_body}`;
    }).join('\n');
  } catch (err) {
    logEvent('ERROR', 'History acquisition crash:', { error: err.message });
    return "";
  }
}

// Identity Extractor for Roman-Telugu introductions using Gemini
async function tryExtractName(incomingText) {
  if (!ai || !GEMINI_API_KEY) {
    logEvent('WARNING', 'AI client uninitialized. Skipping name extraction.');
    return null;
  }
  try {
    logEvent('INFO', 'Extracting name from message text via Gemini...', { text: incomingText });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: 'Analyze the text. If the user is explicitly introducing themselves or stating their name (even in Roman-Telugu text like "Nenu Vivek" or "na peru kiran" or "i am rakesh" or "sai"), extract ONLY the first name. Respond with just the single extracted name in plain text capital letters, nothing else. If they are not stating a name explicitly, reply with the word "NONE".',
        temperature: 0.1,
      },
      contents: incomingText,
    });
    
    const result = response.text?.trim();
    logEvent('INFO', 'Name extraction model result:', { result });
    return (result && result.toUpperCase() !== 'NONE') ? result : null;
  } catch (err) {
    logEvent('ERROR', 'Extraction module exception:', { error: err.message });
    return null;
  }
}

// Outbound WhatsApp Meta API Pipeline
async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    const errorMsg = 'Meta credentials missing. Cannot dispatch message.';
    logEvent('ERROR', errorMsg);
    throw new Error(errorMsg);
  }
  
  const formattedPhone = to.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  try {
    logEvent('INFO', 'Dispatched outbound message packet payload to Meta...', { to: formattedPhone });
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: { preview_url: false, body: text }
    }, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
    });
    logEvent('INFO', 'Meta API Delivery Success.', { messageId: response.data?.messages?.[0]?.id });
  } catch (err) {
    const apiError = err.response?.data?.error?.message || err.message;
    logEvent('ERROR', 'Meta API Delivery Failure:', { error: apiError });
    throw new Error(apiError);
  }
}

// ─── ENDPOINTS AND WEBHOOK SYSTEMS ───

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logEvent('INFO', 'Webhook handshake verification pass.');
      return res.status(200).send(challenge);
    } else {
      logEvent('WARNING', 'Webhook handshake verification rejected. Token mismatch.', { expected: VERIFY_TOKEN, received: token });
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

app.post('/webhook', async (req, res) => {
  // Always return 200 immediately to acknowledge receipt and prevent Meta timeout retries
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const msgObj  = value?.messages?.[0];
    
    // Validate request structure safely
    if (!msgObj) {
      // Not a message event (could be a status update or other webhook change)
      return;
    }

    if (msgObj.type !== 'text') {
      logEvent('INFO', 'Incoming webhook event skipped: Message type is not text.', { type: msgObj.type });
      return;
    }

    const rawFrom = msgObj.from;
    const msgText = msgObj.text?.body;
    const msgId   = msgObj.id;

    if (!rawFrom || !msgText || !msgId) {
      logEvent('WARNING', 'Incoming webhook message incomplete.', { msgObj });
      return;
    }

    const cleanFrom = rawFrom.replace(/\D/g, '');
    logEvent('INFO', 'Incoming webhook text event:', { from: `+${cleanFrom}`, message: msgText });

    if (!supabase) {
      logEvent('ERROR', 'Supabase database is not initialized. Cannot store messages.');
      return;
    }

    // Query or insert contact
    let { data: contact, error: contactFetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', cleanFrom)
      .maybeSingle();

    if (contactFetchError) {
      logEvent('ERROR', 'Supabase contacts query failed:', { error: contactFetchError.message });
    }

    if (!contact) {
      let profileName = value?.contacts?.[0]?.profile?.name || null;
      if (profileName) {
        profileName = profileName.replace(/[•*_\s]+/g, '').trim();
        if (profileName.toUpperCase() === 'CHARAN') profileName = null;
      }

      logEvent('INFO', 'Registering new contact in database...', { phone_number: cleanFrom, name: profileName });
      const { data: newC, error: contactInsertError } = await supabase
        .from('contacts')
        .insert({ 
          phone_number: cleanFrom, 
          contact_name: profileName, 
          is_stranger: true,
          relationship_type: 'stranger'
        })
        .select()
        .single();
      
      if (contactInsertError) {
        logEvent('ERROR', 'Supabase contact insertion failed:', { error: contactInsertError.message });
      } else {
        contact = newC;
      }
    }

    // Insert incoming message
    logEvent('INFO', 'Saving incoming message to database...', { from: cleanFrom, messageId: msgId });
    const { error: msgInsertError } = await supabase.from('messages').insert({
      id: msgId,
      phone_number: cleanFrom,
      sender_type: 'user',
      message_body: msgText
    });

    if (msgInsertError) {
      logEvent('ERROR', 'Incoming message insertion failed:', { error: msgInsertError.message });
    }

    if (!aiModeActive) {
      logEvent('INFO', 'AI Engine is inactive. Skipping response generation.');
      return;
    }

    let currentName = contact?.contact_name;
    let relationshipType = contact?.relationship_type || 'stranger';

    if (currentName) {
      currentName = currentName.replace(/[•*_\s]+/g, '').trim();
      if (currentName.toUpperCase() === 'CHARAN') currentName = null;
    }
    
    if (!currentName) {
      let extractedName = await tryExtractName(msgText);
      if (extractedName && extractedName.toUpperCase() !== 'CHARAN') {
        logEvent('INFO', 'Identity updated for contact:', { phone_number: cleanFrom, name: extractedName });
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ contact_name: extractedName, is_stranger: false })
          .eq('phone_number', cleanFrom);
        
        if (updateError) {
          logEvent('ERROR', 'Contact identity update failed:', { error: updateError.message });
        } else {
          currentName = extractedName;
        }
      }
    }

    let finalTargetName = currentName || "Mava";
    if (finalTargetName.toUpperCase() === 'CHARAN') finalTargetName = "Mava";

    const pastHistoryText = await getPastHistoryString(cleanFrom, finalTargetName, msgId);
    
    // Fetch custom UI system prompt guidelines
    let baseDashboardPrompt = "You are Charan. Text back casually in Roman-Telugu.";
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('system_settings')
        .select('system_prompt')
        .eq('id', 1)
        .maybeSingle();
      
      if (settingsError) {
        logEvent('ERROR', 'System settings fetch failed:', { error: settingsError.message });
      } else if (settingsData?.system_prompt) {
        baseDashboardPrompt = settingsData.system_prompt;
      }
    } catch (err) {
      logEvent('ERROR', 'System settings acquisition exception:', { error: err.message });
    }

    // Pass system directives natively to Gemini context settings
    const systemInstruction = `
${baseDashboardPrompt}

⚠️ RUNTIME SYSTEM PARAMETERS (STRICT ENFORCEMENT):
- Current Interlocutor Name: "${finalTargetName}"
- Configured Relationship Category: "${relationshipType.toUpperCase()}"
- Rules: Never use markdown symbols, bold text asterisks (**), lists, or formatting brackets. Provide EXACTLY ONE brief, human-sounding messaging chat line.
`;

    const userPromptPayload = `
[RECENT DIALOGUE LOG CONTEXT]
${pastHistoryText || "No context history logged."}
${finalTargetName}: ${msgText}
You:`;

    logEvent('INFO', 'Generating response via Gemini AI engine...', { contact: finalTargetName });
    
    if (!ai) {
      logEvent('ERROR', 'Gemini AI client is uninitialized. Cannot reply.');
      return;
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.75,
      },
      contents: userPromptPayload,
    });

    const cloneReply = response.text?.trim() || '...';
    logEvent('INFO', 'AI reply generated successfully.', { reply: cloneReply });

    const outgoingId = 'clone_' + Date.now();
    logEvent('INFO', 'Saving AI reply message to database...', { to: cleanFrom, messageId: outgoingId });
    const { error: replyInsertError } = await supabase.from('messages').insert({
      id: outgoingId,
      phone_number: cleanFrom,
      sender_type: 'clone',
      message_body: cloneReply
    });

    if (replyInsertError) {
      logEvent('ERROR', 'AI reply database insertion failed:', { error: replyInsertError.message });
    }

    await sendWhatsAppMessage(cleanFrom, cloneReply);
    logEvent('INFO', 'Transmission Dispatched successfully.', { to: cleanFrom, reply: cloneReply });

  } catch (err) {
    logEvent('ERROR', 'Critical error handling webhook pipeline event:', { error: err.message });
  }
});

// Settings Management API Handlers
app.get('/api/system-prompt', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database uninitialized' });
  }
  try {
    const { data, error } = await supabase.from('system_settings').select('system_prompt').eq('id', 1).maybeSingle();
    if (error) {
      logEvent('ERROR', 'API system-prompt fetch failed:', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
    res.json({ system_prompt: data?.system_prompt || "" });
  } catch (err) {
    logEvent('ERROR', 'API system-prompt fetch exception:', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system-prompt', async (req, res) => {
  const { system_prompt } = req.body;
  if (typeof system_prompt !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid parameter: system_prompt must be a string' });
  }
  if (!supabase) {
    return res.status(500).json({ error: 'Database uninitialized' });
  }
  try {
    logEvent('INFO', 'Updating system prompt matrix...', { promptSnippet: system_prompt.substring(0, 100) });
    const { error } = await supabase.from('system_settings').upsert({ id: 1, system_prompt, updated_at: new Date() });
    if (error) {
      logEvent('ERROR', 'API system-prompt save failed:', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    logEvent('ERROR', 'API system-prompt save exception:', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// App Metrics & Live Stream Log Streams
app.get('/api/messages', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database uninitialized' });
  }
  try {
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: false });

    if (mErr) {
      logEvent('ERROR', 'API messages fetch failed:', { error: mErr.message });
      return res.json([]);
    }
    if (!msgs) return res.json([]);

    const uniqueMap = {};
    for (const m of msgs) {
      if (!uniqueMap[m.phone_number]) {
        uniqueMap[m.phone_number] = {
          id: m.id,
          from: m.phone_number,
          contact: m.phone_number,
          incoming: null,
          reply: null,
          status: 'replied',
          timestamp: m.timestamp,
          type: 'stranger'
        };
      }
      
      const entry = uniqueMap[m.phone_number];
      if (m.sender_type === 'user' && !entry.incoming) {
        entry.incoming = m.message_body;
      } else if ((m.sender_type === 'clone' || m.sender_type === 'manual') && !entry.reply) {
        entry.reply = m.message_body;
      }
    }

    const { data: contacts, error: cErr } = await supabase.from('contacts').select('*');
    if (cErr) {
      logEvent('ERROR', 'API contacts fetch failed:', { error: cErr.message });
    } else if (contacts) {
      contacts.forEach(c => {
        if (uniqueMap[c.phone_number]) {
          uniqueMap[c.phone_number].contact = c.contact_name || c.phone_number;
          uniqueMap[c.phone_number].type = c.relationship_type || 'stranger';
          if (c.is_stranger) uniqueMap[c.phone_number].status = 'new';
        }
      });
    }

    res.json(Object.values(uniqueMap));
  } catch (e) {
    logEvent('ERROR', 'API messages fetch exception:', { error: e.message });
    res.json([]);
  }
});

app.get('/api/settings', (req, res) => res.json({ aiModeActive }));

app.post('/api/settings', (req, res) => {
  if (typeof req.body.aiModeActive === 'boolean') {
    aiModeActive = req.body.aiModeActive;
    logEvent('INFO', 'AI mode active state updated.', { aiModeActive });
    return res.json({ success: true, aiModeActive });
  }
  res.status(400).json({ success: false, error: 'Invalid parameters' });
});

app.get('/api/stats', async (req, res) => {
  if (!supabase) {
    return res.json({ total: 0, activeChannels: 0 });
  }
  try {
    const { count: totalMsgs, error: msgsErr } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: totalContacts, error: contactsErr } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    
    if (msgsErr || contactsErr) {
      logEvent('ERROR', 'API stats query failed:', { msgsError: msgsErr?.message, contactsError: contactsErr?.message });
      return res.json({ total: 0, activeChannels: 0 });
    }
    res.json({ total: totalMsgs || 0, activeChannels: totalContacts || 0 });
  } catch (err) {
    logEvent('ERROR', 'API stats exception:', { error: err.message });
    res.json({ total: 0, activeChannels: 0 });
  }
});

app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ success: false, error: 'Missing parameters' });
  if (typeof to !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid parameters: types must be strings' });
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database uninitialized' });
  }

  const cleanTarget = to.replace(/\D/g, '');
  const manualId = 'manual_out_' + Date.now();

  try {
    logEvent('INFO', 'Initiating manual message dispatch...', { to: cleanTarget });
    await sendWhatsAppMessage(cleanTarget, message);
    
    const { error } = await supabase.from('messages').insert({
      id: manualId,
      phone_number: cleanTarget,
      sender_type: 'manual',
      message_body: message
    });
    
    if (error) {
      logEvent('ERROR', 'Manual message storage failed:', { error: error.message });
    }
    
    res.json({ success: true });
  } catch (err) {
    logEvent('ERROR', 'Manual message dispatch failed:', { error: err.message });
    res.json({ success: false, error: err.message });
  }
});

// Dynamic Client View Asset Server
app.use(express.static(__dirname));

// Express Error Boundary Middleware
app.use((err, req, res, next) => {
  logEvent('ERROR', 'Unhandled Express Application Error:', { error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error'
  });
});

const GLOBAL_PORT = PORT;
app.listen(GLOBAL_PORT, () => logEvent('INFO', `🚀 Control Center Active On Target Port Channels: ${GLOBAL_PORT}`));