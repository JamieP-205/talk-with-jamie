"use strict";

const crypto = require("crypto");

const MAX_CONTEXT_CHUNKS = 1_200;
const MAX_CONTEXT_TEXT = 2_400;
const MAX_PACK_BYTES = 2_500_000;
const AUDIENCES = new Set(["public", "trusted", "admin"]);

function cleanValue(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function tokenize(value) {
  const stopwords = new Set([
    "about", "after", "again", "also", "and", "are", "because", "been", "before",
    "being", "but", "can", "could", "did", "do", "does", "for", "from", "has",
    "have", "how", "into", "history", "life", "message", "personal", "private",
    "get", "got", "just", "know", "like", "mention", "mentioned", "more", "plan",
    "planning", "really", "reply", "respond", "said", "say", "speak", "style",
    "talk", "tell", "text", "that", "the", "their", "them", "tone",
    "then", "there", "these", "they", "think", "this", "was", "what", "when",
    "to", "where", "which", "who", "why", "with", "would", "you", "your"
  ]);
  const words = cleanValue(value, 20_000)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9][a-z0-9'-]{1,}/g) || [];
  return Array.from(new Set(words.filter((word) => !stopwords.has(word)))).slice(0, 100);
}

const TERM_ALIASES = new Map([
  ["career", ["job", "employability", "work"]],
  ["coding", ["code", "programming", "software", "project"]],
  ["computer", ["computing", "technology", "tech"]],
  ["date", ["dating", "romantic", "relationship"]],
  ["dating", ["date", "romantic", "relationship"]],
  ["friend", ["friends", "social", "mate"]],
  ["friends", ["friend", "social", "mate"]],
  ["brian", ["brian morgan", "brinmorgan4", "b morgan"]],
  ["kyle", ["kyle murphy", "kylemlfc9", "k.yl.emurphy"]],
  ["reece", ["reece podesta", "reece_pod12", "rpodesta92"]],
  ["poddy", ["paudie", "brother", "sibling"]],
  ["paudie", ["poddy", "brother", "sibling"]],
  ["sister", ["siblings", "livvy", "olivia", "family"]],
  ["brother", ["siblings", "family", "poddy", "paudie"]],
  ["religion", ["catholic", "atheist", "belief"]],
  ["fun", ["hobby", "hobbies", "entertainment", "social"]],
  ["games", ["gaming", "minecraft"]],
  ["girlfriend", ["romantic", "dating", "relationship"]],
  ["hobbies", ["hobby", "fun", "entertainment", "interests"]],
  ["joke", ["humour", "funny", "playful", "banter"]],
  ["money", ["finance", "financial", "budget"]],
  ["movies", ["film", "films", "media"]],
  ["phone", ["android", "samsung", "mobile"]],
  ["politics", ["political", "government", "opinion"]],
  ["reply", ["respond", "message", "style", "tone"]],
  ["sad", ["upset", "supportive", "comfort", "reassure"]],
  ["shows", ["television", "film", "media"]],
  ["upset", ["sad", "supportive", "comfort", "reassure"]],
  ["uni", ["university", "ulster", "student"]],
  ["worried", ["worry", "supportive", "reassure"]],
  ["work", ["job", "career", "employability"]]
]);

function expandTerms(terms) {
  const expanded = new Set(terms);
  for (const term of terms) {
    if (term.length > 4 && term.endsWith("ies")) expanded.add(`${term.slice(0, -3)}y`);
    else if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) expanded.add(term.slice(0, -1));
    if (term.length > 5 && term.endsWith("ing")) {
      expanded.add(term.slice(0, -3));
      expanded.add(`${term.slice(0, -3)}e`);
    }
    if (term.length > 4 && term.endsWith("ed")) {
      expanded.add(term.slice(0, -2));
      expanded.add(`${term.slice(0, -1)}`);
    }
    for (const alias of TERM_ALIASES.get(term) || []) expanded.add(alias);
  }
  return [...expanded].slice(0, 140);
}

