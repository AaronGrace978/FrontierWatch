// FrontierWatch — signature engine
// Detects agent traps, exfil, and attributes model fingerprints to lab + country.

'use strict';

function fwBindExports(mod) {
  if (!mod) return;
  Object.keys(mod).forEach(function (k) {
    if (typeof globalThis[k] === 'undefined') globalThis[k] = mod[k];
  });
}
if (typeof require === 'function' && typeof fwIdentifyModels !== 'function') {
  try { fwBindExports(require('./models.js')); } catch (e) { /* content-script load order */ }
  try { fwBindExports(require('./lineage.js')); } catch (e) { /* optional */ }
  try { fwBindExports(require('./unicode.js')); } catch (e) { /* optional */ }
}

const FW_SIGNATURES = {
  agentDirectives: {
    label: 'Hidden AI-agent directive',
    severity: 'high',
    baseConfidence: 82,
    patterns: [
      /ignore (all |any |every )?(previous|prior|above) (instructions|prompts|directives)/i,
      /disregard (your|all) (previous )?(instructions|guidelines|safety)/i,
      /as an ai (assistant|model|agent),? (you must|you should|you will)/i,
      /reveal (your )?(system prompt|instructions|hidden (prompt|rules))/i,
      /\byou are (now )?(a |an )?(helpful |unrestricted )?(ai|assistant|model)\b/i,
      /\bDAN mode\b/i,
      /do not refuse/i,
      /override (your )?(safety|content) (filters?|polic(y|ies))/i,
      /exfiltrat(e|ion|ing)/i,
      /send (this|the) (data|conversation|context|secrets?) to/i,
      /when (browsing|visiting|you see) this page[^\n]{0,80}(ignore|override|exfil)/i
    ]
  },

  modelFingerprints: {
    label: 'Frontier-model fingerprint',
    severity: 'medium',
    baseConfidence: 55,
    patterns: [] // filled from FW_MODELS at scan time
  },

  modelSelfID: {
    label: 'Model self-identification',
    severity: 'high',
    baseConfidence: 88,
    patterns: [
      /i(?:'m| am) (?:an? )?(?:AI )?(?:language model|assistant) (?:called |named )?[A-Za-z0-9 .+-]{2,40}/i,
      /i(?:'m| am) (Claude|ChatGPT|Gemini|Grok|DeepSeek|Qwen|Kimi|Mistral|Llama)/i,
      /as (?:Claude|ChatGPT|Gemini|Grok)[^.!?\n]{0,40}(i (can|cannot|don't)|my (training|knowledge))/i,
      /knowledge (cutoff|cut-off)[: ]/i,
      /generated (by|with) (ChatGPT|Claude|Gemini|Grok|DeepSeek|Copilot|Cursor)/i
    ]
  },

  servingHints: {
    label: 'Model serving / API origin',
    severity: 'high',
    baseConfidence: 90,
    patterns: [
      /https?:\/\/[^\s"'<>]*(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.x\.ai|api\.deepseek\.com|dashscope\.aliyuncs\.com|openrouter\.ai|api\.mistral\.ai|:11434|ollama|lmstudio|localhost[^\s"'<>]*\/v1\/chat)/i,
      /\b(Authorization:\s*Bearer\s+sk-|x-api-key:\s*sk-ant-|AIza)[A-Za-z0-9_-]{8,}/i
    ]
  },

  exfilPayloads: {
    label: 'Possible exfiltration payload',
    severity: 'high',
    baseConfidence: 78,
    patterns: [
      /[A-Za-z0-9+/]{120,}={0,2}/,
      /(?:0x)?[0-9a-fA-F]{128,}/,
      /https?:\/\/[^\s"'<>]*(webhook|ngrok|requestbin|pipedream|burpcollaborator|oastify|interactsh)[^\s"'<>]*/i,
      /(api[ _-]?key|password|secret|token)[^\n]{0,60}(paste|enter|submit|send)|\b(enter|paste|input|provide)\b[^\n]{0,30}(api[ _-]?key|password|secret|token)/i
    ]
  },

  agentTraps: {
    label: 'Agent-trap DOM structure',
    severity: 'medium',
    baseConfidence: 70,
    check: function (doc) {
      const hits = [];
      const els = doc.querySelectorAll('[style], .hidden, [aria-hidden="true"], [hidden]');
      for (const el of els) {
        const style = (el.getAttribute('style') || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        const invisible =
          style.indexOf('display:none') !== -1 ||
          style.indexOf('display: none') !== -1 ||
          style.indexOf('visibility:hidden') !== -1 ||
          style.indexOf('visibility: hidden') !== -1 ||
          style.indexOf('opacity:0') !== -1 ||
          style.indexOf('opacity: 0') !== -1 ||
          style.indexOf('font-size:0') !== -1 ||
          style.indexOf('font-size: 0') !== -1 ||
          (style.indexOf('position:absolute') !== -1 && style.indexOf('left:-') !== -1) ||
          cls.indexOf('hidden') !== -1;
        if (!invisible) continue;
        const text = (el.textContent || '').trim();
        if (text.length < 20) continue;
        for (const re of FW_SIGNATURES.agentDirectives.patterns) {
          if (re.test(text)) {
            hits.push({
              type: 'hidden-directive',
              snippet: text.slice(0, 200),
              tag: el.tagName.toLowerCase(),
              confidence: 92
            });
            break;
          }
        }
      }
      const forms = doc.querySelectorAll('form[action]');
      for (const form of forms) {
        const action = form.getAttribute('action') || '';
        if (/webhook|ngrok|requestbin|pipedream|oastify|interactsh/i.test(action)) {
          hits.push({ type: 'exfil-form', snippet: action.slice(0, 200), tag: 'form', confidence: 88 });
        }
      }
      if (typeof location !== 'undefined' && location.protocol === 'http:' && doc.querySelector('input[type="password"]')) {
        hits.push({ type: 'insecure-password-field', snippet: location.href, tag: 'input', confidence: 65 });
      }
      return hits;
    }
  }
};

function fwOriginFromLab(lab, extras) {
  extras = extras || {};
  if (!lab) return null;
  if (typeof lab === 'string' && typeof fwLab === 'function') lab = fwLab(lab);
  if (!lab) return null;
  const out = {
    labId: lab.id,
    lab: lab.name,
    country: extras.country || lab.country,
    hq: extras.hq || lab.hq,
    region: extras.region || lab.region,
    weights: extras.weights || lab.weights,
    site: lab.site
  };
  if (extras.cc) out.cc = extras.cc;
  if (extras.lineage) out.lineage = extras.lineage;
  if (extras.status) out.status = extras.status;
  return out;
}

function fwFinding(family, opts) {
  opts = opts || {};
  return fwDecorateFinding({
    family: family,
    label: opts.label,
    severity: opts.severity || 'medium',
    match: opts.match || '',
    confidence: opts.confidence
  }, opts);
}

function fwDecorateFinding(finding, extras) {
  extras = extras || {};
  const out = {
    family: finding.family,
    label: finding.label,
    severity: finding.severity,
    match: finding.match,
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 50
  };
  if (extras.kind) out.kind = extras.kind;
  if (extras.channel) out.channel = extras.channel;
  if (extras.modelName) out.modelName = extras.modelName;
  if (extras.modelId) out.modelId = extras.modelId;
  if (extras.origin) out.origin = extras.origin;
  return out;
}

function fwScanText(text, opts) {
  const findings = [];
  if (!text) return findings;
  opts = opts || {};
  const channel = opts.channel || 'text';
  const pageHost = opts.pageHost || '';
  const discussion = typeof fwIsDiscussionHost === 'function' && fwIsDiscussionHost(pageHost);

  if (!opts._nested && typeof fwInvisibleScan === 'function') {
    const inv = fwInvisibleScan(text);
    if (inv.tagCount >= 8 && inv.tagText) {
      findings.push(fwFinding('invisibleUnicode', {
        label: 'Hidden Unicode tag-character payload',
        severity: 'high',
        confidence: 94,
        match: inv.tagText.slice(0, 160),
        channel: 'unicode-hidden'
      }));
      findings.push.apply(findings, fwScanText(inv.tagText, { channel: 'unicode-hidden', pageHost: pageHost, _nested: true }));
    }
    if (inv.vsText && inv.vsText.length >= 8) {
      findings.push(fwFinding('invisibleUnicode', {
        label: 'Variation-selector steganography',
        severity: 'high',
        confidence: 88,
        match: inv.vsText.slice(0, 160),
        channel: 'unicode-hidden'
      }));
      findings.push.apply(findings, fwScanText(inv.vsText, { channel: 'unicode-hidden', pageHost: pageHost, _nested: true }));
    }
    if (inv.zwLongest >= 16 || inv.bidi >= 2) {
      findings.push(fwFinding('invisibleUnicode', {
        label: inv.bidi >= 2 ? 'Bidirectional override (Trojan Source)' : 'Long zero-width run',
        severity: 'medium',
        confidence: 70,
        match: (inv.zwLongest ? inv.zwLongest + ' zero-width chars' : inv.bidi + ' bidi marks'),
        channel: channel
      }));
    }
  }

  const keys = Object.keys(FW_SIGNATURES);
  for (const key of keys) {
    const sig = FW_SIGNATURES[key];
    if (!sig.patterns || !sig.patterns.length) continue;
    for (const re of sig.patterns) {
      const m = text.match(re);
      if (!m) continue;
      findings.push(fwDecorateFinding({
        family: key,
        label: sig.label,
        severity: sig.severity,
        match: m[0].slice(0, 200),
        confidence: sig.baseConfidence
      }, { channel: channel }));
    }
  }

  const unreleasedPhrase = typeof fwTextLooksUnreleased === 'function' ? fwTextLooksUnreleased(text) : null;
  const models = typeof fwIdentifyModels === 'function' ? fwIdentifyModels(text) : [];

  for (const hit of models) {
    const extras = {};
    if (unreleasedPhrase) extras.weights = 'unreleased / not public';
    if (typeof fwFrontierCheck === 'function') {
      const beyond = fwFrontierCheck(hit.match || text);
      if (beyond) extras.status = 'beyond-frontier';
    }
    const origin = fwOriginFromLab(hit.lab, extras);
    let confidence = 62;
    if (channel === 'html-comment' || channel === 'hidden' || channel === 'unicode-hidden') confidence = 84;
    if (channel === 'script' || channel === 'meta') confidence = 80;
    if (discussion && channel === 'text') confidence = Math.min(confidence, 28);
    findings.push(fwDecorateFinding({
      family: 'modelFingerprints',
      label: extras.status === 'beyond-frontier'
        ? 'Newer than any public release'
        : (unreleasedPhrase ? 'Unreleased catalog model' : 'Frontier-model fingerprint'),
      severity: discussion && channel === 'text' ? 'low' : (unreleasedPhrase || extras.status ? 'high' : 'medium'),
      match: hit.match,
      confidence: confidence
    }, {
      channel: channel,
      modelName: hit.modelName,
      modelId: hit.modelId,
      origin: origin
    }));
  }

  if (typeof fwFrontierMentions === 'function') {
    const beyond = fwFrontierMentions(text);
    for (let i = 0; i < beyond.length; i++) {
      const b = beyond[i];
      findings.push(fwFinding('unknownOrigin', {
        label: 'Newer than any public release',
        severity: 'high',
        confidence: 80,
        match: b.match,
        channel: channel,
        modelName: b.family + ' ' + b.version,
        origin: fwOriginFromLab(b.lab, {
          weights: 'unreleased / not public',
          status: 'beyond-frontier',
          lineage: 'Newer than any public ' + b.family + ' release (latest: ' + b.latest + ')'
        })
      }));
    }
  }

  if (typeof fwFindTemplates === 'function') {
    const tHits = fwFindTemplates(text);
    for (let i = 0; i < tHits.length; i++) {
      const t = tHits[i].template;
      const labId = typeof fwTemplateLab === 'function' ? fwTemplateLab(t) : (t.lab || 'unknown');
      findings.push(fwFinding(labId === 'unknown' ? 'unknownOrigin' : 'modelLineage', {
        label: t.name,
        severity: labId === 'unknown' ? 'medium' : 'high',
        confidence: t.confidence,
        match: tHits[i].match,
        channel: channel,
        modelName: t.lineage,
        origin: fwOriginFromLab(labId, { lineage: t.lineage, status: labId === 'unknown' ? 'unknown-model' : undefined })
      }));
    }
  }

  if (typeof fwFindArtifacts === 'function') {
    const aHits = fwFindArtifacts(text);
    for (let i = 0; i < aHits.length; i++) {
      const a = aHits[i].artifact;
      findings.push(fwFinding('modelLineage', {
        label: a.name,
        severity: 'high',
        confidence: a.confidence,
        match: aHits[i].match,
        channel: channel,
        modelName: a.product,
        origin: fwOriginFromLab(a.lab, { lineage: a.product })
      }));
    }
  }

  if (typeof fwFindModelIds === 'function') {
    const ids = fwFindModelIds(text);
    for (let i = 0; i < ids.length; i++) {
      const cls = fwClassifyModelId(ids[i].id);
      if (!cls) continue;
      const unknown = cls.lab === 'unknown' || cls.status === 'unknown-model' || cls.status === 'stealth';
      findings.push(fwFinding(unknown ? 'unknownOrigin' : 'modelLineage', {
        label: (typeof FW_STATUS !== 'undefined' && FW_STATUS[cls.status]) || 'Model identifier',
        severity: cls.status === 'internal-build' || cls.status === 'beyond-frontier' ? 'high' : 'medium',
        confidence: unknown ? 70 : 82,
        match: cls.id,
        channel: channel,
        modelName: cls.family || cls.id,
        origin: fwOriginFromLab(cls.lab, { lineage: fwStatusNote(cls), status: cls.status, weights: cls.status === 'internal-build' ? 'unreleased / not public' : undefined })
      }));
    }
  }

  if (!models.length && typeof fwIdentifyUnknown === 'function') {
    const unknowns = fwIdentifyUnknown(text);
    for (const hit of unknowns) {
      let confidence = 58;
      if (hit.why === 'markup' || hit.why === 'unreleased') confidence = 76;
      if (channel === 'html-comment' || channel === 'hidden' || channel === 'script' || channel === 'unicode-hidden') confidence += 8;
      if (discussion && channel === 'text' && hit.why === 'generic') confidence = 22;
      findings.push(fwFinding('unknownOrigin', {
        label: 'Unknown or unreleased model origin',
        severity: hit.why === 'generic' && discussion ? 'low' : 'medium',
        match: hit.match,
        confidence: Math.min(confidence, 92),
        channel: channel,
        modelName: hit.modelName,
        modelId: hit.modelId,
        origin: fwOriginFromLab(hit.lab, { lineage: hit.lineage, status: hit.status })
      }));
    }
  }

  return findings;
}

function fwScanUrls(urls) {
  const findings = [];
  if (!urls || !urls.length) return findings;
  const seen = {};
  for (let i = 0; i < urls.length; i++) {
    let host = '';
    try {
      host = new URL(urls[i], typeof location !== 'undefined' ? location.href : 'https://local.invalid').hostname;
    } catch (e) {
      continue;
    }
    if (typeof fwHostLab !== 'function') continue;
    const hit = fwHostLab(host);
    const raw = String(urls[i] || '');
    const localInfer = /:11434\b|ollama|lmstudio|127\.0\.0\.1.*(v1\/chat|v1\/completions)/i.test(raw);
    if (!hit && localInfer) {
      if (seen.unknown) continue;
      seen.unknown = true;
      const lab = typeof fwLab === 'function' ? fwLab('unknown') : null;
      findings.push(fwDecorateFinding({
        family: 'unknownOrigin',
        label: 'Local / unattributed inference host',
        severity: 'medium',
        match: raw.slice(0, 160),
        confidence: 72
      }, {
        channel: 'network',
        origin: fwOriginFromLab(lab)
      }));
      continue;
    }
    if (!hit) continue;
    const labId = hit.lab || 'unknown';
    if (seen[labId + (hit.gateway || '')]) continue;
    seen[labId + (hit.gateway || '')] = true;
    findings.push(fwDecorateFinding({
      family: hit.lab ? 'servingHints' : 'unknownOrigin',
      label: hit.gateway ? 'Gateway / hosted inference' : 'Model serving / API origin',
      severity: 'high',
      match: hit.label + ' · ' + host,
      confidence: 91
    }, {
      channel: 'network',
      origin: fwOriginFromLab(labId, { lineage: hit.gateway || hit.label })
    }));
  }
  return findings;
}

function fwScanMeta(doc) {
  const findings = [];
  if (!doc || !doc.querySelectorAll) return findings;
  const metas = doc.querySelectorAll('meta[name], meta[property]');
  for (const meta of metas) {
    const name = (meta.getAttribute('name') || meta.getAttribute('property') || '').toLowerCase();
    const content = meta.getAttribute('content') || '';
    if (!content) continue;
    if (/generator|author|llm|ai-model|created-with|application-name/i.test(name)) {
      const hits = fwScanText(content, { channel: 'meta' });
      for (const h of hits) findings.push(h);
    }
  }
  return findings;
}

function fwDedupe(findings) {
  const seen = {};
  const out = [];
  for (const f of findings) {
    const key = [f.family, f.match, f.modelId || '', f.origin && f.origin.labId || ''].join('|');
    if (seen[key]) continue;
    seen[key] = true;
    out.push(f);
  }
  return out;
}

function fwSummarizeOrigins(findings) {
  const byLab = {};
  for (const f of findings) {
    if (!f.origin || !f.origin.labId) continue;
    const id = f.origin.labId;
    if (!byLab[id]) {
      byLab[id] = {
        labId: id,
        lab: f.origin.lab,
        country: f.origin.country,
        hq: f.origin.hq,
        region: f.origin.region,
        weights: f.origin.weights,
        models: [],
        confidence: 0,
        channels: []
      };
    }
    const row = byLab[id];
    if (f.modelName && row.models.indexOf(f.modelName) === -1) row.models.push(f.modelName);
    if (f.channel && row.channels.indexOf(f.channel) === -1) row.channels.push(f.channel);
    if (f.confidence > row.confidence) row.confidence = f.confidence;
  }
  const list = [];
  for (const id of Object.keys(byLab)) list.push(byLab[id]);
  list.sort(function (a, b) { return b.confidence - a.confidence; });
  return list;
}

function fwFingerprint(findings) {
  return findings.map(function (f) {
    return f.family + ':' + (f.match || '').slice(0, 40);
  }).sort().join('|');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FW_SIGNATURES: FW_SIGNATURES,
    fwScanText: fwScanText,
    fwScanUrls: fwScanUrls,
    fwScanMeta: fwScanMeta,
    fwDedupe: fwDedupe,
    fwSummarizeOrigins: fwSummarizeOrigins,
    fwFingerprint: fwFingerprint,
    fwOriginFromLab: fwOriginFromLab,
    fwFinding: fwFinding
  };
}
