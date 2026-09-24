// FrontierWatch — image provenance. Reads only the metadata segments of JPEG, PNG and WebP
// files and extracts:
//   C2PA Content Credentials (claim generator, softwareAgent, author)
//   IPTC digital source type (trainedAlgorithmicMedia = AI-generated)
//   China's GB 45438-2025 implicit AIGC label (XMP TC260:AIGC)
//   Stable Diffusion WebUI / ComfyUI generation parameters
// Pixel watermarks such as SynthID need the vendor's detector and are out of reach.

'use strict';

const FW_IMAGE_GENERATORS = [
  { re: /Grok Imagine|SpaceXAI|\bxAI\b/, lab: 'xai', name: 'Grok Imagine' },
  { re: /ChatGPT|DALL[·•.\- ]?E|OpenAI|gpt-image-[0-9]|GPT-4o|\bSora\b/, lab: 'openai', name: 'OpenAI image model' },
  { re: /Made with Google AI|Google Imagen|Imagen ?[2-5]|Gemini|Nano Banana|SynthID/, lab: 'google', name: 'Google image model' },
  { re: /Adobe Firefly|Firefly Image/, lab: 'adobe', name: 'Adobe Firefly' },
  { re: /Bing Image Creator|Microsoft Designer|Copilot Designer|MAI-Image|Microsoft Responsible AI/, lab: 'microsoft', name: 'Microsoft image model' },
  { re: /Midjourney|niji ?journey/i, lab: 'midjourney', name: 'Midjourney' },
  { re: /FLUX\.[12]|flux1?[-_](?:dev|schnell|kontext|pro)|Black Forest Labs|bfl\.ai/i, lab: 'bfl', name: 'FLUX' },
  { re: /Stable Diffusion|stability\.ai|Stability AI|SDXL|sd_xl|sd3(?:\.5)?[-_]|stable-image/i, lab: 'stability', name: 'Stable Diffusion' },
  { re: /Meta AI|Imagined with AI|Meta Imagine/, lab: 'meta', name: 'Meta AI image' },
  { re: /Ideogram/, lab: 'ideogram', name: 'Ideogram' },
  { re: /Seedream|Jimeng|Doubao|ByteDance/i, lab: 'bytedance', name: 'ByteDance Seedream' },
  { re: /Hunyuan|Tencent/i, lab: 'tencent', name: 'Tencent Hunyuan' },
  { re: /Tongyi|Wanx|Qwen-Image|wan2\.[0-9]/i, lab: 'alibaba', name: 'Alibaba Qwen-Image / Wan' },
  { re: /Kimi|Moonshot/, lab: 'moonshot', name: 'Moonshot AI' },
  { re: /Zhipu|CogView/i, lab: 'zai', name: 'Zhipu CogView' },
  { re: /ERNIE|Baidu|Wenxin/i, lab: 'baidu', name: 'Baidu ERNIE' },
  { re: /MiniMax|Hailuo/i, lab: 'minimax', name: 'MiniMax Hailuo' }
];

function fwBytesToLatin1(bytes, max) {
  const n = Math.min(bytes.length, max || bytes.length);
  let s = '';
  for (let i = 0; i < n; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(n, i + 8192)));
  }
  return s;
}

function fwLatin1ToUtf8(s) {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xFF;
  try { return new TextDecoder('utf-8').decode(bytes); } catch (e) { return s; }
}

// Concatenates the metadata-bearing segments; pixel data is skipped.
function fwImageSegments(bytes) {
  const out = { format: 'unknown', meta: '', c2paBox: false };
  const parts = [];
  const b = bytes;
  const u32 = function (i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; };
  const u32le = function (i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; };
  const tag = function (i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); };

  if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
    out.format = 'jpeg';
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xFF) {
      const marker = b[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      if (marker === 0xDA || marker === 0xD9) break;
      const len = (b[i + 2] << 8) | b[i + 3];
      const start = i + 4;
      const end = Math.min(b.length, i + 2 + len);
      // APP1 (EXIF/XMP), APP3–APP15 (APP11 carries C2PA JUMBF), COM. APP0/APP2 are JFIF/ICC.
      if ((marker >= 0xE1 && marker <= 0xEF && marker !== 0xE2) || marker === 0xFE) {
        const seg = fwBytesToLatin1(b.subarray(start, end));
        if (marker === 0xEB && seg.indexOf('jumb') !== -1) out.c2paBox = true;
        parts.push(seg);
      }
      i += 2 + len;
    }
  } else if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    out.format = 'png';
    let i = 8;
    while (i + 8 <= b.length) {
      const len = u32(i);
      const type = tag(i + 4);
      const start = i + 8;
      const end = Math.min(b.length, start + len);
      if (type === 'tEXt' || type === 'iTXt' || type === 'caBX' || type === 'eXIf') {
        if (type === 'caBX') out.c2paBox = true;
        parts.push(type + '\u0000' + fwBytesToLatin1(b.subarray(start, end)));
      }
      if (type === 'IEND') break;
      i = start + len + 4;
    }
  } else if (b.length > 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    out.format = 'webp';
    let i = 12;
    while (i + 8 <= b.length) {
      const type = tag(i);
      const len = u32le(i + 4);
      const start = i + 8;
      const end = Math.min(b.length, start + len);
      if (type === 'EXIF' || type === 'XMP ' || type === 'C2PA') {
        if (type === 'C2PA') out.c2paBox = true;
        parts.push(fwBytesToLatin1(b.subarray(start, end)));
      }
      i = start + len + (len & 1);
    }
  } else {
    // AVIF / HEIF / GIF: no segment walk, scan the prefix for long, unambiguous markers only.
    out.format = b.length > 12 && tag(4) === 'ftyp' ? 'heif' : 'other';
    parts.push(fwBytesToLatin1(b, 131072));
  }
  out.meta = parts.join('\n').slice(0, 600000);
  return out;
}

