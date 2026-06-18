#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validateContextPack } = require("../netlify/functions/_context");
const { PUBLIC_PERSONA_CHUNKS } = require("../netlify/functions/_persona");

const argv = process.argv.slice(2);

function argument(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : path.resolve(fallback);
}

const sourceDir = argument("source", path.join(__dirname, "..", "..", ".private-context-source"));
const outputFile = argument(
  "output",
  path.join(__dirname, "..", "..", ".private-context", "talk-with-jamie-v2.context-pack.json")
);

const MASTER_FILE = "JAMIE_DIGITAL_TWIN_MASTER_EVERYTHING_v3_PHONE_OPENABLE.txt";
const ASSISTANT_EXPORT_FILE = "assistant_conversation_export_v1.md";
const PLATFORM_CHUNK_LIMITS = {
  relationships: 420,
  lifeAreas: 48,
  styleModes: 24
};

const contactMap = new Map([
  ["WhatsApp Chat with Dad.txt", { contactKey: "dad", relationship: "family, Dad, media and practical chat" }],
  ["WhatsApp Chat with Mum.txt", { contactKey: "mum", relationship: "family, Mum, practical everyday chat" }],
  ["WhatsApp Chat with Poddy.txt", { contactKey: "poddy", relationship: "brother and casual family chat" }],
  ["WhatsApp Chat with James Parr.txt", { contactKey: "james", relationship: "family chat" }],
  ["WhatsApp Chat with Goretti.txt", { contactKey: "goretti", relationship: "family chat" }],
  ["WhatsApp Chat with Johnny Carr.txt", { contactKey: "johnny", relationship: "work and family contact" }],
  ["WhatsApp Chat with Tony Carr.txt", { contactKey: "tony", relationship: "family chat" }],
  ["WhatsApp Chat with Frank.txt", { contactKey: "frank", relationship: "manager and work chat" }]
]);

const severePrivatePatterns = [
  /\b(?:password|passcode|one[- ]time code|otp|pin number|api key|secret key|private key|access token|sort code|account number|card number|iban|swift code)\b/i,
  /\b(?:nudes?|explicit|porn|self harm|suicid|cocaine|ketamine|mdma)\b/i,
  /\b(?:faggot|nigger|chink|paki)\b/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i
];

