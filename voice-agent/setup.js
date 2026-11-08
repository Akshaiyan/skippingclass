// Creates the Aegis agent on ElevenLabs (first run) or updates it (later runs),
// using the settings in aegis.config.js. Saves the agent ID to .env.
// Run with `npm run setup`, which loads ELEVENLABS_API_KEY from .env.

import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import aegis from "./aegis.config.js";
import { buildClaimsKnowledge } from "./claims.js";
import { loadEnv, setEnvVar, hasRealKey, describeError } from "./lib.js";

if (!hasRealKey(process.env.ELEVENLABS_API_KEY)) {
  console.error("\n  No API key in .env. Run: npx -y @elevenlabs/cli@latest onboard init\n");
  process.exit(1);
}

const elevenlabs = new ElevenLabsClient();

// Policy + every case in knowledge/, with v1 results already computed and checked.
const claims = buildClaimsKnowledge();
const fullPrompt = `${aegis.prompt}\n\n${claims.text}`;

// Client tools run in the browser (see aegis.config.js). The agent only needs their name and shape;
// expects_response makes it wait for the string the browser returns, so it can say what happened.
const clientTools = (aegis.tools ?? []).map((t) => ({
  type: "client",
  name: t.name,
  description: t.description,
  expects_response: true,
  response_timeout_secs: 10,
  ...(t.parameters ? { parameters: { type: "object", required: t.required ?? [], properties: t.parameters } } : {}),
}));

// realtime: the model ID, null (switch an existing agent back to llm + ttsModel), or
// undefined (leave the field out, for accounts that don't have Realtime yet).
function conversationConfig({ realtime, speculative }) {
  const tts = { model_id: aegis.ttsModel };
  if (aegis.voiceId) tts.voice_id = aegis.voiceId;

  const turn = { turn_eagerness: aegis.turnEagerness };
  if (aegis.turnTimeout !== undefined) turn.turn_timeout = aegis.turnTimeout;
  // Starts drafting a reply while you're still finishing your sentence.
  if (speculative) turn.speculative_turn = true;

  const config = {
    agent: {
      first_message: aegis.firstMessage,
      language: "en",
      prompt: { prompt: fullPrompt, llm: aegis.llm, temperature: aegis.temperature, tools: clientTools },
    },
    tts,
    turn,
  };
  if (realtime !== undefined) config.realtime_model = realtime;
  return config;
}

// The SDK's typed models don't include realtime_model yet, and it strips fields it
// doesn't know. So conversation_config goes over the wire as-is, in its API (snake_case)
// form, through additionalBodyParameters; the SDK still handles auth, retries and errors.
async function save(agentId, opts) {
  const raw = { additionalBodyParameters: { conversation_config: conversationConfig(opts) } };
  if (agentId) {
    await elevenlabs.conversationalAi.agents.update(agentId, { name: aegis.name }, raw);
    return agentId;
  }
  const created = await elevenlabs.conversationalAi.agents.create({ name: aegis.name, conversationConfig: {} }, raw);
  return created.agentId;
}

const errorText = (err) => JSON.stringify(err.body ?? err.message ?? "");

const savedId = loadEnv().AGENT_ID || null;
let agentId = savedId;
const opts = { realtime: aegis.realtimeModel ?? null, speculative: true };

for (let attempt = 0; ; attempt++) {
  try {
    agentId = await save(agentId, opts);
    break;
  } catch (err) {
    if (!(err instanceof ElevenLabsError) || attempt >= 4) throw err;
    const text = errorText(err);

    if (agentId && err.statusCode === 404) {
      console.log("  Saved agent not found on ElevenLabs, creating a new one...");
      agentId = null;
    } else if (opts.realtime !== undefined && /realtime/i.test(text)) {
      if (opts.realtime) console.log("  Realtime models aren't available on this account yet, using the llm + ttsModel from aegis.config.js.");
      opts.realtime = undefined;
    } else if (opts.speculative && /speculative_turn/.test(text)) {
      console.log("  Speculative turns aren't available on this account, continuing without them.");
      opts.speculative = false;
    } else {
      console.error(`\n  ElevenLabs rejected the request (${describeError(err.statusCode, err.body)})\n`);
      process.exit(1);
    }
  }
}

const created = agentId !== savedId;
if (created) setEnvVar("AGENT_ID", agentId);

// Read the agent back to report which voice mode actually took effect.
const agent = await elevenlabs.conversationalAi.agents.get(agentId);
const cc = agent.conversationConfig ?? {};
const realtimeModel = cc.realtimeModel ?? cc.realtime_model;
const mode = realtimeModel ? `Realtime (${realtimeModel})` : `Custom (${aegis.llm} + ${aegis.ttsModel})`;

console.log(`\n  ${created ? "Created" : "Updated"} ${aegis.name} (${agentId}), saved to .env`);
console.log(`  Voice mode: ${mode}`);
console.log(`  Claims knowledge: ${claims.caseCount} cases loaded from knowledge/`);
const savedTools = (cc.agent?.prompt?.tools ?? []).map((t) => t.name);
console.log(`  App tools on the agent: ${savedTools.length ? savedTools.join(", ") : "none"}${savedTools.length === clientTools.length ? "" : "  (expected " + clientTools.length + ")"}`);
if (claims.score) {
  const s = claims.score;
  console.log(`  Policy v1 check on labelled cases: ${s.correct}/${s.total} correct, ${s.wrongRoutine} wrong routine_processing, ${s.needlessReview} unnecessary human_review`);
  if (s.misses.length) console.log(`  Mismatches: ${s.misses.join("; ")}`);
}
console.log("  Now run: npm start\n");
