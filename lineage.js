// FrontierWatch — lineage evidence.
// Chat-template tokens and assistant UI markup survive scraping and pasting, so they can name a model
// family even when the model itself is private, fine-tuned or unreleased. Model IDs are triaged against
// the public frontier so builds newer than anything released stand out.

'use strict';

const FW_STATUS = {
  public: 'Public release',
  unlisted: 'Not in the public catalog',
  'pre-release': 'Pre-release variant',
  'internal-build': 'Internal or unreleased build',
  'beyond-frontier': 'Newer than any public release',
  'private-fine-tune': 'Private fine-tune',
  stealth: 'Stealth model — lab withheld',
  'unknown-model': 'Unknown model',
  local: 'Self-hosted model'
};

// Latest public version per family as of FW_CATALOG_DATE. Anything higher is unreleased or spoofed.
// The trailing lookahead keeps parameter counts ("Qwen-72B") from reading as versions.
const FW_FRONTIER = [
  { family: 'GPT', lab: 'openai', latest: 6, latestName: 'GPT-6 Astra', re: /\bgpt[ _-]?(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'Claude', lab: 'anthropic', latest: 5.1, latestName: 'Claude Fable 5.1', re: /\bclaude[ _-]?(?:opus|sonnet|haiku|fable|mythos)[ _-]?(\d)(?:[.-](\d)(?!\d))?(?!\d)/i },
  { family: 'Claude', lab: 'anthropic', latest: 5.1, latestName: 'Claude Fable 5.1', re: /\bclaude[ _-]?(\d)(?:[.-](\d)(?!\d))?[ _-]?(?:opus|sonnet|haiku)\b/i },
  { family: 'Gemini', lab: 'google', latest: 3.8, latestName: 'Gemini 3.8 Flash', re: /\bgemini[ _-]?(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'Grok', lab: 'xai', latest: 4.7, latestName: 'Grok 4.7', re: /\bgrok[ _-]?(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'DeepSeek-V', lab: 'deepseek', latest: 4.1, latestName: 'DeepSeek-V4.1', re: /\bdeepseek[ _-]?v(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'DeepSeek-R', lab: 'deepseek', latest: 1, latestName: 'DeepSeek-R1', re: /\bdeepseek[ _-]?r(\d)(?!\d)/i },
  { family: 'Qwen', lab: 'alibaba', latest: 3.8, latestName: 'Qwen3.8', re: /\bqwen[ _-]?(\d{1,2})(?:\.(\d))?(?!\d|[bmk](?![a-z]))/i },
  { family: 'Kimi', lab: 'moonshot', latest: 3, latestName: 'Kimi K3', re: /\bkimi[ _-]?k(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'GLM', lab: 'zai', latest: 5.3, latestName: 'GLM-5.3', re: /\bglm[ _-]?(\d{1,2})(?:\.(\d))?(?!\d|[bmk](?![a-z]))/i },
  { family: 'Llama', lab: 'meta', latest: 4, latestName: 'Llama 4', re: /\bllama[ _-]?(\d{1,2})(?:\.(\d))?(?!\d|[bmk](?![a-z]))/i },
  { family: 'Muse Spark', lab: 'meta', latest: 1.3, latestName: 'Muse Spark 1.3', re: /\bmuse[ _-]?spark[ _-]?(\d{1,2})(?:\.(\d))?(?!\d)/i },
  { family: 'Nemotron', lab: 'nvidia', latest: 3.5, latestName: 'Nemotron 3.5', re: /\bnemotron[ _-]?(\d{1,2})(?:\.(\d))?(?!\d|[bmk](?![a-z]))/i },
  { family: 'Composer', lab: 'cursor', latest: 2.5, latestName: 'Composer 2.5', re: /^composer[ _-]?(\d{1,2})(?:\.(\d))?(?!\d)/i }
];
FW_FRONTIER.forEach(function (f) { f.reAll = new RegExp(f.re.source, 'gi'); });

// Special tokens from each family's chat template or tokenizer. A template listed in `subsumes`
// is skipped once the more specific one has matched.
const FW_TEMPLATES = [
  { id: 'harmony', name: 'OpenAI Harmony format', lab: 'openai', lineage: 'gpt-oss / Harmony response format', confidence: 92,
    re: /<\|start\|>(?:assistant|system|developer|user)|<\|channel\|>(?:analysis|commentary|final)/ },
  { id: 'deepseek', name: 'DeepSeek tokenizer tokens', lab: 'deepseek', lineage: 'DeepSeek V3 / R1 tokenizer', confidence: 92, subsumes: ['think'],
    re: /<｜(?:begin▁of▁sentence|end▁of▁sentence|User|Assistant|tool▁calls▁begin|tool▁call▁begin)｜>/ },
  { id: 'claude', name: 'Claude artifact markup', lab: 'anthropic', lineage: 'Claude.ai artifacts', confidence: 88,
    re: /<antArtifact\b|<antThinking>/ },
  { id: 'llama3', name: 'Llama 3 chat template', lab: 'meta', lineage: 'Llama 3 template (reused by many fine-tunes)', confidence: 78,
    re: /<\|(?:start_header_id|begin_of_text|eot_id)\|>/ },
  { id: 'llama2', name: 'Llama 2 system block', lab: 'meta', lineage: 'Llama 2 template', confidence: 72, subsumes: ['inst'],
    re: /<<SYS>>[\s\S]{0,4000}?<<\/SYS>>/ },
  { id: 'gemma', name: 'Gemma turn template', lab: 'google', lineage: 'Gemma open weights', confidence: 85,
    re: /<start_of_turn>(?:user|model)|<end_of_turn>/ },
  { id: 'command', name: 'Cohere Command template', lab: 'cohere', lineage: 'Command R / Command A', confidence: 90,
    re: /<\|(?:START_OF_TURN_TOKEN|CHATBOT_TOKEN|START_RESPONSE)\|>/ },
  { id: 'glm', name: 'GLM template', lab: 'zai', lineage: 'ChatGLM / GLM-4 and later', confidence: 85,
    re: /\[gMASK\]<sop>|<\|observation\|>/ },
  { id: 'kimi', name: 'Kimi template', lab: 'moonshot', lineage: 'Kimi K2 and later', confidence: 82,
    re: /<\|im_(?:middle|user|assistant|system)\|>/ },
  { id: 'granite', name: 'Granite role tokens', lab: 'ibm', lineage: 'IBM Granite 3 and later', confidence: 88,
    re: /<\|(?:start_of_role|end_of_role)\|>/ },
  { id: 'phi4', name: 'Phi-4 separator token', lab: 'microsoft', lineage: 'Phi-4', confidence: 80, subsumes: ['chatml'],
    re: /<\|im_sep\|>/ },
  { id: 'mistral', name: 'Mistral control tokens', lab: 'mistral', lineage: 'Mistral v3+ tokenizer', confidence: 80, subsumes: ['inst'],
    re: /\[(?:TOOL_CALLS|AVAILABLE_TOOLS|TOOL_RESULTS|SYSTEM_PROMPT)\]/ },
  { id: 'inst', name: '[INST] template', candidates: ['mistral', 'meta'], lineage: 'Mistral or Llama 2 [INST] format', confidence: 55,
    re: /\[INST\][\s\S]{1,4000}?\[\/INST\]/ },
  { id: 'chatml', name: 'ChatML template', candidates: ['alibaba', 'openai'], lineage: 'ChatML — Qwen default, reused by many open fine-tunes', confidence: 50,
    re: /<\|im_start\|>(?:system|user|assistant)/ },
  { id: 'think', name: 'Reasoning trace tags', candidates: ['deepseek', 'alibaba'], lineage: 'DeepSeek-R1 style <think> trace, also Qwen3 and many distills', confidence: 45,
    re: /<think>[\s\S]{24,}?<\/think>/ }
];

// Markup that assistant UIs leak into copied text, links and pasted HTML.
const FW_ARTIFACTS = [
  { id: 'oaicite', name: 'ChatGPT citation placeholder', lab: 'openai', product: 'ChatGPT', confidence: 96, re: /contentReference\[oaicite:\d+\]\{index=\d+\}/ },
  { id: 'oai-citation', name: 'ChatGPT oai_citation marker', lab: 'openai', product: 'ChatGPT', confidence: 94, re: /\boai_citation(?::\d+)?[‡:]/ },
  { id: 'turn-ref', name: 'ChatGPT search-turn marker', lab: 'openai', product: 'ChatGPT', confidence: 92, re: /(?:\b|cite|[\uE200-\uE206])turn\d+(?:search|fetch|news|view|file|image|product)\d+/ },
  { id: 'assistants-cite', name: 'OpenAI file-search citation', lab: 'openai', product: 'OpenAI Assistants', confidence: 90, re: /【\d+(?::\d+)?†[^】]{1,40}】/ },
  { id: 'sandbox', name: 'ChatGPT sandbox file link', lab: 'openai', product: 'ChatGPT', confidence: 88, re: /\bsandbox:\/mnt\/data\// },
  { id: 'attached-file', name: 'ChatGPT attached_file link', lab: 'openai', product: 'ChatGPT', confidence: 88, re: /\battached_file:\/\// },
  { id: 'utm-chatgpt', name: 'ChatGPT link tracking', lab: 'openai', product: 'ChatGPT', confidence: 90, re: /[?&]utm_source=chatgpt\.com\b/i },
  { id: 'utm-openai', name: 'OpenAI link tracking', lab: 'openai', product: 'OpenAI', confidence: 84, re: /[?&]utm_source=openai\b/i },
  { id: 'model-slug', name: 'ChatGPT model slug in pasted HTML', lab: 'openai', product: 'ChatGPT', confidence: 97, re: /data-message-model-slug="([\w.-]{2,60})"/, model: 1 },
  { id: 'author-role', name: 'ChatGPT message markup', lab: 'openai', product: 'ChatGPT', confidence: 88, re: /data-message-author-role="assistant"/ },
  { id: 'cite-start', name: 'Gemini citation tag', lab: 'google', product: 'Gemini', confidence: 90, re: /\[cite_start\]/ },
  { id: 'cite-ref', name: 'Gemini source reference', lab: 'google', product: 'Gemini', confidence: 70, re: /\[[Cc]ite:\s?\d+(?:,\s?\d+)*\]/ },
  { id: 'grounding', name: 'Gemini grounding redirect', lab: 'google', product: 'Gemini', confidence: 88, re: /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/ },
  { id: 'gemini-path', name: 'Gemini pasted-HTML attribute', lab: 'google', product: 'Gemini', confidence: 62, re: /data-path-to-node=/ },
  { id: 'claude-class', name: 'Claude response markup', lab: 'anthropic', product: 'Claude', confidence: 85, re: /font-claude-(?:response|message)/ },
  { id: 'grok-card', name: 'Grok card link', lab: 'xai', product: 'Grok', confidence: 90, re: /\bgrok_card:\/\// },
  { id: 'copilot-footnote', name: 'Copilot footnote marker', lab: 'microsoft', product: 'Microsoft Copilot', confidence: 72, re: /\[\^\d+\^\]/ },
  { id: 'utm-copilot', name: 'Copilot link tracking', lab: 'microsoft', product: 'Microsoft Copilot', confidence: 85, re: /[?&]utm_source=copilot\.com\b/i },
  { id: 'deepseek-cite', name: 'DeepSeek search citation', lab: 'deepseek', product: 'DeepSeek', confidence: 65, re: /\[citation:\d+\]/ }
];

// Organisation prefixes used by Hugging Face, OpenRouter, Vertex, Bedrock and Cloudflare model IDs.
const FW_ORG_LABS = {
  openai: 'openai', anthropic: 'anthropic', google: 'google', 'x-ai': 'xai', xai: 'xai',
  'deepseek-ai': 'deepseek', deepseek: 'deepseek', 'meta-llama': 'meta', meta: 'meta', facebook: 'meta',
  qwen: 'alibaba', alibaba: 'alibaba', 'alibaba-nlp': 'alibaba', moonshotai: 'moonshot', moonshot: 'moonshot',
  thudm: 'zai', 'zai-org': 'zai', 'z-ai': 'zai', zhipuai: 'zai', baidu: 'baidu', minimaxai: 'minimax', minimax: 'minimax',
  'bytedance-seed': 'bytedance', bytedance: 'bytedance', tencent: 'tencent', mistralai: 'mistral', mistral: 'mistral',
  nvidia: 'nvidia', microsoft: 'microsoft', 'ibm-granite': 'ibm', ibm: 'ibm', amazon: 'amazon', cohere: 'cohere',
  coherelabs: 'cohere', cohereforai: 'cohere', stabilityai: 'stability', 'black-forest-labs': 'bfl'
};

const FW_INTERNAL_MARKERS = /(?:^|[\/_.:@-])(?:internal|canary|checkpoint|ckpt|staging|nightly|redteam|red-team|eval|sft|dpo|rlhf|shadow|stealth|pre-?release|unreleased|confidential|dogfood)(?=$|[\/_.:@\d-])/i;
const FW_PRERELEASE_MARKERS = /(?:^|[\/_.:@-])(?:preview|exp|experimental|alpha|beta|rc\d*|early-access)(?=$|[\/_.:@\d-])/i;
const FW_UNRELEASED_PHRASES = /unreleased (?:frontier |base |preview )?model|internal (?:checkpoint|weights|canary|build|model[- ]id)|not (?:yet )?publicly (?:available|released)|staff[- ]only (?:model|checkpoint|build)|shadow[- ]deploy(?:ed|ment)?|private[- ]preview (?:model|weights)|restricted twin|pre[- ]release (?:weights|checkpoint|model|build)/i;

const FW_MODEL_KEY_STRICT = /(?:^|["'\s{,(])(?:llm|ai|chat|openai|anthropic|gemini|assistant|completion|agent|default_?llm|base)_?model(?:_?(?:id|name|slug))?["']?\s*[:=]\s*["'`]([^"'`\s]{2,100})["'`]/gi;
const FW_MODEL_KEY_SLUG = /(?:^|["'\s{,(])model_?slug["']?\s*[:=]\s*["'`]([^"'`\s]{2,100})["'`]/gi;
const FW_MODEL_KEY_LOOSE = /(?:^|["'\s{,(])model["']?\s*[:=]\s*["'`]([A-Za-z@][^"'`\s]{1,100})["'`]/g;
const FW_LLM_CONTEXT = /\b(?:messages|max_tokens|max_completion_tokens|max_output_tokens|temperature|top_p|system_prompt|system_instruction|prompt|completions?|chat|stream|tools|tool_choice|reasoning_effort|llm|openai|anthropic|inference)\b/gi;
const FW_ID_NOISE = /^(?:true|false|null|undefined|none|default|auto|gpt|model|llm|text|chat|image|base|custom|local|string|number|object)$/i;

function fwFrontierCheck(text) {
  for (let i = 0; i < FW_FRONTIER.length; i++) {
    const f = FW_FRONTIER[i];
    const m = f.re.exec(text);
    if (!m) continue;
    const version = parseFloat(m[1] + '.' + (m[2] || '0'));
    if (version > f.latest) return { family: f.family, lab: f.lab, version: version, latest: f.latestName };
  }
  return null;
}

// Every family mentioned beyond its public frontier, one mention per family.
function fwFrontierMentions(text) {
  const out = [];
  if (!text) return out;
  for (let i = 0; i < FW_FRONTIER.length; i++) {
    const f = FW_FRONTIER[i];
    f.reAll.lastIndex = 0;
    let m;
    while ((m = f.reAll.exec(text))) {
      const version = parseFloat(m[1] + '.' + (m[2] || '0'));
      if (version > f.latest) {
        out.push({ family: f.family, lab: f.lab, version: version, latest: f.latestName, match: m[0], index: m.index });
        break;
      }
    }
  }
  return out;
}

function fwUnreleasedNear(text, index) {
  const m = FW_UNRELEASED_PHRASES.exec(text.slice(Math.max(0, index - 160), index + 160));
  return m ? m[0] : null;
}

function fwFindTemplates(text) {
  const hits = [];
  if (!text || (text.indexOf('<') === -1 && text.indexOf('[') === -1)) return hits;
  const skip = {};
  for (let i = 0; i < FW_TEMPLATES.length; i++) {
    const t = FW_TEMPLATES[i];
    if (skip[t.id]) continue;
    const m = t.re.exec(text);
    if (!m) continue;
    hits.push({ template: t, match: m[0].slice(0, 160), index: m.index });
    (t.subsumes || []).forEach(function (id) { skip[id] = true; });
  }
  return hits;
}

function fwFindArtifacts(text) {
  const hits = [];
  if (!text) return hits;
  for (let i = 0; i < FW_ARTIFACTS.length; i++) {
    const a = FW_ARTIFACTS[i];
    const m = a.re.exec(text);
    if (!m) continue;
    hits.push({ artifact: a, match: m[0], index: m.index, model: a.model ? m[a.model] : null });
  }
  return hits;
}

function fwLooksLikeModelId(id) {
  if (!/^[a-z0-9@][\w.:\/@+-]{1,100}$/i.test(id) || !/[a-z]/i.test(id)) return false;
  return /\d/.test(id) || !!fwMatchModelId(id) || FW_INTERNAL_MARKERS.test(id);
}

function fwLlmContextScore(text, index) {
  const win = text.slice(Math.max(0, index - 400), index + 400);
  const words = {};
  FW_LLM_CONTEXT.lastIndex = 0;
  let m;
  while ((m = FW_LLM_CONTEXT.exec(win))) words[m[0].toLowerCase()] = true;
  return Object.keys(words).length;
}

// Model identifiers in configs and payloads. A bare `model` key is everywhere (cars, phones), so it
// only counts next to LLM vocabulary, and unfamiliar names need more of it.
function fwFindModelIds(text) {
  const out = [];
  if (!text || !/model/i.test(text)) return out;
  const seen = {};
  const take = function (re, strict) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) && out.length < 12) {
      const id = m[1];
      if (seen[id] || FW_ID_NOISE.test(id) || !fwLooksLikeModelId(id)) continue;
      if (!strict) {
        const known = !!fwMatchModelId(id);
        const score = fwLlmContextScore(text, m.index);
        if (known ? score < 1 : (score < 2 || id.indexOf('-') === -1)) continue;
      }
      seen[id] = true;
      out.push({ id: id, index: m.index });
    }
  };
  take(FW_MODEL_KEY_STRICT, true);
  take(FW_MODEL_KEY_SLUG, true);
  take(FW_MODEL_KEY_LOOSE, false);
  return out;
}

// Names the lab behind a model ID and how public it is.
function fwClassifyModelId(raw) {
  const id = String(raw || '').trim();
  if (!id || id.length > 120) return null;
  const out = { id: id, lab: 'unknown', family: null, status: 'public', via: null, base: null, frontier: null };

  let m = /^ft:([^:]+):/i.exec(id);
  if (m) {
    const base = fwMatchModelId(m[1]);
    out.lab = base ? base.lab : 'openai';
    out.family = base ? base.name : 'OpenAI fine-tune';
    out.base = m[1];
    out.status = 'private-fine-tune';
    return out;
  }

  m = /^openrouter\/([\w.:-]+)$/i.exec(id);
  if (m && m[1].toLowerCase() !== 'auto') {
    out.family = 'OpenRouter stealth model';
    out.via = 'OpenRouter';
    out.status = 'stealth';
    return out;
  }

  let tail = id;
  let org = null;
  if ((m = /^publishers\/([\w-]+)\/models\/(.+)$/i.exec(tail))) { org = m[1]; tail = m[2]; out.via = 'Vertex AI'; }
  else if ((m = /^@cf\/([\w-]+)\/(.+)$/i.exec(tail))) { org = m[1]; tail = m[2]; out.via = 'Cloudflare Workers AI'; }
  else if ((m = /^accounts\/[\w-]+\/models\/(.+)$/i.exec(tail))) { tail = m[1]; out.via = 'Fireworks AI'; }
  else if ((m = /^(?:(?:us|eu|apac|global|us-gov)\.)?(anthropic|meta|amazon|mistral|cohere|deepseek|openai|qwen|writer|stability)\.(.+)$/i.exec(tail))) { org = m[1]; tail = m[2]; out.via = 'Amazon Bedrock'; }
  else if ((m = /^([\w.-]+)\/(.+)$/.exec(tail))) { org = m[1]; tail = m[2]; }

  const orgLab = org ? FW_ORG_LABS[org.toLowerCase()] || null : null;
  const fam = fwMatchModelId(tail);
  if (fam) {
    out.lab = fam.lab;
    out.family = fam.name;
  } else if (orgLab) {
    out.lab = orgLab;
    out.status = 'unlisted';
  } else {
    out.status = 'unknown-model';
    if (org && !out.via) out.via = org;
  }

  const frontier = fwFrontierCheck(tail);
  if (frontier) {
    out.frontier = frontier;
    out.status = 'beyond-frontier';
    if (out.lab === 'unknown') out.lab = frontier.lab;
  }
  if (FW_INTERNAL_MARKERS.test(tail)) out.status = 'internal-build';
  else if ((out.status === 'public' || out.status === 'unlisted') && FW_PRERELEASE_MARKERS.test(tail)) out.status = 'pre-release';
  return out;
}

function fwStatusNote(cls, labId) {
  if (!cls) return null;
  const lab = fwLab(labId || cls.lab);
  let note = null;
  switch (cls.status) {
    case 'beyond-frontier': note = 'Newer than any public ' + cls.frontier.family + ' release (latest: ' + cls.frontier.latest + ')'; break;
    case 'private-fine-tune': note = 'Private fine-tune of ' + cls.base; break;
    case 'stealth': note = 'Served under a codename; the lab is withheld'; break;
    case 'internal-build': note = 'Model ID carries an internal or unreleased build marker'; break;
    case 'pre-release': note = 'Preview or experimental variant'; break;
    case 'unlisted': note = (lab && lab.id !== 'unknown' ? lab.name + ' model' : 'Model') + ' not in the public catalog'; break;
    case 'unknown-model': note = 'No public lab ships a model by this name'; break;
    case 'local': note = 'Running on a self-hosted server'; break;
  }
  if (cls.via && cls.status !== 'stealth') note = (note ? note + ' · ' : '') + 'via ' + cls.via;
  return note;
}

function fwTextLooksUnreleased(text) {
  const m = FW_UNRELEASED_PHRASES.exec(text || '');
  return m ? m[0] : null;
}

function fwTemplateLab(template) {
  if (template.lab) return template.lab;
  if (template.candidates && template.candidates.length === 1) return template.candidates[0];
  return 'unknown';
}

function fwIdentifyUnknown(text) {
  const hits = [];
  if (!text) return hits;
  const unknownLab = fwLab('unknown');

  const templates = fwFindTemplates(text);
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i].template;
    const labId = fwTemplateLab(t);
    if (labId !== 'unknown') continue;
    hits.push({
      modelId: t.id,
      modelName: t.name,
      match: templates[i].match,
      lab: unknownLab,
      why: 'markup',
      lineage: t.lineage
    });
  }

  const unrel = fwTextLooksUnreleased(text);
  if (unrel && fwIdentifyModels(text).length === 0) {
    hits.push({
      modelId: 'unreleased',
      modelName: 'Unreleased / non-public model',
      match: unrel.slice(0, 80),
      lab: unknownLab,
      why: 'unreleased'
    });
  }

  const ids = fwFindModelIds(text);
  for (let i = 0; i < ids.length; i++) {
    const cls = fwClassifyModelId(ids[i].id);
    if (!cls) continue;
    if (cls.lab !== 'unknown' && cls.status !== 'unknown-model' && cls.status !== 'stealth') continue;
    hits.push({
      modelId: cls.id,
      modelName: cls.family || cls.id,
      match: cls.id,
      lab: unknownLab,
      why: 'stray-id',
      status: cls.status,
      lineage: fwStatusNote(cls)
    });
  }

  return hits;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FW_STATUS: FW_STATUS,
    FW_FRONTIER: FW_FRONTIER,
    FW_TEMPLATES: FW_TEMPLATES,
    FW_ARTIFACTS: FW_ARTIFACTS,
    FW_UNRELEASED_PHRASES: FW_UNRELEASED_PHRASES,
    fwFrontierCheck: fwFrontierCheck,
    fwFrontierMentions: fwFrontierMentions,
    fwUnreleasedNear: fwUnreleasedNear,
    fwFindTemplates: fwFindTemplates,
    fwFindArtifacts: fwFindArtifacts,
    fwFindModelIds: fwFindModelIds,
    fwClassifyModelId: fwClassifyModelId,
    fwStatusNote: fwStatusNote,
    fwTextLooksUnreleased: fwTextLooksUnreleased,
    fwIdentifyUnknown: fwIdentifyUnknown,
    fwTemplateLab: fwTemplateLab
  };
}