function validateContextPack(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Context pack must be a JSON object.");
  }

  const rawBytes = Buffer.byteLength(JSON.stringify(input), "utf8");
  if (rawBytes > MAX_PACK_BYTES) throw new Error("Context pack is larger than 2.5 MB.");

  const rawChunks = Array.isArray(input.chunks) ? input.chunks : [];
  if (!rawChunks.length) throw new Error("Context pack contains no chunks.");
  if (rawChunks.length > MAX_CONTEXT_CHUNKS) throw new Error("Context pack contains too many chunks.");

  const seen = new Set();
  const chunks = rawChunks.map((chunk, index) => {
    const text = cleanValue(chunk?.text, MAX_CONTEXT_TEXT);
    if (!text) throw new Error(`Context chunk ${index + 1} is empty.`);

    const id = cleanValue(chunk?.id, 100)
      || crypto.createHash("sha256").update(`${index}:${text}`).digest("hex").slice(0, 20);
    if (seen.has(id)) throw new Error(`Context chunk id "${id}" is duplicated.`);
    seen.add(id);

    const audience = AUDIENCES.has(chunk?.audience) ? chunk.audience : "admin";
    return {
      id,
      title: cleanValue(chunk?.title, 160),
      type: cleanValue(chunk?.type, 60) || "knowledge",
      audience,
      contactKey: cleanValue(chunk?.contactKey, 80).toLowerCase(),
      tags: Array.isArray(chunk?.tags)
        ? chunk.tags.slice(0, 24).map((tag) => cleanValue(tag, 60).toLowerCase()).filter(Boolean)
        : [],
      text,
      always: Boolean(chunk?.always)
    };
  });

  const pack = {
    schemaVersion: 2,
    name: cleanValue(input.name, 120) || "Jamie private context",
    generatedAt: cleanValue(input.generatedAt, 40) || new Date().toISOString(),
    sourceSummary: Array.isArray(input.sourceSummary)
      ? input.sourceSummary.slice(0, 20).map((item) => cleanValue(item, 200)).filter(Boolean)
      : [],
    chunks
  };
  pack.fingerprint = crypto.createHash("sha256").update(JSON.stringify(pack)).digest("hex").slice(0, 16);
  return pack;
}

function audienceAllowed(chunk, audience, contactKey) {
  if (audience === "admin") return true;
  if (chunk.audience === "public") return true;
  return audience === "trusted"
    && chunk.audience === "trusted"
    && chunk.contactKey
    && chunk.contactKey === cleanValue(contactKey, 80).toLowerCase();
}

function occurrenceScore(haystack, term, weight) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "g"));
  return Math.min(matches?.length || 0, 5) * weight;
}

function queryIntent(query) {
  return {
    style: /\b(?:how (?:would|should) i|what (?:would|should) i say|reply|respond|message|text|word|phrase|sound|tone|speak|talk to|write to|joke|funny|humour|banter)\b/i.test(query),
    relationship: /\b(?:friend|family|mum|dad|brother|girlfriend|boyfriend|relationship|dating|person|people|who is|history with|know about)\b/i.test(query),
    fact: /\b(?:what|when|where|which|who|remember|history|have i|did i|do i|my|about me)\b/i.test(query),
    technical: /\b(?:technical|technology|code|coding|website|project|research|compare|decision|problem|fix|laptop|phone)\b/i.test(query)
  };
}

function typePriority(chunk, intent) {
  switch (chunk.type) {
    case "verified-fact":
      return intent.fact || intent.relationship ? 72 : 28;
    case "relationship-dossier":
      return intent.relationship ? 68 : intent.fact ? 42 : 8;
    case "relationship-evidence":
      return intent.relationship ? 42 : intent.fact ? 22 : -4;
    case "relationship-history":
      return intent.relationship ? 48 : intent.fact ? 24 : 4;
    case "life-area-summary":
      return intent.fact ? 42 : 10;
    case "life-area-evidence":
      return intent.fact ? 38 : 12;
    case "life-area":
    case "profile-claims":
      return intent.fact ? 28 : 8;
    case "style-mode":
      return intent.style ? 52 : 2;
    case "style-profile":
    case "style":
      return intent.style ? 28 : 4;
    case "long-form-evidence":
    case "long-form-style":
      return intent.technical ? 18 : -10;
    case "style-examples":
      return intent.style ? 8 : -12;
    default:
      return 0;
  }
}

function selectionGroup(chunk) {
  if (["relationship-history", "relationship-dossier", "relationship-evidence"].includes(chunk.type)) {
    return `relationship:${chunk.contactKey || chunk.title}`;
  }
  return `${chunk.type}:${chunk.title}`;
}

