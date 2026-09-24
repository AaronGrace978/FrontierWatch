// FrontierWatch — lab and model catalog.
// Names a model, its lab and the country it came from. Attribution is heuristic, not proof of authorship.

'use strict';

const FW_CATALOG_DATE = '2026-09-24';

const FW_LABS = {
  unknown: { id: 'unknown', name: 'Unknown lab', hq: 'Not in the public catalog', country: 'Unknown', region: 'Unknown', weights: 'unknown' },
  openai: { id: 'openai', name: 'OpenAI', hq: 'San Francisco, California', country: 'United States', region: 'North America', weights: 'mixed' },
  anthropic: { id: 'anthropic', name: 'Anthropic', hq: 'San Francisco, California', country: 'United States', region: 'North America', weights: 'closed' },
  google: { id: 'google', name: 'Google DeepMind', hq: 'London / Mountain View', country: 'United Kingdom / United States', region: 'Europe / North America', weights: 'mixed' },
  xai: { id: 'xai', name: 'xAI (SpaceXAI)', hq: 'San Francisco / Memphis', country: 'United States', region: 'North America', weights: 'mixed' },
  meta: { id: 'meta', name: 'Meta Superintelligence Labs', hq: 'Menlo Park, California', country: 'United States', region: 'North America', weights: 'mixed' },
  microsoft: { id: 'microsoft', name: 'Microsoft AI', hq: 'Redmond, Washington', country: 'United States', region: 'North America', weights: 'mixed' },
  nvidia: { id: 'nvidia', name: 'NVIDIA', hq: 'Santa Clara, California', country: 'United States', region: 'North America', weights: 'open' },
  amazon: { id: 'amazon', name: 'Amazon (Nova)', hq: 'Seattle, Washington', country: 'United States', region: 'North America', weights: 'closed' },
  ibm: { id: 'ibm', name: 'IBM (Granite)', hq: 'Armonk, New York', country: 'United States', region: 'North America', weights: 'open' },
  cursor: { id: 'cursor', name: 'Cursor (Anysphere)', hq: 'San Francisco, California', country: 'United States', region: 'North America', weights: 'closed' },
  adobe: { id: 'adobe', name: 'Adobe (Firefly)', hq: 'San Jose, California', country: 'United States', region: 'North America', weights: 'closed' },
  midjourney: { id: 'midjourney', name: 'Midjourney', hq: 'San Francisco, California', country: 'United States', region: 'North America', weights: 'closed' },
  cohere: { id: 'cohere', name: 'Cohere', hq: 'Toronto', country: 'Canada', region: 'North America', weights: 'mixed' },
  ideogram: { id: 'ideogram', name: 'Ideogram', hq: 'Toronto', country: 'Canada', region: 'North America', weights: 'closed' },
  mistral: { id: 'mistral', name: 'Mistral AI', hq: 'Paris', country: 'France', region: 'Europe', weights: 'mixed' },
  stability: { id: 'stability', name: 'Stability AI', hq: 'London', country: 'United Kingdom', region: 'Europe', weights: 'open' },
  bfl: { id: 'bfl', name: 'Black Forest Labs', hq: 'Freiburg', country: 'Germany', region: 'Europe', weights: 'mixed' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', hq: 'Hangzhou', country: 'China', region: 'East Asia', weights: 'open' },
  alibaba: { id: 'alibaba', name: 'Alibaba Cloud (Qwen)', hq: 'Hangzhou', country: 'China', region: 'East Asia', weights: 'mixed' },
  moonshot: { id: 'moonshot', name: 'Moonshot AI', hq: 'Beijing', country: 'China', region: 'East Asia', weights: 'open' },
  zai: { id: 'zai', name: 'Zhipu AI (Z.ai)', hq: 'Beijing', country: 'China', region: 'East Asia', weights: 'open' },
  baidu: { id: 'baidu', name: 'Baidu (ERNIE)', hq: 'Beijing', country: 'China', region: 'East Asia', weights: 'mixed' },
  bytedance: { id: 'bytedance', name: 'ByteDance Seed', hq: 'Beijing', country: 'China', region: 'East Asia', weights: 'mixed' },
  minimax: { id: 'minimax', name: 'MiniMax', hq: 'Shanghai', country: 'China', region: 'East Asia', weights: 'open' },
  tencent: { id: 'tencent', name: 'Tencent Hunyuan', hq: 'Shenzhen', country: 'China', region: 'East Asia', weights: 'mixed' }
};

// First match wins when classifying a model ID, so more specific entries come first.
// idOnly entries are too ambiguous for prose ("Claude Monet", "PHP Composer 2") and only
// apply to explicit model identifiers.
const FW_MODELS = [
  { id: 'gpt-6', name: 'GPT-6 (Astra)', lab: 'openai', re: /\bgpt[ _-]?6(?:\.\d)?\b/i },
  { id: 'gpt-5', name: 'GPT-5 family (Sol / Terra / Luna)', lab: 'openai', re: /\bgpt[ _-]?5(?:\.\d)?\b/i },
  { id: 'gpt-4', name: 'GPT-4 family', lab: 'openai', re: /\bgpt[ _-]?4(?:o|\.1|\.5)?\b/i },
  { id: 'gpt-3.5', name: 'GPT-3.5', lab: 'openai', re: /\bgpt[ _-]?3\.5\b/i },
  { id: 'gpt-oss', name: 'gpt-oss (open weights)', lab: 'openai', re: /\bgpt[ _-]oss\b/i },
  { id: 'o-series', name: 'OpenAI o-series', lab: 'openai', re: /\bo[134][ _-](?:mini|pro|preview|deep[ _-]research)\b/i },
  { id: 'o-series-id', name: 'OpenAI o-series', lab: 'openai', re: /^o[134](?:$|[ _-])/i, idOnly: true },
  { id: 'gpt-image', name: 'GPT Image / DALL·E', lab: 'openai', re: /\b(?:gpt[ _-]image[ _-]?\d(?:\.\d)?|dall[ ·._-]?e(?:[ _-]?[23])?)\b/i },
  { id: 'sora', name: 'Sora', lab: 'openai', re: /\bsora[ _-]?2\b/i },
  { id: 'chatgpt', name: 'ChatGPT', lab: 'openai', re: /\bchatgpt\b/i },
  { id: 'openai-api', name: 'OpenAI API model', lab: 'openai', re: /^(?:whisper|tts|text-embedding|omni-moderation|davinci|babbage|codex-mini|computer-use)/i, idOnly: true },

  { id: 'claude-fable', name: 'Claude Fable / Mythos', lab: 'anthropic', re: /\bclaude[ _-]?(?:fable|mythos)\b/i },
  { id: 'claude-opus', name: 'Claude Opus', lab: 'anthropic', re: /\bclaude[ _-]?(?:\d(?:[.-]\d)?[ _-]?)?opus\b/i },
  { id: 'claude-sonnet', name: 'Claude Sonnet', lab: 'anthropic', re: /\bclaude[ _-]?(?:\d(?:[.-]\d)?[ _-]?)?sonnet\b/i },
  { id: 'claude-haiku', name: 'Claude Haiku', lab: 'anthropic', re: /\bclaude[ _-]?(?:\d(?:[.-]\d)?[ _-]?)?haiku\b/i },
  { id: 'claude', name: 'Claude', lab: 'anthropic', re: /\bclaude[ _-](?:ai|code|instant|[1-9](?:\.\d)?)\b|\bclaude\.ai\b|\banthropic'?s claude\b/i },
  { id: 'claude-id', name: 'Claude', lab: 'anthropic', re: /^claude/i, idOnly: true },

  { id: 'gemini', name: 'Gemini', lab: 'google', re: /\bgemini[ _-]?(?:\d(?:\.\d)?|ultra|pro|flash|nano|advanced|live|exp)\b|\bgoogle(?:'s)? gemini\b/i },
  { id: 'gemma', name: 'Gemma (open weights)', lab: 'google', re: /\bgemma[ _-]?\dn?\b/i },
  { id: 'nano-banana', name: 'Gemini Image (Nano Banana)', lab: 'google', re: /\bnano[ _-]banana\b/i },
  { id: 'imagen-veo', name: 'Imagen / Veo', lab: 'google', re: /\b(?:Google Imagen|Imagen [3-9]|Veo [2-9])\b/ },
  { id: 'google-id', name: 'Gemini', lab: 'google', re: /^(?:gemini|gemma|imagen|veo|learnlm|text-embedding-00)/i, idOnly: true },

  { id: 'grok', name: 'Grok', lab: 'xai', re: /\bgrok[ _-]?(?:\d(?:\.\d+)?|imagine|code|heavy)\b|\bxai(?:'s)? grok\b/i },
  { id: 'grok-id', name: 'Grok', lab: 'xai', re: /^grok/i, idOnly: true },

  { id: 'deepseek-r', name: 'DeepSeek-R (reasoning)', lab: 'deepseek', re: /\bdeepseek[ _-]?r\d\b/i },
  { id: 'deepseek-v', name: 'DeepSeek-V', lab: 'deepseek', re: /\bdeepseek[ _-]?v\d(?:\.\d)?\b/i },
  { id: 'deepseek', name: 'DeepSeek', lab: 'deepseek', re: /\bdeepseek\b/i },

  { id: 'nemotron', name: 'Nemotron', lab: 'nvidia', re: /\bnemotron\b/i },
  { id: 'muse', name: 'Muse Spark', lab: 'meta', re: /\bmuse[ _-]?(?:spark|glimmer)\b/i },
  { id: 'llama', name: 'Llama', lab: 'meta', re: /\b(?:meta[ _-])?llama[ _-]?\d(?:\.\d)?\b/i },
  { id: 'llama-id', name: 'Llama', lab: 'meta', re: /^(?:meta-)?llama/i, idOnly: true },

  { id: 'qwen', name: 'Qwen', lab: 'alibaba', re: /\b(?:qwen\d*(?:\.\d)?|qwq|qvq)\b/i },
  { id: 'kimi', name: 'Kimi', lab: 'moonshot', re: /\bkimi[ _-]?(?:k\d(?:\.\d)?|chat|latest)\b/i },
  { id: 'kimi-id', name: 'Kimi', lab: 'moonshot', re: /^(?:kimi|moonshot-v)/i, idOnly: true },
  { id: 'glm', name: 'GLM', lab: 'zai', re: /\b(?:chatglm\d?|glm[ _-]?\d(?:\.\d)?v?|cogview[ _-]?\d|codegeex\d?)\b/i },
  { id: 'ernie', name: 'ERNIE', lab: 'baidu', re: /\bernie[ _-]?(?:\d(?:\.\d)?|bot|x\d(?:\.\d)?)\b/i },
  { id: 'ernie-id', name: 'ERNIE', lab: 'baidu', re: /^ernie/i, idOnly: true },
  { id: 'minimax', name: 'MiniMax', lab: 'minimax', re: /\bminimax[ _-]?(?:m\d(?:\.\d)?|text-\d+|abab\d)/i },
  { id: 'seedream', name: 'Seed / Doubao', lab: 'bytedance', re: /\b(?:seedream|seedance|doubao|seed-oss)\b/i },
  { id: 'hunyuan', name: 'Hunyuan', lab: 'tencent', re: /\bhunyuan\b/i },

  { id: 'mistral', name: 'Mistral', lab: 'mistral', re: /\b(?:mistral[ _-](?:large|medium|small|nemo|saba|tiny|ai|\d)|mixtral|codestral|magistral|devstral|pixtral|ministral|voxtral)\b/i },
  { id: 'mistral-id', name: 'Mistral', lab: 'mistral', re: /^(?:open-)?(?:mistral|mixtral|codestral|magistral|devstral|pixtral|ministral|voxtral)/i, idOnly: true },

  { id: 'phi', name: 'Phi', lab: 'microsoft', re: /\bPhi-[345](?:\.\d)?\b/ },
  { id: 'phi-id', name: 'Phi', lab: 'microsoft', re: /^phi-?\d/i, idOnly: true },
  { id: 'mai', name: 'Microsoft MAI', lab: 'microsoft', re: /\bMAI-(?:\d|Image|Voice|DS)/ },
  { id: 'copilot', name: 'Microsoft Copilot', lab: 'microsoft', re: /\bmicrosoft copilot\b/i },
  { id: 'copilot-id', name: 'Copilot', lab: 'microsoft', re: /^copilot/i, idOnly: true },
  { id: 'granite', name: 'Granite', lab: 'ibm', re: /\b(?:ibm granite|granite[ _-]\d\.\d)\b/i },
  { id: 'granite-id', name: 'Granite', lab: 'ibm', re: /^granite/i, idOnly: true },
  { id: 'nova', name: 'Amazon Nova', lab: 'amazon', re: /\bamazon nova\b/i },
  { id: 'nova-id', name: 'Amazon Nova', lab: 'amazon', re: /^(?:amazon\.)?(?:nova|titan)/i, idOnly: true },
  { id: 'command', name: 'Cohere Command', lab: 'cohere', re: /\bcohere(?:'s)? command\b/i },
  { id: 'command-id', name: 'Cohere Command', lab: 'cohere', re: /^(?:command|c4ai|aya)/i, idOnly: true },
  { id: 'composer', name: 'Cursor Composer', lab: 'cursor', re: /^composer[ _-]?\d/i, idOnly: true },

  { id: 'midjourney', name: 'Midjourney', lab: 'midjourney', re: /\bmidjourney\b/i },
  { id: 'stable-diffusion', name: 'Stable Diffusion', lab: 'stability', re: /\bstable diffusion\b|\bsdxl\b/i },
  { id: 'flux', name: 'FLUX', lab: 'bfl', re: /\bflux(?:\.1|\.2|[ _-](?:1|2|kontext|pro|dev|schnell))\b/i },
  { id: 'firefly', name: 'Adobe Firefly', lab: 'adobe', re: /\badobe firefly\b/i },
  { id: 'ideogram', name: 'Ideogram', lab: 'ideogram', re: /\bideogram\b/i }
];

// Gateways serve many labs; the lab comes from the model ID, not the host.
const FW_API_HOSTS = [
  { re: /(?:^|\.)api\.openai\.com$/i, lab: 'openai', label: 'OpenAI API' },
  { re: /(?:^|\.)openai\.azure\.com$/i, lab: 'openai', label: 'Azure OpenAI' },
  { re: /(?:^|\.)(?:chatgpt\.com|chat\.openai\.com)$/i, lab: 'openai', label: 'ChatGPT' },
  { re: /(?:^|\.)api\.anthropic\.com$/i, lab: 'anthropic', label: 'Anthropic API' },
  { re: /(?:^|\.)claude\.ai$/i, lab: 'anthropic', label: 'Claude.ai' },
  { re: /(?:^|\.)generativelanguage\.googleapis\.com$/i, lab: 'google', label: 'Gemini API' },
  { re: /(?:^|\.)gemini\.google\.com$/i, lab: 'google', label: 'Gemini app' },
  { re: /(?:^|\.)api\.x\.ai$/i, lab: 'xai', label: 'xAI API' },
  { re: /(?:^|\.)grok\.com$/i, lab: 'xai', label: 'Grok' },
  { re: /(?:^|\.)(?:api|chat)\.deepseek\.com$/i, lab: 'deepseek', label: 'DeepSeek' },
  { re: /(?:^|\.)dashscope(?:-intl)?\.aliyuncs\.com$/i, lab: 'alibaba', label: 'Qwen DashScope' },
  { re: /(?:^|\.)api\.moonshot\.(?:cn|ai)$/i, lab: 'moonshot', label: 'Moonshot / Kimi API' },
  { re: /(?:^|\.)(?:open\.bigmodel\.cn|api\.z\.ai)$/i, lab: 'zai', label: 'Zhipu GLM API' },
  { re: /(?:^|\.)qianfan\.baidubce\.com$/i, lab: 'baidu', label: 'Baidu Qianfan' },
  { re: /(?:^|\.)api\.mistral\.ai$/i, lab: 'mistral', label: 'Mistral API' },
  { re: /(?:^|\.)api\.cohere\.(?:ai|com)$/i, lab: 'cohere', label: 'Cohere API' },
  { re: /(?:^|\.)aiplatform\.googleapis\.com$/i, gateway: 'Vertex AI', label: 'Vertex AI' },
  { re: /(?:^|\.)bedrock(?:-runtime)?\.[a-z0-9-]+\.amazonaws\.com$/i, gateway: 'Amazon Bedrock', label: 'Amazon Bedrock' },
  { re: /(?:^|\.)services\.ai\.azure\.com$/i, gateway: 'Azure AI Foundry', label: 'Azure AI Foundry' },
  { re: /(?:^|\.)openrouter\.ai$/i, gateway: 'OpenRouter', label: 'OpenRouter' },
  { re: /(?:^|\.)api\.together\.(?:xyz|ai)$/i, gateway: 'Together AI', label: 'Together AI' },
  { re: /(?:^|\.)api\.fireworks\.ai$/i, gateway: 'Fireworks AI', label: 'Fireworks AI' },
  { re: /(?:^|\.)api\.groq\.com$/i, gateway: 'Groq', label: 'Groq' },
  { re: /(?:^|\.)api\.cerebras\.ai$/i, gateway: 'Cerebras', label: 'Cerebras' },
  { re: /(?:^|\.)api\.deepinfra\.com$/i, gateway: 'DeepInfra', label: 'DeepInfra' },
  { re: /(?:^|\.)api\.replicate\.com$/i, gateway: 'Replicate', label: 'Replicate' },
  { re: /(?:^|\.)integrate\.api\.nvidia\.com$/i, gateway: 'NVIDIA NIM', label: 'NVIDIA NIM' },
  { re: /(?:^|\.)(?:router|api-inference)\.huggingface\.co$/i, gateway: 'Hugging Face', label: 'Hugging Face Inference' },
  { re: /(?:^|\.)gateway\.ai\.cloudflare\.com$/i, gateway: 'Cloudflare AI Gateway', label: 'Cloudflare AI Gateway' }
];

// Sites where naming models is normal: mentions there are weak evidence.
const FW_DISCUSSION_HOSTS = /(?:^|\.)(?:wikipedia\.org|wikimedia\.org|arxiv\.org|github\.com|githubusercontent\.com|gitlab\.com|stackoverflow\.com|stackexchange\.com|huggingface\.co|reddit\.com|ycombinator\.com|medium\.com|substack\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|nytimes\.com|bbc\.com|bbc\.co\.uk|theverge\.com|techcrunch\.com|wired\.com|reuters\.com|bloomberg\.com|arstechnica\.com|openai\.com|anthropic\.com|deepmind\.google|blog\.google|ai\.google\.dev|ai\.meta\.com|mistral\.ai|x\.ai|deepseek\.com|qwen\.ai|moonshot\.ai|z\.ai|developer\.chrome\.com)$/i;

// A lab's own product: its UI markup is native there, not a paste artifact.
const FW_FIRST_PARTY = [
  { re: /(?:^|\.)(?:chatgpt\.com|chat\.openai\.com|sora\.com)$/i, lab: 'openai' },
  { re: /(?:^|\.)claude\.ai$/i, lab: 'anthropic' },
  { re: /(?:^|\.)(?:gemini\.google\.com|aistudio\.google\.com|notebooklm\.google\.com)$/i, lab: 'google' },
  { re: /(?:^|\.)grok\.com$/i, lab: 'xai' },
  { re: /(?:^|\.)chat\.deepseek\.com$/i, lab: 'deepseek' },
  { re: /(?:^|\.)(?:chat\.qwen\.ai|tongyi\.aliyun\.com)$/i, lab: 'alibaba' },
  { re: /(?:^|\.)kimi\.(?:com|moonshot\.cn)$/i, lab: 'moonshot' },
  { re: /(?:^|\.)chat\.mistral\.ai$/i, lab: 'mistral' },
  { re: /(?:^|\.)copilot\.microsoft\.com$/i, lab: 'microsoft' },
  { re: /(?:^|\.)meta\.ai$/i, lab: 'meta' }
];

function fwLab(id) {
  return FW_LABS[id] || null;
}

function fwHostLab(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (let i = 0; i < FW_API_HOSTS.length; i++) {
    if (FW_API_HOSTS[i].re.test(host)) return FW_API_HOSTS[i];
  }
  return null;
}

function fwIsDiscussionHost(hostname) {
  return !!hostname && FW_DISCUSSION_HOSTS.test(String(hostname).toLowerCase());
}

function fwFirstPartyLab(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (let i = 0; i < FW_FIRST_PARTY.length; i++) {
    if (FW_FIRST_PARTY[i].re.test(host)) return FW_FIRST_PARTY[i].lab;
  }
  return null;
}

// Model mentions in prose: at most one per lab, first catalog entry wins.
function fwIdentifyModels(text) {
  const hits = [];
  if (!text) return hits;
  const seen = {};
  for (let i = 0; i < FW_MODELS.length; i++) {
    const m = FW_MODELS[i];
    if (m.idOnly || seen[m.lab]) continue;
    const match = m.re.exec(text);
    if (!match) continue;
    seen[m.lab] = true;
    hits.push({ modelId: m.id, modelName: m.name, lab: m.lab, match: match[0], index: match.index });
  }
  return hits;
}

function fwMatchModelId(id) {
  for (let i = 0; i < FW_MODELS.length; i++) {
    if (FW_MODELS[i].re.test(id)) return FW_MODELS[i];
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FW_CATALOG_DATE: FW_CATALOG_DATE,
    FW_LABS: FW_LABS,
    FW_MODELS: FW_MODELS,
    FW_API_HOSTS: FW_API_HOSTS,
    FW_DISCUSSION_HOSTS: FW_DISCUSSION_HOSTS,
    FW_NEWSY_HOSTS: FW_DISCUSSION_HOSTS,
    FW_FIRST_PARTY: FW_FIRST_PARTY,
    fwLab: fwLab,
    fwHostLab: fwHostLab,
    fwIsDiscussionHost: fwIsDiscussionHost,
    fwFirstPartyLab: fwFirstPartyLab,
    fwIdentifyModels: fwIdentifyModels,
    fwMatchModelId: fwMatchModelId
  };
}
