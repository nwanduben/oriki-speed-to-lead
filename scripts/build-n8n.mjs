#!/usr/bin/env node
// Generates the two n8n workflows into n8n/build/*.json (git-ignored: they embed secrets from config).
// Config comes from n8n/config.json (copy config.example.json) and is baked
// into the Code nodes, so rebuild + re-import after changing it.
// The scoring function is copied verbatim from agent/scoring.js.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = existsSync(join(root, 'n8n/config.json')) ? 'n8n/config.json' : 'n8n/config.example.json';
const CFG = JSON.parse(readFileSync(join(root, cfgPath), 'utf8'));
const scoringSrc = readFileSync(join(root, 'agent/scoring.js'), 'utf8').replace(/^if \(typeof module.*$/m, '');
const cfgLine = 'const CFG = ' + JSON.stringify(CFG) + ';\n';

const TABLE = CFG.DATA_TABLE_ID ? { __rl: true, mode: 'id', value: CFG.DATA_TABLE_ID } : { __rl: true, mode: 'name', value: 're_leads' };
// Credentials are attached only when their n8n id is configured.
const cred = (type, idKey, name) => (CFG[idKey] ? { credentials: { [type]: { id: CFG[idKey], name } } } : {});
const autoMap = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] };
let id = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) =>
  ({ id: `n${++id}`, name, type, typeVersion, position, parameters, ...extra });
const code = (name, pos, js) => node(name, 'n8n-nodes-base.code', 2, pos, { jsCode: cfgLine + js });
const upsert = (name, pos, key = 'lead_id') => node(name, 'n8n-nodes-base.dataTable', 1.1, pos, {
  resource: 'row', operation: 'upsert', dataTableId: TABLE,
  filters: { conditions: [{ keyName: key, condition: 'eq', keyValue: `={{ $json.${key} }}` }] },
  columns: autoMap,
});
const webhook = (name, pos, path, responseMode, options = {}) => node(name, 'n8n-nodes-base.webhook', 2, pos,
  { httpMethod: 'POST', path, responseMode, options }, { webhookId: path.replace(/\W/g, '-') });
const respond = (name, pos, body, code = 200) => node(name, 'n8n-nodes-base.respondToWebhook', 1.1, pos, {
  respondWith: 'json', responseBody: body, options: { responseCode: code },
});
const ifNode = (name, pos, left, right, op = 'equals') => node(name, 'n8n-nodes-base.if', 2.2, pos, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    combinator: 'and',
    conditions: [{ id: `c${id}`, leftValue: left, rightValue: right, operator: { type: 'string', operation: op } }],
  },
  options: {},
});
const elevenCall = (name, pos) => node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
  method: 'POST',
  url: 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.call_payload) }}',
  options: { timeout: 15000 },
}, { ...cred('httpHeaderAuth', 'CRED_ELEVENLABS', 'ElevenLabs API (xi-api-key)'), onError: 'continueErrorOutput' });
const whatsappSend = (name, pos) => node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
  method: 'POST',
  url: `https://graph.facebook.com/v21.0/${CFG.WHATSAPP_PHONE_NUMBER_ID}/messages`,
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.wa_payload) }}',
  options: {},
}, { ...cred('httpHeaderAuth', 'CRED_WHATSAPP', 'WhatsApp Cloud API (Bearer)'), onError: 'continueRegularOutput' });
// Team alerts go to Telegram (free; the bot is the n8n "Telegram account" credential).
const telegramSend = (name, pos) => node(name, 'n8n-nodes-base.telegram', 1.2, pos, {
  chatId: CFG.TELEGRAM_CHAT_ID, text: '={{ $json.text }}',
  additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
}, { ...cred('telegramApi', 'CRED_TELEGRAM', 'Telegram account'), onError: 'continueRegularOutput' });
const link = (...names) => ({ main: [names.map((n) => ({ node: n, type: 'main', index: 0 }))] });
const link2 = (a, b) => ({ main: [a ? [{ node: a, type: 'main', index: 0 }] : [], b ? [{ node: b, type: 'main', index: 0 }] : []] });

