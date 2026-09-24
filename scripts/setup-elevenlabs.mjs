#!/usr/bin/env node
// Creates the ElevenLabs Agents resources for the speed-to-lead demo:
// two webhook tools (score_lead, book_consultation) and the "Joy" agent with
// transfer_to_number + end_call system tools and post-call data collection.
//
// Usage:
//   node scripts/setup-elevenlabs.mjs --dry-run      # print payloads, call nothing
//   ELEVENLABS_API_KEY=... TRANSFER_NUMBER=+1... N8N_BASE_URL=https://x.app \
//     node scripts/setup-elevenlabs.mjs
//
// Env:
//   ELEVENLABS_API_KEY  required (unless --dry-run)
//   TRANSFER_NUMBER     optional: the human rep's phone, E.164. Without it Joy has no live transfer
//                       (she promises a callback and the team is alerted instead).
//   N8N_BASE_URL        n8n instance root, no trailing slash
//   VOICE_ID            optional ElevenLabs voice id
//   TOOL_SECRET         optional shared secret sent to n8n as x-tool-secret

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const API = 'https://api.elevenlabs.io/v1/convai';
const env = (k, fallback) => process.env[k] ?? fallback;

const n8n = env('N8N_BASE_URL', 'https://YOUR-N8N.example.com');
const transferNumber = env('TRANSFER_NUMBER', '');
const toolHeaders = { 'x-tool-secret': env('TOOL_SECRET', 'change-me') };
if (!dryRun) {
  for (const k of ['ELEVENLABS_API_KEY', 'N8N_BASE_URL']) {
    if (!process.env[k]) throw new Error(`Missing env ${k}`);
  }
  if (transferNumber && !/^\+[1-9]\d{7,14}$/.test(transferNumber)) throw new Error('TRANSFER_NUMBER must be E.164');
}

// No custom dynamic variables: inbound WhatsApp conversations don't supply them, and
// ElevenLabs refuses to start if the first message or tools need one. Only system__ vars.
// The lead is matched in n8n by lead_ref (the "ref L…" code in the first WhatsApp
// message), else by caller number.
const leadRef = { type: 'string', description: 'Enquiry reference if the person mentioned one, e.g. "Lmue5fi0ixy5st" from "ref Lmue5fi0ixy5st". Empty if none. Never ask for it.' };
const conversationId = { type: 'string', dynamic_variable: 'system__conversation_id' };
// The caller's number/WhatsApp id: how n8n finds the lead when the person called Joy themselves.
const callerId = { type: 'string', dynamic_variable: 'system__caller_id' };

const scoreLeadTool = {
  tool_config: {
    type: 'webhook',
    name: 'score_lead',
    description: 'Score the lead after qualifying. Required before routing. Returns tier (hot/warm/cold) and next_action to follow exactly.',
    response_timeout_secs: 10,
    api_schema: {
      url: `${n8n}/webhook/re-agent-tools/score-lead`,
      method: 'POST',
      request_headers: toolHeaders,
      request_body_schema: {
        type: 'object',
        properties: {
          lead_ref: leadRef,
          conversation_id: conversationId,
          caller_id: callerId,
          first_name: { type: 'string', description: 'Their first name, if they told you' },
          intent: { type: 'string', enum: ['buy', 'invest', 'sell', 'both', 'rent', 'unknown'], description: 'buy = to live in; invest = land banking or rental income' },
          timeline: { type: 'string', enum: ['under_30_days', '1_3_months', '3_6_months', '6_plus_months', 'unknown'], description: 'When they want to move' },
          financing: { type: 'string', enum: ['outright', 'deposit_ready', 'mortgage_in_progress', 'not_started', 'unknown'], description: 'outright = full payment; deposit_ready = can pay the initial deposit of a payment plan now; mortgage_in_progress = mortgage/NHF/cooperative loan underway' },
          seller_motivation: { type: 'string', enum: ['must_move', 'already_bought', 'upsizing_downsizing', 'testing_market', 'unknown'], description: 'Seller reason; unknown for pure buyers' },
          price_range: { type: 'string', description: 'Budget in naira (or foreign currency if abroad), in their words' },
          budget_in_range: { type: 'boolean', description: 'True if the budget is at least 15 million naira (our lowest plot price); omit if unknown' },
          area: { type: 'string', description: 'Areas mentioned, e.g. Ibeju-Lekki, Sangotedo, Lekki Phase 1, Guzape' },
          based_abroad: { type: 'boolean', description: 'True if they live outside Nigeria (diaspora)' },
          in_service_area: { type: 'boolean', description: 'True if they want Lagos (Lekki-Epe corridor, Ajah, Lekki, Ikoyi/VI) or Abuja' },
          decision_makers: { type: 'string', enum: ['all_aligned', 'needs_partner', 'unknown'], description: 'Whether everyone involved in the decision is aligned' },
          has_agent: { type: 'boolean', description: 'True if already under a signed agreement with another agent' },
          opt_out: { type: 'boolean', description: 'True if the person asked not to be called again' },
          notes: { type: 'string', description: 'One or two sentences of useful context for the human agent' },
        },
        required: ['conversation_id', 'intent', 'timeline'],
      },
    },
  },
};