function read(name) {
  const file = path.join(sourceDir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing source file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function redact(value) {
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/(?:\+?44\s?7\d{3}|07\d{3})(?:[\s-]?\d){6}/g, "[phone removed]")
    .replace(/\b\d{6,}\b/g, "[number removed]")
    .replace(/<This message was edited>/gi, "")
    .replace(/<Media omitted>|image omitted|video omitted|sticker omitted/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeText(value, max = 2_300) {
  const text = redact(value);
  if (!text || severePrivatePatterns.some((pattern) => pattern.test(text))) return "";
  return text.slice(0, max);
}

function chunkText(text, max = 2_200) {
  const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > max) {
      if (current) chunks.push(current);
      for (let index = 0; index < paragraph.length; index += max) {
        chunks.push(paragraph.slice(index, index + max));
      }
      current = "";
      continue;
    }
    if (current && current.length + paragraph.length + 2 > max) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) return "";
  return text.slice(start, end);
}

function parseWhatsapp(text) {
  const messages = [];
  let current = null;
  const header = /^(?:\[)?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?(?:\])?\s*[-–]\s*([^:]+):\s*(.*)$/i;

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(header);
    if (match) {
      if (current) messages.push(current);
      current = { sender: match[1].trim(), text: match[2] };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  if (current) messages.push(current);
  return messages;
}

function evenlySample(items, limit) {
  if (items.length <= limit) return items;
  const selected = [];
  const step = items.length / limit;
  for (let index = 0; index < limit; index += 1) {
    selected.push(items[Math.floor(index * step)]);
  }
  return selected;
}

function masterFile() {
  return read(MASTER_FILE);
}

function masterSection(master, startMarker, endMarker) {
  const start = master.indexOf(startMarker);
  const end = master.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) return "";
  return master.slice(start, end);
}

function fencedSections(text) {
  const sections = [];
  const pattern = /^#{3,4}\s+(.+?)\r?\n\r?\n```text\r?\n([\s\S]*?)\r?\n```/gm;
  for (const match of text.matchAll(pattern)) {
    sections.push({ title: match[1].trim(), text: match[2] });
  }
  return sections;
}

function messageTimestamp(line) {
  return /^(?:[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s+(?:\d{1,2}:\d{2}(?::\d{2})?|\[REDACTED_[^\]]+\])(?:\s+(?:am|pm|UTC))?/i.test(line.trim())
    || /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?/i.test(line.trim())
    || /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}/.test(line.trim());
}

function nextNonEmptyLine(lines, start) {
  let index = start;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
}

function conversationLabel(item, platform) {
  const lines = item.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (platform === "snapchat") {
    const heading = lines.find((line) => /^Chat History with /i.test(line));
    return safeText(heading?.replace(/^Chat History with /i, "") || "unknown conversation", 100);
  }
  const first = lines.find((line) => !/^Generated\s+by\s/i.test(line));
  if (first) return safeText(first, 100);
  const pathPart = item.title.split("/").slice(-2, -1)[0] || "unknown conversation";
  return safeText(pathPart.replace(/_\d+$/, "").replace(/[_-]+/g, " "), 100);
}

function contextualMessage(text, label, timestamp) {
  const details = [
    label ? `conversation: ${label}` : "",
    timestamp ? `date: ${timestamp}` : ""
  ].filter(Boolean).join("; ");
  return details ? `[${details}] ${text}` : text;
}

function sourceTags(title) {
  return String(title)
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .match(/[a-z0-9][a-z0-9'-]{2,}/g)
    ?.filter((tag) => !["html", "message", "conversation", "history", "subpage", "with"].includes(tag))
    .slice(0, 10) || [];
}

function usableAuthoredMessage(value, max = 700) {
  const raw = String(value).trim();
  if (!raw
    || /sent an attachment|reacted .+ to (?:your|a) message|liked a message|missed your call|you can now call each other/i.test(raw)
    || /https?:\/\//i.test(raw)
    || raw === "MEDIA"
    || raw === "NOTE") {
    return "";
  }
  const cleaned = safeText(raw, max);
  if (cleaned.length < 2 || cleaned.split(/\s+/).length > 120) return "";
  return cleaned;
}

function meaningfulEvidence(value) {
  const text = usableAuthoredMessage(value, 700);
  if (!text
    || text.length < 12
    || /^(?:yeah+|ye+|yes+|no+|ok+|okay+|alright|thanks?|thankyou|lol|true|fair|same|never|nothing+|fine+)[.!? ]*$/i.test(text)
    || /^[\W_]+$/u.test(text)) {
    return "";
  }
  return text;
}

const SOCIAL_PLATFORMS = new Set(["whatsapp", "instagram", "snapchat", "facebook"]);
const ROMANTIC_PATTERN = /\b(?:baby|babe|girlfriend|boyfriend|dating|date night|romantic|flirt|kiss|kisses|love|miss you|attractive|cute|relationship|talking stage|my future|xx+)\b/i;
const SUPPORTIVE_PATTERN = /\b(?:hope you(?:'re| are| feel| get)?|sorry (?:to hear|you're|your|about|i|for)|worried|proud of you|here for you|feel better|you alright|are you okay|reassur|take your time|never feel like)\b/i;
const STYLE_SENSITIVE_PATTERN = /\b(?:cock|dick|boob|horny|naked|sexual|stoned|weed|cannabis|smoke)\b/i;

function likelyCopiedSocialText(record) {
  if (!SOCIAL_PLATFORMS.has(record.platform)) return false;
  const text = String(record.text || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const personalSignal = /\b(?:i|i'm|im|i've|ive|i'll|ill|me|my|mine|we|our|you|your)\b/i.test(text);
  const formalSignals = [
    /\b(?:according to|in conclusion|furthermore|therefore|the following|references?|bibliography|source:|chapter \d+)\b/i,
    /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+\S/m,
    /\b(?:historically|scientifically|statistically|legislation|methodology|analysis demonstrates)\b/i,
    /^(?:check|ensure|create|step \d+|here(?:'s| is)|to resolve this)\b/i
  ].filter((pattern) => pattern.test(text)).length;
  return text.length > 650
    || text.split(/\r?\n/).filter(Boolean).length > 4
    || (words.length > 90 && !personalSignal)
    || (formalSignals > 0 && text.length > 120)
    || (text.length > 380 && formalSignals > 0 && !personalSignal)
    || formalSignals >= 2;
}

function recordEvidence(record, options = {}) {
  const max = Number(options.max) || 700;
  const text = meaningfulEvidence(String(record.text || "").slice(0, max));
  if (!text || likelyCopiedSocialText({ ...record, text })) return "";
  if (options.forStyle && (text.length > 320 || text.split(/\s+/).length > 65)) return "";
  if (options.forStyle && (/\bmate\b/i.test(text) || /[—–]/.test(text))) return "";
  return text;
}

function normalisePerson(value) {
  return safeText(value, 100)
    .replace(/^[\s❤❤️🦦]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PERSON_ALIASES = new Map([
  ["oisindavies379", "Oisin Davies"],
  ["dylancarr02", "Dylan Carr"],
  ["itsrealbks", "RealBKS"],
  ["cmcmahon864", "Conaire McMahon"],
  ["kyle", "Kyle Murphy"],
  ["kyle ✯", "Kyle Murphy"],
  ["k.yl.emurphy", "Kyle Murphy"],
  ["kylemlfc9", "Kyle Murphy"],
  ["kyle murphy", "Kyle Murphy"],
  ["b morgan", "Brian Morgan"],
  ["brinmorgan4", "Brian Morgan"],
  ["brian morgan", "Brian Morgan"],
  ["reece", "Reece Podesta"],
  ["reece_pod12", "Reece Podesta"],
  ["rpodesta92", "Reece Podesta"],
  ["reece podesta", "Reece Podesta"],
  ["trinity6333", "Trinity"],
  ["poddy", "Paudie (Poddy)"],
  ["paudie", "Paudie (Poddy)"],
  ["fsparrow7", "Finley Sparrow"]
]);

function canonicalPerson(value) {
  const clean = normalisePerson(value);
  return PERSON_ALIASES.get(clean.toLowerCase()) || clean;
}

function slug(value) {
  return normalisePerson(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "unknown";
}

function dedupeRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.person}|${record.timestamp}|${record.text}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function timestampMillis(value) {
  const text = String(value || "").trim();
  const uk = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})/);
  if (uk) {
    const year = Number(uk[3]) < 100 ? 2_000 + Number(uk[3]) : Number(uk[3]);
    return Date.UTC(year, Number(uk[2]) - 1, Number(uk[1]), Number(uk[4]), Number(uk[5]));
  }
  const parsed = Date.parse(text.replace(/\[REDACTED_[^\]]+\]/g, "12:00"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidenceScore(record) {
  const text = record.text;
  let score = Math.min(text.length, 300) / 20;
  if (/\b(?:because|remember|when|used to|went|going|friend|family|work|uni|university|job|money|house|birthday|concert|movie|game|feel|worried|love|hate|prefer|think)\b/i.test(text)) score += 12;
  if (/\b(?:today|tomorrow|yesterday|last year|next year|202[0-9])\b/i.test(text)) score += 5;
  const year = new Date(timestampMillis(record.timestamp)).getUTCFullYear();
  if (year >= 2026) score += 12;
  else if (year === 2025) score += 8;
  else if (year === 2024) score += 4;
  if (text.length < 25) score -= 4;
  return score;
}

function diverseEvidence(records, limit, options = {}) {
  const ranked = dedupeRecords(records)
    .map((record) => ({ ...record, text: recordEvidence(record, options) }))
    .filter((record) => record.text)
    .sort((a, b) => evidenceScore(b) - evidenceScore(a));
  if (ranked.length <= limit) return ranked;
  const top = ranked.slice(0, Math.ceil(limit * 0.65));
  const rest = evenlySample(ranked.slice(top.length), limit - top.length);
  return [...top, ...rest].sort((a, b) => timestampMillis(a.timestamp) - timestampMillis(b.timestamp));
}

function recordLine(record) {
  const details = [
    record.person ? `person: ${record.person}` : "",
    record.platform ? `platform: ${record.platform}` : "",
    record.timestamp ? `date: ${record.timestamp}` : ""
  ].filter(Boolean).join("; ");
  return `- [${details}] ${record.text}`;
}

function parseWhatsappDetailed(text) {
  const records = [];
  let current = null;
  const header = /^(?:\[)?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?)(?:\])?\s*[-\u2013]\s*([^:]+):\s*(.*)$/i;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(header);
    if (match) {
      if (current) records.push(current);
      current = { timestamp: match[1].trim(), sender: match[2].trim(), text: match[3] };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  if (current) records.push(current);
  return records;
}

function groupedMessageChunks(messages, options) {
  const {
    idPrefix,
    title,
    platform,
    groupSize = 16,
    limit = 200,
    maxChunkChars = 2_250
  } = options;
  const selected = evenlySample(messages, limit * groupSize);
  const chunks = [];
  const prefix = `Jamie-authored ${platform} messages for private admin retrieval. Use people and dates only when relevant to Jamie's question; never expose the archive in bulk or reveal unrelated participants.`;
  let group = [];
  let groupChars = prefix.length;

  function addGroup() {
    if (!group.length || chunks.length >= limit) return;
    chunks.push({
      id: `${idPrefix}-${chunks.length + 1}`,
      title,
      type: "authored-message-evidence",
      audience: "admin",
      tags: [platform, "authored", "voice", "style", "conversation"],
      text: [
        prefix,
        ...group.map((message) => `- ${message}`)
      ].join("\n")
    });
    group = [];
    groupChars = prefix.length;
  }

  for (const message of selected) {
    const messageChars = message.length + 3;
    if (group.length && (group.length >= groupSize || groupChars + messageChars > maxChunkChars)) {
      addGroup();
    }
    if (chunks.length >= limit) break;
    group.push(message);
    groupChars += messageChars;
  }
  addGroup();
  return chunks;
}

function publicChunks() {
  return PUBLIC_PERSONA_CHUNKS.map((chunk) => ({ ...chunk, tags: [...chunk.tags] }));
}

function markdownSections(text, headingPattern) {
  const sections = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(headingPattern);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function masterChunks(master) {
  const claims = between(
    master,
    "## 2. Structured Jamie profile / evidence-backed claims",
    "## 3. High-level source-derived profile"
  );
  return chunkText(claims).flatMap((text, index) => {
    const cleaned = safeText(text);
    if (!cleaned) return [];
    return [{
      id: `master-claims-${index + 1}`,
      title: "Evidence-labelled Jamie profile claims",
      type: "profile-claims",
      audience: "admin",
      tags: ["profile", "evidence", "confidence", "sensitivity", "jamie"],
      text: cleaned
    }];
  });
}

function assistantExportChunks() {
  return diverseEvidence(assistantExportRecords(), 50).map((record, index) => ({
    id: `assistant-export-${index + 1}`,
    title: `Jamie request: ${safeText(record.topic || "Private request", 120)}`,
    type: "long-form-evidence",
    audience: "admin",
    tags: ["assistant_export", "technical", "decision", "project", "long-form", ...sourceTags(record.topic)],
    text: recordLine(record)
  }));
}

function structuredProfileChunks(master) {
  const section = between(
    master,
    "## 3. High-level source-derived profile",
    "## 4. Quantitative style dataset"
  );
  return markdownSections(section, /^###\s+3\.\d+\s+(.+)$/)
    .flatMap((item, index) => {
      const text = safeText(item.lines.join("\n"), 2_300);
      if (!text) return [];
      const tags = sourceTags(item.title);
      return [{
        id: `structured-profile-${index + 1}`,
        title: `Private profile: ${item.title}`,
        type: /writing|tone/i.test(item.title) ? "style-profile" : "life-area",
        audience: "admin",
        tags: ["private-profile", "jamie", ...tags],
        text
      }];
    });
}

function assistantExportRecords() {
  return markdownSections(read(ASSISTANT_EXPORT_FILE), /^###\s+\d+\.\s+(.+)$/)
    .flatMap((section) => {
      const joined = section.lines.join("\n");
      const timestamp = joined.match(/Date\/context:\s*([^\n]+)/i)?.[1]?.trim() || "";
      const fenced = joined.match(/```text\s*([\s\S]*?)```/i)?.[1]
        || joined.match(/`[^`]*``text\s*([\s\S]*?)`[^`]*``/i)?.[1]
        || joined.replace(/^- (?:Date\/context|Visibility|Training use|Notes):.*$/gmi, "");
      const text = meaningfulEvidence(fenced);
      return text ? [{
        person: "",
        platform: "assistant_export",
        timestamp,
        topic: section.title,
        text
      }] : [];
    });
}

function whatsappRecords() {
  const records = [];
  for (const [filename, meta] of contactMap) {
    const person = canonicalPerson(filename.replace(/^WhatsApp Chat with /, "").replace(/\.txt$/, ""));
    for (const [sequence, message] of parseWhatsappDetailed(read(filename)).entries()) {
      const text = meaningfulEvidence(message.text);
      if (!text) continue;
      records.push({
        person,
        platform: "whatsapp",
        timestamp: message.timestamp,
        sequence,
        speaker: message.sender.trim().toLowerCase() === "jamie parr" ? "jamie" : "contact",
        sender: canonicalPerson(message.sender),
        relationship: meta.relationship,
        contactKey: meta.contactKey,
        text
      });
    }
  }
  return records;
}

function cleanMessageBody(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !/^[❤❤️🦦😭👍].{1,100}$/u.test(line))
    .filter((line) => !/^\p{Extended_Pictographic}/u.test(line)
      && !/^\([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}.+\)$/.test(line))
    .join("\n");
}

function instagramRecords(master) {
  const section = masterSection(
    master,
    "### 8.6 Instagram raw extracted text files",
    "### 8.7 Snapchat raw extracted text files"
  );
  const records = [];
  for (const item of fencedSections(section)) {
    if (!/instagram_activity\/messages\/(?:inbox|message_requests)\//i.test(item.title)) continue;
    const person = canonicalPerson(conversationLabel(item, "instagram"));
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const sender = lines[index].trim();
      if (!sender || sender !== "Jamie" && sender !== conversationLabel(item, "instagram")) continue;
      const body = [];
      let cursor = index + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) body.push(lines[cursor]);
      const text = meaningfulEvidence(cleanMessageBody(body));
      if (text) records.push({
        person,
        platform: "instagram",
        timestamp: lines[cursor]?.trim() || "",
        sequence: index,
        speaker: sender === "Jamie" ? "jamie" : "contact",
        sender: sender === "Jamie" ? "Jamie" : person,
        text
      });
    }
  }
  return records;
}

function snapchatRecords(master) {
  const section = masterSection(
    master,
    "### 8.7 Snapchat raw extracted text files",
    "## 9. Unknowns / approval queue"
  );
  const records = [];
  for (const item of fencedSections(section)) {
    if (!/html\/chat_history\/subpage_/i.test(item.title)) continue;
    const person = canonicalPerson(conversationLabel(item, "snapchat"));
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length - 2; index += 1) {
      const sender = lines[index].trim();
      const typeIndex = nextNonEmptyLine(lines, index + 1);
      if (!sender || lines[typeIndex]?.trim() !== "TEXT") continue;
      const body = [];
      let cursor = typeIndex + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) body.push(lines[cursor]);
      const text = meaningfulEvidence(cleanMessageBody(body));
      if (text) records.push({
        person,
        platform: "snapchat",
        timestamp: lines[cursor]?.trim() || "",
        sequence: index,
        speaker: sender === "jamie_parr05" ? "jamie" : "contact",
        sender: sender === "jamie_parr05" ? "Jamie" : person,
        text
      });
    }
  }
  return records;
}

function facebookRecords(master) {
  const section = masterSection(master, "## Sanitised raw Facebook text", "# v3 synthesis update");
  const records = [];
  for (const item of fencedSections(section)) {
    if (!/facebook_activity\/messages\/(?:inbox|e2ee_cutover)\//i.test(item.title)) continue;
    const person = canonicalPerson(conversationLabel(item, "facebook"));
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const sender = lines[index].trim();
      if (!sender || sender !== "Jamie Parr" && sender !== conversationLabel(item, "facebook")) continue;
      const body = [];
      let cursor = index + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) body.push(lines[cursor]);
      const text = meaningfulEvidence(cleanMessageBody(body));
      if (text) records.push({
        person,
        platform: "facebook",
        timestamp: lines[cursor]?.trim() || "",
        sequence: index,
        speaker: sender === "Jamie Parr" ? "jamie" : "contact",
        sender: sender === "Jamie Parr" ? "Jamie" : person,
        text
      });
    }
  }
  return records;
}

const RELATIONSHIP_OVERRIDES = new Map([
  ["mum", "Jamie’s mum and a major part of his everyday family and practical life"],
  ["dad", "Jamie’s dad; their chat includes family, media and practical conversation"],
  ["paudie (poddy)", "Jamie’s older brother, known as both Paudie and Poddy"],
  ["james parr", "a family member in Jamie’s close family network"],
  ["goretti", "a family contact"],
  ["johnny carr", "a family and work contact"],
  ["tony carr", "a family contact"],
  ["frank", "Jamie’s manager and a recurring work contact"],
  ["brian morgan", "a recurring friend Jamie has spent time with in person and played PlayStation with"],
  ["kyle murphy", "a recurring friend and social contact across Instagram and Snapchat"],
  ["reece podesta", "a recurring friend and political/social discussion contact"],
  ["trinity", "a close romantic relationship in 2025 with affection, dates, plans and personal support"]
]);

function relationshipDescription(person, records) {
  const override = RELATIONSHIP_OVERRIDES.get(person.toLowerCase());
  if (override) return override;
  const known = records.find((record) => record.relationship)?.relationship;
  if (known) return known;
  const platforms = [...new Set(records.map((record) => record.platform))].join(", ");
  const romantic = records.filter((record) => ROMANTIC_PATTERN.test(record.text)).length;
  const supportive = records.filter((record) => SUPPORTIVE_PATTERN.test(record.text)).length;
  const frequency = records.length >= 150 ? "very frequent" : records.length >= 40 ? "recurring" : "documented";
  if (romantic >= 8) return `${frequency} romantic or affectionate contact on ${platforms}`;
  if (supportive >= 8) return `${frequency} close social contact with substantial supportive conversation on ${platforms}`;
  return `${frequency} social contact on ${platforms}; no more specific relationship label is asserted`;
}

const DOSSIER_TOPICS = [
  ["work", /\b(?:work|job|shift|manager|warehouse|cafe|pet connection|garden room|frank|johnny)\b/i],
  ["university and education", /\b(?:uni|university|ulster|college|course|class|assignment|exam|student)\b/i],
  ["meeting and social plans", /\b(?:meet|town|going out|night out|party|concert|ticket|belfast|come over|call)\b/i],
  ["gaming", /\b(?:game|gaming|playstation|xbox|minecraft|fortnite|cod)\b/i],
  ["films, television and music", /\b(?:film|movie|show|series|music|song|album|concert|marvel|anime)\b/i],
  ["family and home life", /\b(?:mum|dad|brother|sister|family|house|home|lift)\b/i],
  ["money and practical help", /\b(?:money|pay|paid|bank|rent|borrow|send|owe|afford|lift|bus|train)\b/i],
  ["politics and social issues", /\b(?:politic|government|election|protest|israel|palestine|sectarian|left wing|right wing|tory|labour|immigration)\b/i],
  ["relationships and dating", ROMANTIC_PATTERN],
  ["support and personal feelings", SUPPORTIVE_PATTERN],
  ["humour and casual banter", /\b(?:lol|haha|funny|joke|bro|😭|😂)\b/i]
];

function topicSummary(records) {
  return DOSSIER_TOPICS
    .map(([label, pattern]) => ({ label, count: records.filter((record) => pattern.test(record.text)).length }))
    .filter((topic) => topic.count)
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
}

function conversationCapsules(records, limit = 12) {
  const candidates = [];
  const ordered = [...records].sort((a, b) =>
    timestampMillis(a.timestamp) - timestampMillis(b.timestamp) || Number(a.sequence || 0) - Number(b.sequence || 0)
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const record = ordered[index];
    const text = recordEvidence(record, { max: 260 });
    if (!text || text.length < 24) continue;
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const linked = [previous, record, next]
      .filter(Boolean)
      .filter((item) => item.platform === record.platform)
      .map((item) => ({
        ...item,
        text: recordEvidence(item, { max: 220 })
      }))
      .filter((item) => item.text);
    candidates.push({
      ...record,
      text,
      capsule: linked.map((item) =>
        `${item.speaker === "jamie" ? "Jamie" : "Contact"}: ${item.text}`
      ).join(" / ")
    });
  }
  return diverseEvidence(candidates, limit, { max: 700 });
}

function relationshipChunks(records) {
  const grouped = new Map();
  for (const record of dedupeRecords(records)) {
    const person = canonicalPerson(record.person);
    if (!person || /^(?:unknown conversation|instagram user|jamie)$/i.test(person)) continue;
    const key = slug(person);
    if (!grouped.has(key)) grouped.set(key, { person, records: [] });
    const group = grouped.get(key);
    if (person.length > group.person.length && !/\d/.test(person)) group.person = person;
    group.records.push({ ...record, person: group.person });
  }

  const chunks = [];
  const groups = [...grouped.values()]
    .filter((group) => group.records.length >= 2)
    .sort((a, b) => b.records.length - a.records.length);
  for (const groupData of groups) {
    const { person, records: items } = groupData;
    const platforms = [...new Set(items.map((record) => record.platform))];
    const dates = items.map((record) => record.timestamp).filter(Boolean)
      .sort((a, b) => timestampMillis(a) - timestampMillis(b));
    const jamieCount = items.filter((record) => record.speaker !== "contact").length;
    const contactCount = items.filter((record) => record.speaker === "contact").length;
    const topics = topicSummary(items);
    const capsules = conversationCapsules(items, items.length >= 80 ? 14 : 8);
    chunks.push({
      id: `relationship-${slug(person)}-overview`,
      title: `Private relationship dossier: ${person}`,
      type: "relationship-dossier",
      audience: "admin",
      contactKey: items.find((record) => record.contactKey)?.contactKey || slug(person),
      tags: [
        "person", "relationship", "history", "memory", "social", person.toLowerCase(),
        ...sourceTags(person), ...platforms
      ],
      text: [
        `Person: ${person}.`,
        `Relationship: ${relationshipDescription(person, items)}.`,
        `Coverage: ${items.length} usable messages (${jamieCount} from Jamie and ${contactCount} from the contact) across ${platforms.join(", ")}${dates.length ? `, ranging from ${dates[0]} to ${dates.at(-1)}` : ""}.`,
        topics.length
          ? `Recurring subjects: ${topics.map((topic) => `${topic.label} (${topic.count})`).join("; ")}.`
          : "The available messages do not support a reliable topic summary.",
        "Treat the relationship label as a verified fact only where stated above. Counts describe the supplied archive, not the whole relationship."
      ].join("\n")
    });
    for (let index = 0; index < capsules.length && chunks.length < PLATFORM_CHUNK_LIMITS.relationships; index += 6) {
      const group = capsules.slice(index, index + 6);
      chunks.push({
        id: `relationship-${slug(person)}-${chunks.length + 1}`,
        title: `Private relationship evidence: ${person}`,
        type: "relationship-evidence",
        audience: "admin",
        contactKey: items.find((record) => record.contactKey)?.contactKey || slug(person),
        tags: [
          "person", "relationship", "history", "memory", "social",
          ...sourceTags(person), ...platforms
        ],
        text: [
          `Person: ${person}.`,
          `Relationship context: ${relationshipDescription(person, items)}.`,
          "Short redacted conversation capsules for answering a directly relevant private question. Never quote these in bulk or expose them as an archive:",
          ...group.map((record) => `- [${record.platform}; ${record.timestamp || "date unknown"}] ${record.capsule}`)
        ].join("\n")
      });
    }
    if (chunks.length >= PLATFORM_CHUNK_LIMITS.relationships) break;
  }
  return chunks;
}

function verifiedFactChunks() {
  const facts = [
    {
      id: "verified-family",
      title: "Verified private facts: family",
      tags: ["family", "siblings", "brothers", "sister", "livvy", "olivia", "paudie", "poddy"],
      text: [
        "Jamie has three brothers and one sister, all older than him.",
        "They are not all full siblings, but Jamie grew up with them for as long as he remembers and thinks of them as full siblings.",
        "Paudie, also called Poddy, is an older brother.",
        "Livvy or Olivia is very likely Jamie’s older sister based on repeated family evidence, but that name-to-sister link is a high-confidence inference rather than a single explicit statement."
      ].join("\n")
    },
    {
      id: "verified-work",
      title: "Verified private facts: work history",
      tags: ["work", "jobs", "pet connection", "garden room", "cafe", "warehouse", "no.7 duke", "frank", "johnny"],
      text: [
        "Jamie has worked as a Warehouse Operative at Pet Connection in Newry since October 2021.",
        "Jamie has worked as a Kitchen Porter at The Garden Room cafe in Warrenpoint since August 2024.",
        "Jamie previously worked as Floor Staff at No.7 Duke in Warrenpoint from June to September 2022.",
        "Frank is a manager and recurring work contact. Johnny Carr appears in both family and work context."
      ].join("\n")
    },
    {
      id: "verified-religion",
      title: "Verified private facts: religion and belief",
      tags: ["religion", "catholic", "atheist", "belief", "god", "church"],
      text: "Jamie comes from a Catholic background but is currently an atheist. Do not portray him as currently religious."
    },
    {
      id: "verified-politics",
      title: "Verified private guidance: current politics",
      tags: ["politics", "political", "left wing", "right wing", "sectarian", "israel", "palestine", "reece", "opinion"],
      text: [
        "For political answers, recent 2025-2026 evidence outranks older messages because Jamie says his views changed and he is definitely not right-wing now.",
        "Recent evidence supports a broadly left-leaning, anti-sectarian position, strong criticism of violence and hypocrisy, and willingness to use blunt language.",
        "Do not invent a party affiliation or a precise policy view that is not supported by retrieved recent evidence."
      ].join("\n")
    },
    {
      id: "verified-interests",
      title: "Verified private facts: broad interests",
      tags: ["interests", "hobbies", "films", "television", "music", "gaming", "anime", "nature", "food", "travel", "technology"],
      text: [
        "Jamie’s interests are broader than computing. They include television, films, music, gaming, anime, nature, food, travel, nights out, social life, personal finance and technology.",
        "Computing is an important study and project area, but ordinary answers should not be redirected toward coding or technology unless the question is actually about it."
      ].join("\n")
    },
    {
      id: "verified-key-people",
      title: "Verified private facts: key relationships",
      tags: ["brian", "brian morgan", "kyle", "kyle murphy", "trinity", "friends", "relationships"],
      text: [
        "Brian Morgan, also found as B Morgan and brinmorgan4, is a friend Jamie has spent time with in person and played PlayStation with.",
        "Kyle Murphy, also found as kyle, kyle ✯, k.yl.emurphy and kylemlfc9, is a recurring friend and social contact across Instagram and Snapchat.",
        "Trinity, also found as trinity6333, was a close romantic relationship in 2025 involving affection, dates, plans, practical help and personal reassurance."
      ].join("\n")
    },
    {
      id: "verified-voice",
      title: "Verified private guidance: Jamie’s voice",
      tags: ["voice", "style", "grammar", "punctuation", "humour", "profanity", "typing", "tone"],
      text: [
        "Jamie never uses em dashes and does not call people mate.",
        "His casual messages usually use sparse punctuation, loose grammar, abbreviations, occasional profanity and natural typing mistakes. He does not write like a polished assistant.",
        "Mistakes should look incidental rather than deliberately inserted into every reply. Do not repeat the same catchphrases across unrelated answers.",
        "Tone changes by person and situation: practical with family, more polite around work, casual and blunt with friends, affectionate in romantic conversation, and longer only when the subject genuinely needs detail.",
        "Humour can be dry, dark, absurd or blunt, but should follow the actual conversation rather than appear as a forced joke."
      ].join("\n")
    }
  ];
  return facts.map((fact) => ({
    ...fact,
    type: "verified-fact",
    audience: "admin",
    always: fact.id === "verified-interests",
    tags: ["verified", "current", ...fact.tags]
  }));
}

const LIFE_AREAS = [
  ["education", "Education and university life", /\b(?:uni|university|ulster|course|module|computing|student|college|src|assignment|exam|marks?|class)\b/i],
  ["work", "Jobs, work history and career", /\b(?:work|job|shift|cafe|warehouse|pet connection|garden room|frank|johnny|manager|payslip|interview|cv|linkedin|employ)\b/i],
  ["finance", "Financial life and money decisions", /\b(?:money|finance|bank|starling|revolut|plum|credit union|rent|bill|wage|pay|budget|afford|subscription|student finance)\b/i],
  ["family", "Family life and practical support", /\b(?:mum|dad|poddy|james|goretti|johnny|tony|family|grandad|stepdad|brother|house|lift)\b/i],
  ["friends", "Friends, social life and nights out", /\b(?:friend|friends|birthday|night out|party|concert|ticket|town|social|meet|going out|belfast)\b/i],
  ["romantic", "Romantic, dating and private relationship life", /\b(?:dating|date|girlfriend|boyfriend|relationship|romantic|flirt|kiss|cute|attractive|miss you|love you|talking stage)\b/i],
  ["health", "Health, physical life and routines", /\b(?:health|doctor|surgery|gym|weight|height|sleep|sick|ill|medicine|hospital|workout|muscle)\b/i],
  ["politics", "Political and social opinions", /\b(?:politic|government|protest|immigration|foreigners|war|election|labour|tory|left wing|right wing|marxist|bill|law)\b/i],
  ["worries", "Fears, worries and difficult decisions", /\b(?:worried|worry|scared|fear|stress|risk|wrong decision|not sure|double check|problem|broke|scam|trust)\b/i],
  ["hobbies", "Hobbies, media and entertainment", /\b(?:movie|film|show|series|music|song|album|concert|game|gaming|minecraft|anime|marvel|daredevil|invincible|black mirror|rock)\b/i],
  ["technology", "Technology, projects and digital habits", /\b(?:technology|tech|coding|code|website|project|ai|assistant|google_takeout|linux|android|samsung|laptop|phone|cyber|automation)\b/i],
  ["places", "Places, housing, travel and movement", /\b(?:belfast|newry|warrenpoint|house|move|rent|travel|trip|bus|train|town|home)\b/i]
];

function lifeAreaChunks(records) {
  const chunks = [];
  for (const [key, title, pattern] of LIFE_AREAS) {
    const matching = records.filter((record) =>
      record.speaker !== "contact" && pattern.test(`${record.topic || ""} ${record.text}`)
    );
    if (!matching.length) continue;
    const selected = diverseEvidence(matching, 10, { max: 320 });
    const people = [...new Set(matching.map((record) => record.person).filter(Boolean))]
      .sort((a, b) =>
        matching.filter((record) => record.person === b).length
        - matching.filter((record) => record.person === a).length
      )
      .slice(0, 12);
    const platforms = [...new Set(matching.map((record) => record.platform))];
    chunks.push({
      id: `life-${key}`,
      title: `Private life area: ${title}`,
      type: "life-area-summary",
      audience: "admin",
      tags: [key, "life", "history", "personal", "evidence", ...sourceTags(title)],
      text: [
        `${title}. The supplied data contains ${matching.length} relevant Jamie-authored messages across ${platforms.join(", ")}.`,
        people.length ? `People appearing most often in this area include: ${people.join(", ")}.` : "",
        "Older evidence may no longer be current. Use recent dated evidence first and distinguish direct facts from inference.",
        ...selected.slice(0, 6).map(recordLine)
      ].filter(Boolean).join("\n")
    });
  }
  return chunks;
}

const STYLE_MODES = [
  {
    key: "family-practical",
    title: "Family and practical logistics",
    tags: ["family", "mum", "dad", "brother", "practical", "logistics", "lift", "home"],
    filter: (record) => record.platform === "whatsapp"
      && /family|mum|dad|brother/i.test(record.relationship || "")
      && !ROMANTIC_PATTERN.test(record.text)
  },
  {
    key: "work-polite",
    title: "Managers, work and professional contacts",
    tags: ["manager", "work", "professional", "frank", "johnny", "shift", "reply"],
    filter: (record) => /\b(?:manager|work|frank|johnny)\b/i.test(`${record.relationship || ""} ${record.person || ""}`)
      && !ROMANTIC_PATTERN.test(record.text)
  },
  {
    key: "friends-casual",
    title: "Friends and casual social chat",
    tags: ["friend", "friends", "casual", "social", "reply", "chat"],
    filter: (record) => ["instagram", "snapchat", "facebook"].includes(record.platform)
      && record.text.length >= 8
      && record.text.length <= 150
      && !ROMANTIC_PATTERN.test(record.text)
      && !SUPPORTIVE_PATTERN.test(record.text)
      && !STYLE_SENSITIVE_PATTERN.test(record.text)
  },
  {
    key: "romantic-affectionate",
    title: "Romantic and affectionate conversation",
    tags: ["romantic", "relationship", "dating", "girlfriend", "boyfriend", "affectionate", "flirty", "reply"],
    filter: (record) => SOCIAL_PLATFORMS.has(record.platform)
      && ROMANTIC_PATTERN.test(record.text)
      && record.text.length <= 260
  },
  {
    key: "media-opinion",
    title: "Films, music, games and opinions",
    tags: ["film", "movie", "music", "game", "gaming", "show", "opinion", "media"],
    filter: (record) => /\b(?:movie|film|show|series|music|song|game|marvel|anime|concert|album)\b/i.test(record.text)
      && !ROMANTIC_PATTERN.test(record.text)
      && !SUPPORTIVE_PATTERN.test(record.text)
      && !STYLE_SENSITIVE_PATTERN.test(record.text)
  },
  {
    key: "humour",
    title: "Dry humour and playful reactions",
    tags: ["humour", "funny", "joke", "playful", "banter", "reaction", "reply"],
    filter: (record) => /\b(?:lol|haha|funny|joke|criminal|npc|bro)\b/i.test(record.text)
      && record.text.length <= 220
      && !ROMANTIC_PATTERN.test(record.text)
      && !STYLE_SENSITIVE_PATTERN.test(record.text)
  },
  {
    key: "supportive",
    title: "Supportive, concerned and reassuring replies",
    tags: ["supportive", "upset", "sad", "worried", "comfort", "reassure", "close friend", "reply"],
    filter: (record) => SUPPORTIVE_PATTERN.test(record.text)
      && record.text.length >= 40
      && record.text.length <= 260
      && !ROMANTIC_PATTERN.test(record.text)
      && !STYLE_SENSITIVE_PATTERN.test(record.text)
  },
  {
    key: "detailed",
    title: "Detailed technical and decision messages",
    tags: ["detailed", "technical", "decision", "research", "compare", "explain", "project"],
    filter: (record) => ["assistant_export", "google_takeout"].includes(record.platform) && record.text.length >= 180
  }
];

function styleModeChunks(records) {
  const chunks = [];
  for (const mode of STYLE_MODES) {
    const selected = diverseEvidence(records.filter(mode.filter), 12, { forStyle: true, max: 320 });
    for (let index = 0; index < selected.length && chunks.length < PLATFORM_CHUNK_LIMITS.styleModes; index += 6) {
      const group = selected.slice(index, index + 6);
      if (!group.length) continue;
      chunks.push({
        id: `style-mode-${mode.key}-${Math.floor(index / 6) + 1}`,
        title: `Private style mode: ${mode.title}`,
        type: "style-mode",
        audience: "admin",
        tags: [mode.key, "style", "tone", "scenario", "voice", ...mode.tags, ...sourceTags(mode.title)],
        text: [
          `${mode.title}. Treat these as a distribution of tone, length and reaction, never as reusable catchphrases.`,
          "Choose this mode only when the relationship and situation match. Do not copy an example verbatim:",
          ...group.map((record) => `- ${record.text}`)
        ].join("\n")
      });
    }
  }
  return chunks;
}

function whatsappChunks() {
  const chunks = [];
  for (const [filename, meta] of contactMap) {
    const messages = parseWhatsapp(read(filename))
      .filter((message) => message.sender.trim().toLowerCase() === "jamie parr")
      .map((message) => safeText(message.text, 500))
      .filter((text) => text.length >= 4 && text.length <= 500);
    const selected = evenlySample(messages, 160);

    for (let index = 0; index < selected.length; index += 12) {
      const group = selected.slice(index, index + 12);
      chunks.push({
        id: `whatsapp-${meta.contactKey}-${Math.floor(index / 12) + 1}`,
        title: `Jamie style with ${meta.contactKey}`,
        type: "relationship-style",
        audience: "admin",
        contactKey: meta.contactKey,
        tags: ["whatsapp", "texting", "relationship", meta.contactKey, ...meta.relationship.split(/[\s,]+/)],
        text: [
          `Relationship register: ${meta.relationship}.`,
          "Jamie-authored examples:",
          ...group.map((message) => `- ${message}`)
        ].join("\n")
      });
    }
  }
  return chunks;
}

function googleTakeoutChunks(master) {
  const section = masterSection(
    master,
    "### 8.5 Google Takeout raw extracted text",
    "### 8.6 Instagram raw extracted text files"
  );
  const chunks = [];
  for (const item of fencedSections(section)) {
    if (!item.title.includes("Google Takeout conversation history/")) continue;
    let conversation;
    try {
      conversation = JSON.parse(item.text);
    } catch {
      continue;
    }
    const prompts = (conversation.conversation_turns || [])
      .map((turn) => usableAuthoredMessage(turn?.user_turn?.prompt, 2_200))
      .filter(Boolean);
    for (let index = 0; index < prompts.length; index += 1) {
      chunks.push({
        id: `google_takeout-${chunks.length + 1}`,
        title: `Jamie Google export request: ${safeText(conversation.title || "Untitled", 120)}`,
        type: "long-form-style",
        audience: "admin",
        tags: ["google_takeout", "authored", "technical", "decision", ...sourceTags(conversation.title)],
        text: prompts[index]
      });
    }
  }
  return chunks.slice(0, PLATFORM_CHUNK_LIMITS.googleTakeout);
}

function instagramChunks(master) {
  const section = masterSection(
    master,
    "### 8.6 Instagram raw extracted text files",
    "### 8.7 Snapchat raw extracted text files"
  );
  const messages = [];
  for (const item of fencedSections(section)) {
    if (!/instagram_activity\/messages\/(?:inbox|message_requests)\//i.test(item.title)) continue;
    const label = conversationLabel(item, "instagram");
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].trim() !== "Jamie") continue;
      const body = [];
      let cursor = index + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) {
        body.push(lines[cursor]);
      }
      const message = usableAuthoredMessage(body.join("\n"), 700);
      if (message) messages.push(contextualMessage(message, label, lines[cursor]?.trim()));
    }
  }
  return groupedMessageChunks(messages, {
    idPrefix: "instagram-authored",
    title: "Jamie-authored Instagram voice evidence",
    platform: "instagram",
    groupSize: 16,
    limit: PLATFORM_CHUNK_LIMITS.instagram
  });
}

function snapchatChunks(master) {
  const section = masterSection(
    master,
    "### 8.7 Snapchat raw extracted text files",
    "## 9. Unknowns / approval queue"
  );
  const messages = [];
  for (const item of fencedSections(section)) {
    if (!/html\/chat_history\/subpage_/i.test(item.title)) continue;
    const label = conversationLabel(item, "snapchat");
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length - 2; index += 1) {
      if (lines[index].trim() !== "jamie_parr05") continue;
      const typeIndex = nextNonEmptyLine(lines, index + 1);
      if (lines[typeIndex]?.trim() !== "TEXT") continue;
      const body = [];
      let cursor = typeIndex + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) {
        body.push(lines[cursor]);
      }
      const message = usableAuthoredMessage(body.join("\n"), 500);
      if (message) messages.push(contextualMessage(message, label, lines[cursor]?.trim()));
    }
  }
  return groupedMessageChunks(messages, {
    idPrefix: "snapchat-authored",
    title: "Jamie-authored Snapchat voice evidence",
    platform: "snapchat",
    groupSize: 20,
    limit: PLATFORM_CHUNK_LIMITS.snapchat
  });
}

