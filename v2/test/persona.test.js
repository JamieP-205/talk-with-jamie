"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rankContext, validateContextPack } = require("../netlify/functions/_context");
const { PUBLIC_PERSONA_CHUNKS } = require("../netlify/functions/_persona");
const { CORE_PERSONA_PROMPT } = require("../netlify/functions/_lib");

const pack = validateContextPack({
  name: "Public persona test",
  chunks: PUBLIC_PERSONA_CHUNKS
});

function selectedIds(query) {
  return rankContext(pack, {
    query,
    audience: "public",
    maxResults: 7,
    maxChars: 10_000
  }).map((chunk) => chunk.id);
}

test("public persona answers project questions from approved evidence", () => {
  assert.ok(selectedIds("What websites and projects have you built?").includes("public-projects"));
});

test("public persona retrieves entertainment interests without exact keywords", () => {
  assert.ok(selectedIds("What shows, movies and games are you into?").includes("public-media-interests"));
});

test("public persona retrieves decision style and goals", () => {
  assert.ok(selectedIds("Why do you double check choices before spending money?").includes("public-decision-style"));
  assert.ok(selectedIds("What do you want to do in the future with your career?").includes("public-goals"));
});

test("private chunks remain unavailable to public retrieval", () => {
  const mixedPack = validateContextPack({
    name: "Mixed persona",
    chunks: [
      ...PUBLIC_PERSONA_CHUNKS,
      {
        id: "private-finance",
        title: "Private finance",
        type: "knowledge",
        audience: "admin",
        tags: ["money"],
        text: "Private financial information."
      }
    ]
  });
  const selected = rankContext(mixedPack, {
    query: "money",
    audience: "public"
  });
  assert.ok(!selected.some((chunk) => chunk.id === "private-finance"));
});

test("core persona uses first-person digital-twin framing", () => {
  assert.match(CORE_PERSONA_PROMPT, /speak from Jamie's approved persona in first person/i);
  assert.match(CORE_PERSONA_PROMPT, /say I, me and my/i);
  assert.match(CORE_PERSONA_PROMPT, /Do not repeatedly announce AI Jamie/i);
  assert.match(CORE_PERSONA_PROMPT, /Do not finish with generic offers/i);
  assert.match(CORE_PERSONA_PROMPT, /not a phrasebook/i);
  assert.match(CORE_PERSONA_PROMPT, /Avoid reusing a distinctive phrase/i);
  assert.doesNotMatch(CORE_PERSONA_PROMPT, /inspired by Jamie's conversational style/i);
  assert.doesNotMatch(CORE_PERSONA_PROMPT, /wording such as yeah/i);
});

test("approved persona facts are written in first person", () => {
  const projects = PUBLIC_PERSONA_CHUNKS.find((chunk) => chunk.id === "public-projects");
  const interests = PUBLIC_PERSONA_CHUNKS.find((chunk) => chunk.id === "public-tech-interests");
  assert.match(projects.text, /My projects include/);
  assert.match(interests.text, /I am into AI/);
  assert.doesNotMatch(projects.text, /Jamie's projects include/);
});