// Reads the CBOR text string that follows `key` (C2PA manifests are CBOR). If the value is
// a map (C2PA v2 softwareAgent / claim_generator_info), returns its "name" field instead.
function fwCborText(s, key, from, within) {
  const i = s.indexOf(key, from > 0 ? from : 0);
  if (i < 0 || (within && i - from > within)) return null;
  let p = i + key.length;
  const b = s.charCodeAt(p);
  if (b >= 0xA0 && b <= 0xB7) return fwCborText(s, 'name', p, 60);
  if (b >= 0x80 && b <= 0x97) return fwCborText(s, 'name', p, 80);
  let len = -1;
  if (b >= 0x60 && b <= 0x77) { len = b - 0x60; p += 1; }
  else if (b === 0x78) { len = s.charCodeAt(p + 1); p += 2; }
  else if (b === 0x79) { len = (s.charCodeAt(p + 1) << 8) | s.charCodeAt(p + 2); p += 3; }
  if (len <= 0 || len > 240) return null;
  const text = fwLatin1ToUtf8(s.slice(p, p + len));
  return /[\x00-\x08]/.test(text) ? null : text;
}

function fwXmpValue(s, name) {
  const re = new RegExp(name + '(?:="([^"]{1,200})"|>\\s*(?:<rdf:(?:Alt|Seq|Bag)>\\s*<rdf:li[^>]*>)?([^<]{1,200})<)');
  const m = s.match(re);
  return m ? (m[1] || m[2] || '').trim() : null;
}

function fwGeneratorFor(text) {
  if (!text) return null;
  for (let i = 0; i < FW_IMAGE_GENERATORS.length; i++) {
    if (FW_IMAGE_GENERATORS[i].re.test(text)) return FW_IMAGE_GENERATORS[i];
  }
  return null;
}

function fwSniffImage(bytes) {
  const seg = fwImageSegments(bytes);
  const s = seg.meta;
  const r = {
    format: seg.format, c2pa: false, sourceType: null, ai: false, agent: null, generator: null, author: null,
    creatorTool: null, aiSystem: null, credit: null, aigc: null, sd: null, comfy: null, labId: null, tool: null
  };
  if (!s) return r;

  r.c2pa = seg.c2paBox || (s.indexOf('jumb') !== -1 && s.indexOf('c2pa') !== -1);
  const st = s.match(/digitalsourcetype\/(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic|digitalCapture|composite)\b/i);
  r.sourceType = st ? st[1] : null;

  if (r.c2pa) {
    r.agent = fwCborText(s, 'softwareAgent');
    const info = s.indexOf('claim_generator_info');
    r.generator = info >= 0 ? fwCborText(s, 'name', info, 80) : fwCborText(s, 'claim_generator');
    const author = s.indexOf('author');
    if (author >= 0) r.author = fwCborText(s, 'name', author, 80);
  }
  r.agent = r.agent || fwXmpValue(s, 'stEvt:softwareAgent');
  r.creatorTool = fwXmpValue(s, 'xmp:CreatorTool');
  r.aiSystem = fwXmpValue(s, 'Iptc4xmpExt:AISystemUsed');
  r.credit = fwXmpValue(s, 'photoshop:Credit');

  const aigcAt = s.indexOf('AIGC');
  if (aigcAt >= 0) {
    const win = s.slice(aigcAt, aigcAt + 1500).replace(/&quot;|&#34;|&#x22;/g, '"');
    const label = win.match(/"Label"\s*:\s*"?([123])"?/);
    const producer = win.match(/"ContentProducer"\s*:\s*"([^"]{0,160})"/);
    if (label || producer) {
      r.aigc = { label: label ? label[1] : '', producer: producer ? fwLatin1ToUtf8(producer[1]) : '' };
    }
  }

  const params = s.indexOf('parameters\u0000');
  if (params >= 0) {
    const t = s.slice(params, params + 6000);
    if (/Steps: \d+/.test(t)) {
      const model = t.match(/Model: ([^,\n]{1,100})/);
      r.sd = { model: model ? model[1].trim() : '' };
    }
  }
  if (/(?:prompt|workflow)\u0000\{/.test(s) && s.indexOf('"class_type"') !== -1) {
    const ck = s.match(/"(?:ckpt_name|unet_name|model_name)"\s*:\s*"([^"]{1,160})"/);
    r.comfy = { model: ck ? ck[1] : '' };
  }

  r.ai = /^(?:trainedAlgorithmicMedia|algorithmicMedia|compositeWithTrainedAlgorithmicMedia|compositeSynthetic)$/.test(r.sourceType || '');
  const fields = [r.agent, r.generator, r.author, r.creatorTool, r.aiSystem, r.credit,
    r.sd && r.sd.model, r.comfy && r.comfy.model, r.aigc && r.aigc.producer].filter(Boolean).join(' | ');
  const fromFields = fwGeneratorFor(fields);
  // Free-text metadata (captions, descriptions) can mention a lab without being made by it,
  // so the raw fallback only runs once the file already declares itself AI-generated.
  const gen = fromFields || (r.ai && seg.format !== 'other' && seg.format !== 'heif' ? fwGeneratorFor(s) : null);
  if (gen) { r.labId = gen.lab; r.tool = gen.name; r.toolFromFields = !!fromFields; }
  return r;
}

