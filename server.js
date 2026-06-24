const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const path    = require('path');
const { GoogleGenAI } = require('@google/genai'); // Official Google Gen AI SDK
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

let aiModeActive = true;

const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-3.1-flash-lite',
  PORT = 3000,
  SUPABASE_URL,
  SUPABASE_KEY
} = process.env;

console.log(`🚀 Booting Control Command Engine [Model: ${GEMINI_MODEL}]...`);

// Initialize Database & Google Gen AI Clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── ABSOLUTE ROUTE ROOT INTERCEPTOR ───
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Chronological history string formatter with clean identity tracking
async function getPastHistoryString(phoneNum, contactName) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_type, message_body')
      .eq('phone_number', phoneNum)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) return "";

    const targetLabel = contactName || "Them";

    return data.reverse().map(m => {
      const label = m.sender_type === 'user' ? targetLabel : 'You';
      return `${label}: ${m.message_body}`;
    }).join('\n');
  } catch (err) {
    console.error('❌ History acquisition crash:', err.message);
    return "";
  }
}

// Identity Extractor for Roman-Telugu introductions using Gemini
async function tryExtractName(incomingText) {
  if (!GEMINI_API_KEY) return null;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: 'Analyze the text. If the user is explicitly introducing themselves or stating their name (even in Roman-Telugu text like "Nenu Vivek" or "na peru kiran" or "i am rakesh" or "sai"), extract ONLY the first name. Respond with just the single extracted name in plain text capital letters, nothing else. If they are not stating a name explicitly, reply with the word "NONE".',
        temperature: 0.1,
      },
      contents: incomingText,
    });
    
    const result = response.text?.trim();
    return (result && result.toUpperCase() !== 'NONE') ? result : null;
  } catch (err) {
    console.error('❌ Extraction module exception:', err.message);
    return null;
  }
}

// Outbound WhatsApp Meta API Pipeline
async function sendWhatsAppMessage(to, text) {
  const formattedPhone = to.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  try {
    await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: { preview_url: false, body: text }
    }, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('❌ Meta API Delivery Failure:', err.message);
    throw err;
  }
}

// ─── ENDPOINTS AND WEBHOOK SYSTEMS ───

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook handshake verification pass.');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const msgObj  = value?.messages?.[0];
    
    if (!msgObj || msgObj.type !== 'text') return;

    const rawFrom = msgObj.from;
    const msgText = msgObj.text.body;
    const msgId   = msgObj.id;
    const cleanFrom = rawFrom.replace(/\D/g, '');

    console.log(`\n📬 Message Incoming [+${cleanFrom}] ➔ "${msgText}"`);

    let { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', cleanFrom)
      .maybeSingle();

    if (!contact) {
      let profileName = value?.contacts?.[0]?.profile?.name || null;
      if (profileName) {
        profileName = profileName.replace(/[•*_\s]+/g, '').trim();
        if (profileName.toUpperCase() === 'CHARAN') profileName = null;
      }

      const { data: newC } = await supabase
        .from('contacts')
        .insert({ 
          phone_number: cleanFrom, 
          contact_name: profileName, 
          is_stranger: true,
          relationship_type: 'stranger'
        })
        .select()
        .single();
      contact = newC;
    }

    await supabase.from('messages').insert({
      id: msgId,
      phone_number: cleanFrom,
      sender_type: 'user',
      message_body: msgText
    });

    if (!aiModeActive) return;

    let currentName = contact?.contact_name;
    let relationshipType = contact?.relationship_type || 'stranger';

    if (currentName) {
      currentName = currentName.replace(/[•*_\s]+/g, '').trim();
      if (currentName.toUpperCase() === 'CHARAN') currentName = null;
    }
    
    if (!currentName) {
      let extractedName = await tryExtractName(msgText);
      if (extractedName && extractedName.toUpperCase() !== 'CHARAN') {
        console.log(`✨ Identity updated: [${extractedName}] for +${cleanFrom}.`);
        await supabase
          .from('contacts')
          .update({ contact_name: extractedName, is_stranger: false })
          .eq('phone_number', cleanFrom);
        currentName = extractedName;
      }
    }

    let finalTargetName = currentName || "Mava";
    if (finalTargetName.toUpperCase() === 'CHARAN') finalTargetName = "Mava";

    const pastHistoryText = await getPastHistoryString(cleanFrom, finalTargetName);
    
    // Fetch custom UI system prompt guidelines
    let { data: settingsData } = await supabase
      .from('system_settings')
      .select('system_prompt')
      .eq('id', 1)
      .maybeSingle();
      
    let baseDashboardPrompt = settingsData?.system_prompt || "You are Charan. Text back casually in Roman-Telugu.";

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

    console.log(`🧠 Generating response matrix via Gemini for [${finalTargetName}]...`);
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.75,
      },
      contents: userPromptPayload,
    });

    const cloneReply = response.text?.trim() || '...';

    const outgoingId = 'clone_' + Date.now();
    await supabase.from('messages').insert({
      id: outgoingId,
      phone_number: cleanFrom,
      sender_type: 'clone',
      message_body: cloneReply
    });

    await sendWhatsAppMessage(cleanFrom, cloneReply);
    console.log(`✅ Transmission Dispatched: "${cloneReply}"`);

  } catch (err) {
    console.error('❌ Critical error handling webhook pipeline event:', err.message);
  }
});

// Settings Management API Handlers
app.get('/api/system-prompt', async (req, res) => {
  try {
    const { data } = await supabase.from('system_settings').select('system_prompt').eq('id', 1).maybeSingle();
    res.json({ system_prompt: data?.system_prompt || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system-prompt', async (req, res) => {
  const { system_prompt } = req.body;
  try {
    await supabase.from('system_settings').upsert({ id: 1, system_prompt, updated_at: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// App Metrics & Live Stream Log Streams
app.get('/api/messages', async (req, res) => {
  try {
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: false });

    if (mErr || !msgs) return res.json([]);

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

    const { data: contacts } = await supabase.from('contacts').select('*');
    if (contacts) {
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
    res.json([]);
  }
});

app.get('/api/settings', (req, res) => res.json({ aiModeActive }));
app.post('/api/settings', (req, res) => {
  if (typeof req.body.aiModeActive === 'boolean') {
    aiModeActive = req.body.aiModeActive;
    return res.json({ success: true, aiModeActive });
  }
  res.json({ success: false });
});

app.get('/api/stats', async (req, res) => {
  try {
    const { count: totalMsgs } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: totalContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    res.json({ total: totalMsgs || 0, activeChannels: totalContacts || 0 });
  } catch {
    res.json({ total: 0, activeChannels: 0 });
  }
});

app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.json({ success: false, error: 'Missing parameters' });
  const cleanTarget = to.replace(/\D/g, '');
  const manualId = 'manual_out_' + Date.now();

  try {
    await sendWhatsAppMessage(cleanTarget, message);
    await supabase.from('messages').insert({
      id: manualId,
      phone_number: cleanTarget,
      sender_type: 'manual',
      message_body: message
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Dynamic Client View Asset Server
app.use(express.static(__dirname));

const GLOBAL_PORT = process.env.PORT || PORT;
app.listen(GLOBAL_PORT, () => console.log(`🚀 Control Center Active On Target Port Channels: ${GLOBAL_PORT}`));