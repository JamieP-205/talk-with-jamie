"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatContext,
  rankContext,
  validateContextPack
} = require("../netlify/functions/_context");

const pack = validateContextPack({
  name: "Test pack",
  chunks: [
    {
      id: "style",
      title: "Public style",
      audience: "public",
      always: true,
      tags: ["style"],
      text: "Keep normal replies short and direct."
    },
    {
      id: "private",
      title: "Private project context",
      audience: "admin",
      tags: ["radio", "project"],
      text: "Private evidence about the radio project and an eyebrow piercing."
    },
    {
      id: "trusted-dad",
      title: "Dad register",
      audience: "trusted",
      contactKey: "dad",
      tags: ["music"],
      text: "Use familiar film and music chat."
    }
  ]
});

test("context packs are normalised and fingerprinted", () => {
  assert.equal(pack.schemaVersion, 2);
  assert.equal(pack.chunks.length, 3);
  assert.match(pack.fingerprint, /^[a-f0-9]{16}$/);
});

test("public retrieval cannot select admin or trusted chunks", () => {
  const selected = rankContext(pack, {
    query: "radio project music",
    audience: "public"
  });
  assert.deepEqual(selected.map((chunk) => chunk.id), ["style"]);
});

test("trusted retrieval is limited to the configured contact", () => {
  const dad = rankContext(pack, {
    query: "music",
    audience: "trusted",
    contactKey: "dad"
  });
  const anotherContact = rankContext(pack, {
    query: "music",
    audience: "trusted",
    contactKey: "mum"
  });
  assert.deepEqual(dad.map((chunk) => chunk.id), ["trusted-dad", "style"]);
  assert.deepEqual(anotherContact.map((chunk) => chunk.id), ["style"]);
});

test("admin retrieval can use deeper evidence", () => {
  const selected = rankContext(pack, {
    query: "radio project",
    audience: "admin"
  });
  assert.ok(selected.some((chunk) => chunk.id === "private"));
  assert.match(formatContext(selected), /Private project context/);
});

test("retrieval handles simple plurals without substring false positives", () => {
  const plural = rankContext(pack, {
    query: "Which piercings did I mention?",
    audience: "admin"
  });
  const substring = rankContext(pack, {
    query: "What do I think?",
    audience: "admin"
  });
  assert.ok(plural.some((chunk) => chunk.id === "private"));
  assert.ok(!substring.some((chunk) => chunk.id === "private"));
});

test("invalid packs are rejected", () => {
  assert.throws(() => validateContextPack({ chunks: [] }), /contains no chunks/);
  assert.throws(() => validateContextPack({
    chunks: [
      { id: "same", text: "one" },
      { id: "same", text: "two" }
    ]
  }), /duplicated/);
});

test("admin retrieval prioritises matching personal evidence over always-on guidance", () => {
  const personalPack = validateContextPack({
    chunks: [
      {
        id: "always-profile",
        title: "General profile",
        type: "profile",
        audience: "public",
        always: true,
        text: "General Jamie profile."
      },
      {
        id: "always-style",
        title: "General style",
        type: "style",
        audience: "public",
        always: true,
        text: "General Jamie style."
      },
      {
        id: "dylan-history",
        title: "Private relationship history: Dylan Carr",
        type: "relationship-history",
        audience: "admin",
        contactKey: "dylan-carr",
        tags: ["dylan", "carr", "friend", "relationship"],
        text: "Dylan Carr is a friend with shared social history."
      }
    ]
  });
  const selected = rankContext(personalPack, {
    query: "Who is Dylan Carr and what is our friendship history?",
    audience: "admin"
  });
  assert.equal(selected[0].id, "dylan-history");
});

test("supportive reply queries select the matching scenario style", () => {
  const stylePack = validateContextPack({
    chunks: [
      {
        id: "friends",
        title: "Friends and casual social chat",
        type: "style-mode",
        audience: "admin",
        tags: ["friends", "casual", "reply"],
        text: "Short casual friend replies."
      },
      {
        id: "supportive",
        title: "Supportive, concerned and reassuring replies",
        type: "style-mode",
        audience: "admin",
        tags: ["supportive", "upset", "sad", "comfort", "close friend", "reply"],
        text: "Supportive replies when a friend is upset."
      }
    ]
  });
  const selected = rankContext(stylePack, {
    query: "How would I reply to a close friend who is upset?",
    audience: "admin"
  });
  assert.equal(selected[0].id, "supportive");
});