// Shared snippets -----------------------------------------------------------
// Tool calls carry lead_id when we placed the call. When the person called Maya
// themselves (WhatsApp button), lead_id is the placeholder and we match on caller id.
const NO_LEAD = "['', 'none', 'test-lead'].includes(String($json.body.lead_id || ''))";
const leadLookup = (name, pos) => node(name, 'n8n-nodes-base.dataTable', 1.1, pos, {
  resource: 'row', operation: 'get', dataTableId: TABLE, limit: 1,
  filters: { conditions: [{
    keyName: `={{ ${NO_LEAD} ? 'phone' : 'lead_id' }}`, condition: 'eq',
    keyValue: `={{ ${NO_LEAD} ? '+' + String($json.body.caller_id || '').replace(/\\D/g, '') : $json.body.lead_id }}`,
  }] },
}, { alwaysOutputData: true });
const buildCallPayload = `
function buildCallPayload(lead) {
  return {
    agent_id: CFG.ELEVENLABS_AGENT_ID,
    agent_phone_number_id: CFG.ELEVENLABS_PHONE_NUMBER_ID,
    to_number: lead.phone,
    conversation_initiation_client_data: { dynamic_variables: {
      lead_id: lead.lead_id, first_name: lead.first_name || 'there',
      brokerage_name: CFG.BROKERAGE_NAME, service_area: CFG.SERVICE_AREA, agent_name: CFG.AGENT_NAME,
      inquiry_type: lead.inquiry_type || 'a home', inquiry_message: lead.message || '',
    } },
  };
}
`;
const buildWhatsApp = `
// Team alert goes to Telegram; the lead gets a WhatsApp only if they opted in on the form.
function alertItems(lead, reason, summary) {
  if (!CFG.TELEGRAM_CHAT_ID) return [];
  const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [
    '<b>🔔 Oriki Homes lead alert</b>',
    esc(reason),
    '',
    '<b>' + esc((lead.first_name || '') + ' ' + (lead.last_name || '')) + '</b> · ' + esc(lead.tier || 'unscored') + (lead.score != null && lead.score !== '' ? ' (' + lead.score + ')' : ''),
    '📞 ' + esc(lead.phone) + (lead.phone ? '  ·  <a href="https://wa.me/' + String(lead.phone).replace(/\\D/g, '') + '">WhatsApp</a>' : ''),
    lead.area || lead.price_range ? '📍 ' + esc(lead.area) + (lead.price_range ? ' · ' + esc(lead.price_range) : '') : '',
    summary || lead.message ? '📝 ' + esc(summary || lead.message).slice(0, 700) : '',
    'Ref ' + esc(lead.lead_id),
  ];
  return [{ json: { text: lines.filter((l) => l !== '').join('\\n') } }];
}
function waTemplate(to, name, params) {
  return { messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
    template: { name, language: { code: 'en_US' },
      components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t || '-').slice(0, 900) })) }] } };
}
function whatsappItems(lead, reason, summary) {
  if (!CFG.WHATSAPP_PHONE_NUMBER_ID) return []; // WhatsApp not configured yet: the fallback status is still saved
  const items = [];
  if (lead.consent_whatsapp === true || lead.consent_whatsapp === 'true') {
    items.push({ json: { wa_payload: waTemplate(lead.phone, CFG.WA_TEMPLATE_LEAD, [lead.first_name || 'there', CFG.AGENT_NAME, CFG.BOOKING_LINK]) } });
  }
  return items;
}
`;