function facebookChunks(master) {
  const section = masterSection(master, "## Sanitised raw Facebook text", "# v3 synthesis update");
  const messages = [];
  for (const item of fencedSections(section)) {
    if (!/facebook_activity\/messages\/(?:inbox|e2ee_cutover)\//i.test(item.title)) continue;
    const label = conversationLabel(item, "facebook");
    const lines = item.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].trim() !== "Jamie Parr") continue;
      const body = [];
      let cursor = index + 1;
      for (; cursor < lines.length && !messageTimestamp(lines[cursor]); cursor += 1) {
        body.push(lines[cursor]);
      }
      const message = usableAuthoredMessage(body.join("\n"), 700);
      if (message) messages.push(contextualMessage(message, label, lines[cursor]?.trim()));
    }
  }
  return groupedMessageChunks(messages, {
    idPrefix: "facebook-authored",
    title: "Jamie-authored Facebook voice evidence",
    platform: "facebook",
    groupSize: 14,
    limit: PLATFORM_CHUNK_LIMITS.facebook
  });
}

function main() {
  const master = masterFile();
  const socialRecords = [
    ...whatsappRecords(),
    ...instagramRecords(master),
    ...snapchatRecords(master),
    ...facebookRecords(master)
  ];
  const authoredRecords = [
    ...socialRecords.filter((record) => record.speaker !== "contact"),
    ...assistantExportRecords().map((record) => ({ ...record, speaker: "jamie" }))
  ];
  const relationships = relationshipChunks(socialRecords.filter((record) => record.person));
  const lifeAreas = lifeAreaChunks(authoredRecords);
  const styleModes = styleModeChunks(authoredRecords);
  const chunks = [
    ...publicChunks(),
    ...verifiedFactChunks(),
    ...masterChunks(master),
    ...structuredProfileChunks(master),
    ...lifeAreas,
    ...relationships,
    ...styleModes
  ];
  const pack = validateContextPack({
    schemaVersion: 2,
    name: "Talk With Jamie v2 private context",
    generatedAt: new Date().toISOString(),
    sourceSummary: [
      "Curated public-safe persona derived from supplied evidence",
      "Owner-approved verified facts for family, work, religion, politics, interests and key relationships",
      "Evidence-labelled structured private profile and life-area records",
      `Cross-platform two-sided relationship dossiers and evidence capsules (${relationships.length} chunks)`,
      `Dated life-area summaries (${lifeAreas.length} chunks)`,
      `Scenario-specific style modes (${styleModes.length} chunks)`,
      "Aliases merged for recurring contacts across WhatsApp, Instagram, Snapchat and Facebook",
      "Raw exports, media, credentials and full conversation archives excluded"
    ],
    chunks
  });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(pack, null, 2)}\n`, { mode: 0o600 });

  const audienceCounts = pack.chunks.reduce((counts, chunk) => {
    counts[chunk.audience] = (counts[chunk.audience] || 0) + 1;
    return counts;
  }, {});
  console.log(`Created private context pack: ${outputFile}`);
  console.log(`Fingerprint: ${pack.fingerprint}`);
  console.log(`Chunks: ${pack.chunks.length} (${JSON.stringify(audienceCounts)})`);
  console.log(`Size: ${fs.statSync(outputFile).size} bytes`);
}

if (require.main === module) main();

module.exports = {
  LIFE_AREAS,
  STYLE_MODES,
  canonicalPerson,
  conversationLabel,
  contextualMessage,
  diverseEvidence,
  facebookChunks,
  fencedSections,
  googleTakeoutChunks,
  groupedMessageChunks,
  instagramChunks,
  lifeAreaChunks,
  likelyCopiedSocialText,
  messageTimestamp,
  recordEvidence,
  relationshipChunks,
  snapchatChunks,
  structuredProfileChunks,
  styleModeChunks,
  usableAuthoredMessage,
  verifiedFactChunks
};