const bookTool = {
  tool_config: {
    type: 'webhook',
    name: 'book_consultation',
    description: 'Book a consultation with an agent once the lead has chosen a day and time. Returns the confirmed slot or alternatives.',
    response_timeout_secs: 15,
    api_schema: {
      url: `${n8n}/webhook/re-agent-tools/book-consultation`,
      method: 'POST',
      request_headers: toolHeaders,
      request_body_schema: {
        type: 'object',
        properties: {
          lead_ref: leadRef,
          conversation_id: conversationId,
          caller_id: callerId,
          preferred_start: { type: 'string', description: 'Requested start as ISO 8601 with Lagos offset, e.g. 2026-09-26T10:00:00+01:00' },
          meeting_type: { type: 'string', enum: ['site_inspection', 'virtual_inspection', 'consultation'], description: 'site_inspection = in person at the estate; virtual_inspection = video call walk-through (diaspora); consultation = call with an agent' },
          email: { type: 'string', description: 'Email to send the invite to, if the lead gave a different one' },
        },
        required: ['conversation_id', 'preferred_start', 'meeting_type'],
      },
    },
  },
};

const prompt = readFileSync(join(root, 'agent/system-prompt.md'), 'utf8');

const agentBody = (toolIds) => ({
  name: 'Joy - Oriki Homes Speed-to-Lead',
  conversation_config: {
    agent: {
      // Works both when we call them and when they call Joy from the WhatsApp button.
      first_message: 'Hello, this is Joy, an AI assistant with Oriki Homes. Thank you for reaching out! Do you have two minutes for a few quick questions?',
      language: 'en',
      prompt: {
        prompt,
        llm: 'gpt-4o',
        temperature: 0.3,
        tool_ids: toolIds,
        built_in_tools: {
          ...(transferNumber ? { transfer_to_number: {
            name: 'transfer_to_number',
            params: {
              system_tool_type: 'transfer_to_number',
              enable_client_message: true,
              transfers: [{
                transfer_destination: { type: 'phone', phone_number: transferNumber },
                condition: 'Only after score_lead returned tier "hot" AND the lead agreed to speak with an agent now.',
                transfer_type: 'conference',
              }],
            },
          } } : {}),
          end_call: { name: 'end_call', params: { system_tool_type: 'end_call' } },
          voicemail_detection: { name: 'voicemail_detection', params: { system_tool_type: 'voicemail_detection' } },
        },
      },
    },
    tts: { voice_id: env('VOICE_ID', 'gM1otA87NrAmOwyCoJE6'), model_id: 'eleven_flash_v2' }, // Kehinde: natural, engaging (chosen by Benjamin)
    conversation: { max_duration_seconds: 300 },
  },
  platform_settings: {
    // Public agent (the website voice panel starts sessions with the agent id), so cap abuse:
    // only listed sites may connect, and calls are limited in number and length.
    auth: { enable_auth: false, allowlist: env('ALLOWED_HOSTS', 'localhost,oriki-homes.onrender.com').split(',').map((hostname) => ({ hostname: hostname.trim() })) },
    call_limits: { agent_concurrency_limit: 2, daily_limit: 40, bursting_enabled: false },
    data_collection: {
      intent: { type: 'string', description: 'buy, invest, sell, both, rent, or unknown' },
      timeline: { type: 'string', description: 'under_30_days, 1_3_months, 3_6_months, 6_plus_months, or unknown' },
      price_range: { type: 'string', description: 'Budget or expected sale price as stated' },
      area: { type: 'string', description: 'Neighborhoods or cities mentioned' },
      transfer_connected: { type: 'boolean', description: 'True only if the call was actually connected to a human agent' },
      booked_slot: { type: 'string', description: 'ISO start time of a booked consultation, empty if none' },
      opted_out: { type: 'boolean', description: 'True if the lead asked not to be contacted again' },
    },
    evaluation: {
      criteria: [
        { id: 'ai_disclosed', name: 'AI disclosed', type: 'prompt', conversation_goal_prompt: 'The assistant clearly said it is an AI assistant near the start of the call.' },
        { id: 'routed_correctly', name: 'Routed per score', type: 'prompt', conversation_goal_prompt: 'The assistant called score_lead before routing and then followed its next_action.' },
      ],
    },
  },
});

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

if (dryRun) {
  console.log(JSON.stringify({ scoreLeadTool, bookTool, agent: agentBody(['<score_lead id>', '<book_consultation id>']) }, null, 2));
} else {
  const score = await post('/tools', scoreLeadTool);
  const book = await post('/tools', bookTool);
  const agent = await post('/agents/create', agentBody([score.id, book.id]));
  console.log(`SCORE_LEAD_TOOL_ID=${score.id}\nBOOK_TOOL_ID=${book.id}\nELEVENLABS_AGENT_ID=${agent.agent_id}`);
}