// Workflow 1: intake ---------------------------------------------------------
id = 0;
const intakeNodes = [
  webhook('Form submitted', [0, 300], 're-lead-intake', 'responseNode', { allowedOrigins: CFG.ALLOWED_ORIGINS }),
  code('Validate lead', [220, 300], `
const b = $input.first().json.body || {};
const clean = (v) => (v == null ? '' : String(v).trim()).slice(0, 1000);
let digits = clean(b.phone).replace(/[^\\d+]/g, '');
if (/^0\\d{10}$/.test(digits)) digits = CFG.DEFAULT_COUNTRY_CODE + digits.slice(1); // Nigerian local format 0803...
else if (/^\\d{10}$/.test(digits)) digits = CFG.DEFAULT_COUNTRY_CODE + digits;
if (/^\\d{11,15}$/.test(digits)) digits = '+' + digits;
const phoneOk = /^\\+[1-9]\\d{7,14}$/.test(digits);
const consentCall = b.consent_call === true || b.consent_call === 'true' || b.consent_call === 'on';
const consentWa = b.consent_whatsapp === true || b.consent_whatsapp === 'true' || b.consent_whatsapp === 'on';
const telephonyReady = Boolean(CFG.ELEVENLABS_AGENT_ID && CFG.ELEVENLABS_PHONE_NUMBER_ID);
const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'phone';
let status = 'queued';
// WhatsApp: the lead taps "Talk to Maya" and calls us, so we never dial them.
if (channel === 'whatsapp') status = 'whatsapp_invited';
else if (!phoneOk) status = 'invalid_phone';
else if (!consentCall) status = 'no_consent';
else if (!telephonyReady) status = 'no_telephony';
const now = new Date().toISOString();
return [{ json: {
  lead_id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  received_at: now, updated_at: now,
  first_name: clean(b.first_name), last_name: clean(b.last_name), email: clean(b.email).toLowerCase(),
  phone: phoneOk ? digits : clean(b.phone), inquiry_type: clean(b.inquiry_type),
  area: clean(b.location), price_range: clean(b.budget), financing: clean(b.payment_plan),
  // Everything the lead told us, so Maya can skip questions they already answered.
  message: [b.location && 'Location: ' + clean(b.location), b.budget && 'Budget: ' + clean(b.budget),
    b.payment_plan && 'Payment: ' + clean(b.payment_plan), b.based_in && 'Based: ' + clean(b.based_in), clean(b.message)].filter(Boolean).join('. '),
  consent_call: consentCall, consent_whatsapp: consentWa,
  consent_text: clean(b.consent_text), source_page: clean(b.source_page),
  status, attempts: 0,
} }];
`),
  node('Save lead', 'n8n-nodes-base.dataTable', 1.1, [440, 300], { resource: 'row', operation: 'insert', dataTableId: TABLE, columns: autoMap }),
  respond('Reply to form', [660, 300], `={{ (() => { const l = $('Validate lead').item.json;
  const wa = ['whatsapp_invited', 'no_telephony'].includes(l.status)
    ? 'https://wa.me/' + ${JSON.stringify(String(CFG.BUSINESS_WHATSAPP || '').replace(/\D/g, ''))} + '?text=' + encodeURIComponent('Hi Maya, I just sent an inquiry (ref ' + l.lead_id + ')')
    : null;
  return JSON.stringify({ ok: true, lead_id: l.lead_id, status: l.status, whatsapp_link: ${JSON.stringify(Boolean(CFG.BUSINESS_WHATSAPP))} ? wa : null }); })() }}`),
  node('Route', 'n8n-nodes-base.switch', 3.2, [880, 300], {
    rules: { values: [
      { outputKey: 'dial', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
        conditions: [{ id: 'r1', leftValue: "={{ $('Validate lead').item.json.status }}", rightValue: 'queued', operator: { type: 'string', operation: 'equals' } }] } },
      { outputKey: 'whatsapp', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
        conditions: [{ id: 'r2', leftValue: "={{ $('Validate lead').item.json.status }}", rightValue: 'no_telephony', operator: { type: 'string', operation: 'equals' } }] } },
    ] },
    options: { fallbackOutput: 'none' },
  }),
  code('Prepare call', [1100, 200], buildCallPayload + `
const lead = $('Validate lead').first().json;
return [{ json: { call_payload: buildCallPayload(lead), dial_started_ms: Date.now() } }];
`),
  elevenCall('Call lead (ElevenLabs)', [1320, 200]),
  code('Mark calling', [1540, 120], `
const lead = $('Validate lead').first().json;
const res = $input.first().json;
const now = new Date();
return [{ json: {
  lead_id: lead.lead_id, status: 'calling', attempts: 1,
  conversation_id: res.conversation_id || '', dialed_at: now.toISOString(), updated_at: now.toISOString(),
  seconds_to_first_dial: Math.round((now - new Date(lead.received_at)) / 100) / 10,
} }];
`),
  upsert('Save call started', [1760, 120]),
  code('Fallback: why', [1540, 380], `
const lead = $('Validate lead').first().json;
const err = $input.first().json.error;
const reason = lead.status === 'no_telephony' ? 'Calling not set up (no ElevenLabs/Twilio number)' :
  'Call could not be placed: ' + (err && (err.message || JSON.stringify(err)) || 'unknown error').slice(0, 200);
return [{ json: { lead_id: lead.lead_id, status: 'whatsapp_fallback', fallback_reason: reason, updated_at: new Date().toISOString() } }];
`),
  upsert('Save fallback', [1760, 380]),
  code('Build WhatsApp', [1980, 380], buildWhatsApp + `
const lead = $('Validate lead').first().json;
return whatsappItems(lead, $('Fallback: why').first().json.fallback_reason, lead.message);
`),
  whatsappSend('Send WhatsApp', [2200, 380]),
  code('Build alert', [1980, 540], buildWhatsApp + `
const lead = $('Validate lead').first().json;
return alertItems(lead, $('Fallback: why').first().json.fallback_reason, lead.message);
`),
  telegramSend('Telegram alert', [2200, 540]),
];
const intakeConnections = {
  'Form submitted': link('Validate lead'),
  'Validate lead': link('Save lead'),
  'Save lead': link('Reply to form'),
  'Reply to form': link('Route'),
  Route: link2('Prepare call', 'Fallback: why'),
  'Prepare call': link('Call lead (ElevenLabs)'),
  'Call lead (ElevenLabs)': link2('Mark calling', 'Fallback: why'),
  'Mark calling': link('Save call started'),
  'Fallback: why': link('Save fallback'),
  'Save fallback': link('Build WhatsApp', 'Build alert'),
  'Build WhatsApp': link('Send WhatsApp'),
  'Build alert': link('Telegram alert'),
};

