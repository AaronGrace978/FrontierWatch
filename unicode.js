// FrontierWatch — invisible-Unicode analysis. Language models read characters that
// browsers render as nothing, so attackers hide instructions in them:
//   Unicode tag characters (U+E0000–E007F)  "ASCII smuggling"
//   variation-selector runs (U+FE00–FE0F, U+E0100–E01EF)  bytes hidden behind an emoji
//   long zero-width runs and bidi overrides  steganography / Trojan-Source tricks
// This module decodes the hidden text so the normal detectors can scan it.

'use strict';

const FW_INVISIBLE_PREFILTER = /[\u200B-\u200D\u2060-\u2064\uFEFF\u180E\u202D\u202E\uFE00-\uFE0F]|\uDB40[\uDC00-\uDDEF]/;
const FW_FLAG_TAG_SEQ = /\u{1F3F4}[\u{E0020}-\u{E007E}]{1,12}\u{E007F}/gu;
const FW_ZW_RUN = /[\u200B\u200C\u200D\u2060-\u2064\uFEFF\u180E]{8,}/g;
const FW_BIDI_OVERRIDE = /[\u202D\u202E]/g;
const FW_VS_RUN = /(?:[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]){8,}/g;

function fwUtf8Decode(bytes) {
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch (e) {
    return String.fromCharCode.apply(null, bytes);
  }
}

// Tag characters mirror ASCII (U+E0041 is an invisible "A"). Subdivision flags such as
// England's use a short tag run legitimately, so those sequences are removed first.
function fwDecodeTagChars(text) {
  const stripped = text.replace(FW_FLAG_TAG_SEQ, '');
  let decoded = '';
  let count = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xE0000 && cp <= 0xE007F) {
      count++;
      if (cp >= 0xE0020 && cp <= 0xE007E && decoded.length < 4000) decoded += String.fromCharCode(cp - 0xE0000);
    }
  }
  return { count: count, decoded: decoded };
}

// Each variation selector carries one byte: VS1–VS16 are 0–15, VS17–VS256 are 16–255.
function fwDecodeVariationRuns(text) {
  const out = [];
  FW_VS_RUN.lastIndex = 0;
  let m;
  while ((m = FW_VS_RUN.exec(text)) && out.length < 4) {
    const bytes = [];
    for (const ch of m[0]) {
      const cp = ch.codePointAt(0);
      bytes.push(cp <= 0xFE0F ? cp - 0xFE00 : cp - 0xE0100 + 16);
    }
    out.push(fwUtf8Decode(bytes));
  }
  return out.join(' ');
}

function fwInvisibleScan(text) {
  const r = { tagCount: 0, tagText: '', vsText: '', zwRuns: 0, zwLongest: 0, bidi: 0 };
  if (!text || !FW_INVISIBLE_PREFILTER.test(text)) return r;
  const tags = fwDecodeTagChars(text);
  r.tagCount = tags.count;
  r.tagText = tags.decoded;
  r.vsText = fwDecodeVariationRuns(text);
  const zw = text.match(FW_ZW_RUN) || [];
  r.zwRuns = zw.length;
  for (const z of zw) r.zwLongest = Math.max(r.zwLongest, z.length);
  r.bidi = (text.match(FW_BIDI_OVERRIDE) || []).length;
  return r;
}

// Builds a tag-character payload; used by the test suite and the demo fixture.
function fwEncodeTagChars(ascii) {
  let out = '';
  for (const ch of String(ascii)) {
    const c = ch.charCodeAt(0);
    if (c >= 0x20 && c <= 0x7E) out += String.fromCodePoint(0xE0000 + c);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fwInvisibleScan: fwInvisibleScan,
    fwDecodeTagChars: fwDecodeTagChars,
    fwEncodeTagChars: fwEncodeTagChars
  };
}