function selectionLimit(chunk, intent) {
  if (chunk.type === "relationship-dossier") return 1;
  if (chunk.type === "relationship-evidence") return intent.relationship ? 3 : 2;
  if (chunk.type === "relationship-history") return intent.relationship ? 3 : 2;
  if (chunk.type === "style-mode") return intent.style ? 2 : 1;
  if (chunk.type === "long-form-evidence" || chunk.type === "long-form-style") return intent.technical ? 3 : 1;
  if (chunk.type === "life-area-evidence") return 2;
  return 1;
}

function typeSelectionLimit(chunk, intent) {
  if (chunk.type === "verified-fact") return 5;
  if (chunk.type === "relationship-dossier") return intent.relationship ? 4 : 3;
  if (chunk.type === "relationship-evidence") return intent.relationship ? 5 : 3;
  if (chunk.type === "life-area-summary") return 5;
  if (chunk.type === "relationship-history") return intent.relationship ? 4 : 3;
  if (chunk.type === "style-mode") return intent.style ? 4 : 2;
  if (chunk.type === "long-form-evidence" || chunk.type === "long-form-style") return 3;
  if (chunk.type === "life-area-evidence") return 6;
  return 16;
}

function rankContext(pack, options = {}) {
  if (!pack?.chunks?.length) return [];

  const audience = options.audience || "public";
  const contactKey = cleanValue(options.contactKey, 80).toLowerCase();
  const maxResults = Math.max(1, Math.min(Number(options.maxResults) || 8, 16));
  const maxChars = Math.max(1_000, Math.min(Number(options.maxChars) || 10_000, 24_000));
  const terms = expandTerms(tokenize(options.query));
  const normalisedQuery = cleanValue(options.query, 20_000).toLowerCase();
  const intent = queryIntent(normalisedQuery);

  const ranked = pack.chunks.flatMap((chunk, index) => {
    if (!audienceAllowed(chunk, audience, contactKey)) return [];

    const title = chunk.title.toLowerCase();
    const tags = chunk.tags.join(" ");
    const text = chunk.text.toLowerCase();
    let score = chunk.always ? 12 : 0;
    let matched = chunk.always;

    if (contactKey && chunk.contactKey === contactKey) {
      score += 120;
      matched = true;
    }
    if (!terms.length && ["profile", "preferences", "goals"].includes(chunk.type)) {
      score += 8;
      matched = true;
    }
    for (const phrase of chunk.tags.filter((tag) => tag.includes(" "))) {
      if (normalisedQuery.includes(phrase)) {
        score += 30;
        matched = true;
      }
    }
    for (const term of terms) {
      const termScore = occurrenceScore(tags, term, 12)
        + occurrenceScore(title, term, 7)
        + occurrenceScore(text, term, 2);
      score += termScore;
      if (termScore) matched = true;
    }

    if (!matched) return [];
    score += typePriority(chunk, intent);
    if (["relationship-history", "relationship-dossier", "relationship-evidence"].includes(chunk.type) && !contactKey) {
      const personLabel = title.replace(/^private relationship (?:history|dossier|evidence):\s*/i, "");
      const exactPersonMatch = personLabel.length >= 3 && normalisedQuery.includes(personLabel);
      const firstName = personLabel.split(/\s+/)[0];
      const firstNameMatch = firstName.length >= 4 && normalisedQuery.includes(firstName);
      score += exactPersonMatch ? 140 : firstNameMatch ? 90 : (intent.relationship ? -90 : 0);
    }
    if (score <= 0) return [];
    return [{ ...chunk, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = [];
  const groupCounts = new Map();
  const typeCounts = new Map();
  let usedChars = 0;
  for (const chunk of ranked) {
    if (selected.length >= maxResults) break;
    if (usedChars + chunk.text.length > maxChars && selected.length) continue;
    const group = selectionGroup(chunk);
    const groupCount = groupCounts.get(group) || 0;
    if (groupCount >= selectionLimit(chunk, intent)) continue;
    const typeCount = typeCounts.get(chunk.type) || 0;
    if (typeCount >= typeSelectionLimit(chunk, intent)) continue;
    selected.push(chunk);
    groupCounts.set(group, groupCount + 1);
    typeCounts.set(chunk.type, typeCount + 1);
    usedChars += chunk.text.length;
  }
  return selected;
}

function formatContext(chunks) {
  return chunks.map((chunk, index) => [
    `[Context ${index + 1}: ${chunk.title || chunk.type}]`,
    chunk.text
  ].join("\n")).join("\n\n");
}

module.exports = {
  MAX_PACK_BYTES,
  formatContext,
  expandTerms,
  queryIntent,
  rankContext,
  tokenize,
  validateContextPack
};