// Workflow 2: agent tools + post-call ----------------------------------------
id = 0;
const auth = (name, pos) => ifNode(name, pos, `={{ $json.headers['x-tool-secret'] }}`, CFG.TOOL_SECRET);
const toolNodes = [
  // score_lead
  webhook('score_lead called', [0, 0], 're-agent-tools/score-lead', 'responseNode'),
  auth('Score: authorized?', [220, 0]),
  leadLookup('Find lead to score', [440, -60]),
  code('Score lead', [660, -60], scoringSrc + `
const a = $('score_lead called').first().json.body || {};
const found = $input.first().json || {};
const r = scoreLead(a);
const now = new Date().toISOString();
// Someone who called Maya directly without the form becomes a new lead keyed on their number.
const walkIn = !found.lead_id;
const callerPhone = '+' + String(a.caller_id || '').replace(/\\D/g, '');
return [{ json: {
  ...(walkIn ? { received_at: now, phone: callerPhone, first_name: a.first_name || '', attempts: 0 } : {}),
  lead_id: found.lead_id || ('W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
  conversation_id: a.conversation_id || '',
  intent: a.intent || '', timeline: a.timeline || '', financing: a.financing || '', seller_motivation: a.seller_motivation || '',
  price_range: a.price_range || '', area: a.area || '', notes: a.notes || '',
  score: r.score, tier: a.opt_out ? 'dnc' : r.tier, score_reasons: r.reasons.join('; '),
  next_action: a.opt_out ? 'Confirm they will not be contacted again, then end the call.' : r.next_action,
  status: a.opt_out ? 'dnc' : 'scored', updated_at: new Date().toISOString(),
} }];
`),
  upsert('Save score', [880, -60]),
  respond('Return tier', [1100, -60], `={{ JSON.stringify({ tier: $('Score lead').item.json.tier, score: $('Score lead').item.json.score, next_action: $('Score lead').item.json.next_action }) }}`),
  respond('Score: 401', [440, 80], '={{ JSON.stringify({ error: "unauthorized" }) }}', 401),

  // book_consultation
  webhook('book_consultation called', [0, 320], 're-agent-tools/book-consultation', 'responseNode'),
  auth('Book: authorized?', [220, 320]),
  leadLookup('Get lead for booking', [440, 260]),
  { ...code('Build event', [660, 260], `
const b = $('book_consultation called').first().json.body;
const lead = $input.first().json || {};
const start = new Date(b.preferred_start);
if (!lead.lead_id) throw new Error('No lead found to book for (call score_lead first)');
if (isNaN(start)) throw new Error('preferred_start is not a valid date: ' + b.preferred_start);
const end = new Date(start.getTime() + CFG.MEETING_MINUTES * 60000);
const label = { site_inspection: 'Site inspection', virtual_inspection: 'Virtual inspection', consultation: 'Consultation' }[b.meeting_type] || 'Consultation';
return [{ json: {
  start: start.toISOString(), end: end.toISOString(),
  summary: label + ': ' + (lead.first_name || '') + ' ' + (lead.last_name || '') + ' (' + (lead.tier || '?') + ')',
  description: 'Lead ' + b.lead_id + '\\nPhone: ' + (lead.phone || '') + '\\nIntent: ' + (lead.intent || '') + ', timeline: ' + (lead.timeline || '') +
    '\\nPrice: ' + (lead.price_range || '') + '\\nArea: ' + (lead.area || '') + '\\nNotes: ' + (lead.notes || ''),
  attendee: b.email || lead.email || '', lead_id: lead.lead_id,
} }];
`), onError: 'continueErrorOutput' },
  node('Create calendar event', 'n8n-nodes-base.googleCalendar', 1.3, [880, 260], {
    calendar: { __rl: true, mode: 'list', value: CFG.GOOGLE_CALENDAR_ID, cachedResultName: CFG.GOOGLE_CALENDAR_ID }, // calendar owner's email
    start: '={{ $json.start }}', end: '={{ $json.end }}',
    additionalFields: { summary: '={{ $json.summary }}', description: '={{ $json.description }}', attendees: ['={{ $json.attendee }}'], sendUpdates: 'all' },
  }, { ...cred('googleCalendarOAuth2Api', 'CRED_GOOGLE_CALENDAR', 'Google Calendar account'), onError: 'continueErrorOutput' }),
  code('Mark booked', [1100, 200], `
const ev = $('Build event').first().json;
return [{ json: { lead_id: ev.lead_id, booked_slot: ev.start, status: 'booked', outcome: 'booked', updated_at: new Date().toISOString() } }];
`),
  upsert('Save booking', [1320, 200]),
  respond('Return booked', [1540, 200], `={{ JSON.stringify({ booked: true, start: $('Build event').item.json.start, message: 'Booked. Confirm the day and time back to the lead and say a calendar invite is on its way.' }) }}`),
  respond('Return not booked', [1100, 360], `={{ JSON.stringify({ booked: false, message: 'Could not book that time automatically. Tell the lead an agent will email them today to confirm a time.' }) }}`),
  respond('Book: 401', [440, 420], '={{ JSON.stringify({ error: "unauthorized" }) }}', 401),

  // post-call
  webhook('ElevenLabs post-call', [0, 700], 're-elevenlabs-postcall', 'onReceived', { rawBody: true }),
  code('Parse post-call', [220, 700], `
const item = $input.first();
const headers = item.json.headers || {};
const body = item.json.body || {};
// HMAC check (ElevenLabs header "elevenlabs-signature: t=<ts>,v0=<hex>").
let verified = 'skipped';
if (CFG.ELEVENLABS_WEBHOOK_SECRET) {
  try {
    const crypto = require('crypto');
    const hasRaw = Boolean(item.binary && item.binary.data);
    const raw = hasRaw ? (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8') : JSON.stringify(body);
    const parts = Object.fromEntries(String(headers['elevenlabs-signature'] || '').split(',').map(p => p.split('=')));
    const expected = 'v0=' + crypto.createHmac('sha256', CFG.ELEVENLABS_WEBHOOK_SECRET).update(parts.t + '.' + raw).digest('hex');
    if ('v0=' + parts.v0 !== expected) {
      if (hasRaw) throw new Error('bad signature');
      throw new Error('unverifiable: raw body not available'); // re-serialized JSON may differ; don't drop the call
    }
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 1800) throw new Error('stale signature');
    verified = 'ok';
  } catch (e) {
    if (e.message === 'bad signature' || e.message === 'stale signature') throw e;
    verified = 'unavailable: ' + e.message; // e.g. crypto not allowed in this n8n
  }
}
const d = body.data || {};
const dyn = ((d.conversation_initiation_client_data || {}).dynamic_variables) || {};
const dc = ((d.analysis || {}).data_collection_results) || {};
const val = (k) => (dc[k] && dc[k].value != null ? dc[k].value : null);
const transcript = (d.transcript || []).map(t => (t.role === 'agent' ? 'Maya' : 'Lead') + ': ' + (t.message || '')).join('\\n');
return [{ json: {
  event_type: body.type, signature: verified,
  lead_id: ['none', 'test-lead'].includes(dyn.lead_id) ? '' : (dyn.lead_id || ''), conversation_id: d.conversation_id || '',
  failure_reason: d.failure_reason || '',
  duration_secs: (d.metadata || {}).call_duration_secs || 0,
  summary: ((d.analysis || {}).transcript_summary) || '',
  transcript: transcript.slice(0, 20000),
  transfer_connected: val('transfer_connected') === true || val('transfer_connected') === 'true',
  booked_slot: val('booked_slot') || '',
  opted_out: val('opted_out') === true || val('opted_out') === 'true',
} }];
`),
  node('Get lead', 'n8n-nodes-base.dataTable', 1.1, [440, 700], {
    resource: 'row', operation: 'get', dataTableId: TABLE,
    filters: { conditions: [{ keyName: "={{ $json.lead_id ? 'lead_id' : 'conversation_id' }}", condition: 'eq', keyValue: '={{ $json.lead_id || $json.conversation_id }}' }] },
  }, { alwaysOutputData: true }),
  code('Decide outcome', [660, 700], `
const e = $('Parse post-call').first().json;
const lead = $input.first().json || {};
if (!lead.lead_id) return []; // never scored (e.g. hung up immediately): nothing to update
const attempts = Number(lead.attempts || 1);
let outcome;
if (e.event_type === 'call_initiation_failure') {
  const unanswered = ['busy', 'no-answer', 'no_answer'].includes(e.failure_reason);
  outcome = unanswered ? (attempts < CFG.MAX_ATTEMPTS ? 'retry' : 'unreachable') : 'call_failed';
} else if (e.opted_out || lead.tier === 'dnc') outcome = 'dnc';
else if (e.transfer_connected) outcome = 'transferred';
else if (e.booked_slot || lead.booked_slot) outcome = 'booked';
else if (lead.tier === 'hot') outcome = 'transfer_missed';
else if (lead.tier === 'warm') outcome = 'warm_no_booking';
else if (lead.tier === 'cold') outcome = 'nurture';
else outcome = e.duration_secs < 20 ? (attempts < CFG.MAX_ATTEMPTS ? 'retry' : 'unreachable') : 'unscored';
const row = {
  lead_id: lead.lead_id, outcome, status: outcome === 'retry' ? 'retry_scheduled' : 'done',
  updated_at: new Date().toISOString(),
};
if (e.event_type !== 'call_initiation_failure') Object.assign(row, {
  summary: e.summary, transcript: e.transcript, duration_secs: e.duration_secs,
  booked_slot: e.booked_slot || lead.booked_slot || '',
});
return [{ json: row }];
`),
  upsert('Save outcome', [880, 700]),
  node('Next step', 'n8n-nodes-base.switch', 3.2, [1100, 700], {
    rules: { values: [
      { outputKey: 'retry', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and',
        conditions: [{ id: 's1', leftValue: "={{ $('Decide outcome').item.json.outcome }}", rightValue: 'retry', operator: { type: 'string', operation: 'equals' } }] } },
      { outputKey: 'whatsapp', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'or',
        conditions: ['transfer_missed', 'call_failed', 'unreachable'].map((v, i) => ({ id: 'w' + i, leftValue: "={{ $('Decide outcome').item.json.outcome }}", rightValue: v, operator: { type: 'string', operation: 'equals' } })) } },
    ] },
    options: { fallbackOutput: 'none' },
  }),
  node('Wait before retry', 'n8n-nodes-base.wait', 1.1, [1320, 600], { amount: CFG.RETRY_MINUTES, unit: 'minutes' }),
  code('Prepare retry', [1540, 600], buildCallPayload + `
const lead = $('Get lead').first().json;
return [{ json: { call_payload: buildCallPayload(lead) } }];
`),
  elevenCall('Call lead again', [1760, 600]),
  code('Mark retry', [1980, 540], `
const lead = $('Get lead').first().json;
return [{ json: { lead_id: lead.lead_id, conversation_id: $input.first().json.conversation_id || '', attempts: Number(lead.attempts || 1) + 1, status: 'calling', updated_at: new Date().toISOString() } }];
`),
  upsert('Save retry', [2200, 540]),
  code('Build WhatsApp', [1320, 820], buildWhatsApp + `
const lead = Object.assign({}, $('Get lead').first().json);
const e = $('Parse post-call').first().json;
const o = $('Decide outcome').first().json.outcome;
const reason = o === 'transfer_missed' ? 'HOT lead - live transfer to you did not connect. Call back now.'
  : o === 'unreachable' ? 'Lead did not answer after ' + CFG.MAX_ATTEMPTS + ' attempts.'
  : 'AI call failed: ' + (e.failure_reason || 'unknown');
return whatsappItems(lead, reason, e.summary);
`),
  whatsappSend('Send WhatsApp', [1540, 820]),
  code('Build alert', [1320, 980], buildWhatsApp + `
const lead = Object.assign({}, $('Get lead').first().json);
const e = $('Parse post-call').first().json;
const o = $('Decide outcome').first().json.outcome;
const reason = o === 'transfer_missed' ? '🔥 HOT lead: live transfer did not happen. Call them back now.'
  : o === 'unreachable' ? 'Lead did not answer after ' + CFG.MAX_ATTEMPTS + ' attempts.'
  : o === 'retry' ? 'Retry call could not be placed.'
  : 'AI call failed: ' + (e.failure_reason || 'unknown');
return alertItems(lead, reason, e.summary);
`),
  telegramSend('Telegram alert', [1540, 980]),
];
const toolConnections = {
  'score_lead called': link('Score: authorized?'),
  'Score: authorized?': link2('Find lead to score', 'Score: 401'),
  'Find lead to score': link('Score lead'),
  'Score lead': link('Save score'),
  'Save score': link('Return tier'),
  'book_consultation called': link('Book: authorized?'),
  'Book: authorized?': link2('Get lead for booking', 'Book: 401'),
  'Get lead for booking': link('Build event'),
  'Build event': link2('Create calendar event', 'Return not booked'),
  'Create calendar event': link2('Mark booked', 'Return not booked'),
  'Mark booked': link('Save booking'),
  'Save booking': link('Return booked'),
  'ElevenLabs post-call': link('Parse post-call'),
  'Parse post-call': link('Get lead'),
  'Get lead': link('Decide outcome'),
  'Decide outcome': link('Save outcome'),
  'Save outcome': link('Next step'),
  'Next step': { main: [[{ node: 'Wait before retry', type: 'main', index: 0 }], [{ node: 'Build WhatsApp', type: 'main', index: 0 }, { node: 'Build alert', type: 'main', index: 0 }]] },
  'Wait before retry': link('Prepare retry'),
  'Prepare retry': link('Call lead again'),
  'Call lead again': { main: [[{ node: 'Mark retry', type: 'main', index: 0 }], [{ node: 'Build WhatsApp', type: 'main', index: 0 }, { node: 'Build alert', type: 'main', index: 0 }]] },
  'Mark retry': link('Save retry'),
  'Build WhatsApp': link('Send WhatsApp'),
  'Build alert': link('Telegram alert'),
};

const settings = { executionOrder: 'v1', timezone: CFG.TIMEZONE };
mkdirSync(join(root, 'n8n/build'), { recursive: true });
writeFileSync(join(root, 'n8n/build/lead-intake.json'), JSON.stringify({ name: 'RE Speed-to-Lead: Intake', nodes: intakeNodes, connections: intakeConnections, settings }, null, 2));
writeFileSync(join(root, 'n8n/build/agent-tools-and-postcall.json'), JSON.stringify({ name: 'RE Speed-to-Lead: Agent tools + post-call', nodes: toolNodes, connections: toolConnections, settings }, null, 2));
console.log(`Built from ${cfgPath}: n8n/build/lead-intake.json (${intakeNodes.length} nodes), n8n/build/agent-tools-and-postcall.json (${toolNodes.length} nodes)`);