function fwShortUrl(url) {
  const s = String(url || '');
  if (s.indexOf('data:') === 0) return 'inline data: image';
  try {
    const u = new URL(s);
    const p = u.pathname.length > 48 ? '…' + u.pathname.slice(-46) : u.pathname;
    return u.hostname + p;
  } catch (e) {
    return s.slice(0, 80);
  }
}

function fwImageFindings(r, url) {
  const out = [];
  if (!r) return out;
  const where = fwShortUrl(url);
  const lab = r.labId ? fwLab(r.labId) : null;
  const generated = r.sourceType === 'trainedAlgorithmicMedia' || r.sourceType === 'algorithmicMedia';
  const edited = r.sourceType === 'compositeWithTrainedAlgorithmicMedia' || r.sourceType === 'compositeSynthetic';
  const tool = r.agent || r.aiSystem || r.generator || r.tool || '';

  if (r.c2pa || generated || edited) {
    const ai = generated || edited;
    const origin = lab ? fwOriginFromLab(lab) : (ai ? fwOriginFromLab(fwLab('unknown'), { lineage: 'AI-generated, generator not named' }) : null);
    out.push(fwFinding('imageProvenance', {
      label: generated ? 'AI-generated image' : edited ? 'AI-edited image' : 'Image with Content Credentials',
      severity: ai ? 'medium' : 'low',
      confidence: r.c2pa && ai ? 96 : ai ? 88 : 55,
      match: [r.c2pa ? 'C2PA' : 'IPTC', tool, r.author && r.author !== tool ? 'author ' + r.author : '', where].filter(Boolean).join(' · '),
      channel: 'image',
      modelName: tool || undefined,
      origin: origin || undefined
    }));
  }

  if (r.aigc) {
    const known = fwGeneratorFor(r.aigc.producer);
    const certainty = r.aigc.label === '1' ? 'confirmed' : r.aigc.label === '2' ? 'possible' : r.aigc.label === '3' ? 'suspected' : 'labelled';
    out.push(fwFinding('imageProvenance', {
      label: 'China AIGC label (GB 45438-2025): ' + certainty + ' AI content',
      severity: 'medium',
      confidence: r.aigc.label === '1' ? 94 : r.aigc.label === '2' ? 75 : 62,
      match: 'ContentProducer ' + (r.aigc.producer || 'not given') + ' · ' + where,
      channel: 'image',
      origin: known ? fwOriginFromLab(fwLab(known.lab)) : fwOriginFromLab(fwLab('unknown'), {
        country: 'China', cc: 'CN', lineage: 'Provider code ' + (r.aigc.producer || 'withheld') + ' under China\'s AIGC labelling rules'
      })
    }));
  }

  if (r.sd || r.comfy) {
    const model = (r.sd && r.sd.model) || (r.comfy && r.comfy.model) || '';
    const gen = fwGeneratorFor(model);
    out.push(fwFinding('imageProvenance', {
      label: r.sd ? 'Stable Diffusion WebUI parameters embedded' : 'ComfyUI workflow embedded',
      severity: 'medium',
      confidence: 90,
      match: (model ? 'checkpoint ' + model + ' · ' : '') + where,
      channel: 'image',
      modelName: model || undefined,
      origin: gen ? fwOriginFromLab(fwLab(gen.lab)) : fwOriginFromLab(fwLab('unknown'), { lineage: 'Open-weight diffusion checkpoint' + (model ? ' "' + model + '"' : '') })
    }));
  }

  if (!out.length && r.tool && lab && r.toolFromFields) {
    out.push(fwFinding('imageProvenance', {
      label: 'Image metadata names an AI generator',
      severity: 'low',
      confidence: 68,
      match: r.tool + ' · ' + where,
      channel: 'image',
      modelName: r.tool,
      origin: fwOriginFromLab(lab)
    }));
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fwSniffImage: fwSniffImage,
    fwImageFindings: fwImageFindings,
    fwImageSegments: fwImageSegments,
    fwGeneratorFor: fwGeneratorFor
  };
}
