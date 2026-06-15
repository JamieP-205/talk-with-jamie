"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  facebookChunks,
  fencedSections,
  groupedMessageChunks,
  likelyCopiedSocialText,
  messageTimestamp,
  relationshipChunks,
  snapchatChunks,
  styleModeChunks
} = require("../tools/build-private-context");

test("source sections accept Instagram-style and Facebook-style headings", () => {
  const input = [
    "### Facebook raw text: `messages/inbox/example/message_1.html`",
    "",
    "```text",
    "Jamie Parr",
    "Yes it is",
    "Jul 22, 2025 [REDACTED_IPv6] am",
    "```",
    "",
    "#### html/chat_history/subpage_example.html",
    "",
    "```text",
    "jamie_parr05",
    "",
    "TEXT",
    "",
    "hello",
    "",
    "2025-01-01 12:00:00 UTC",
    "```"
  ].join("\n");

  assert.equal(fencedSections(input).length, 2);
  assert.equal(messageTimestamp("Jul 22, 2025 [REDACTED_IPv6] am"), true);
});

test("Snapchat parser handles blank lines between sender, type and text", () => {
  const master = [
    "### 8.7 Snapchat raw extracted text files",
    "#### html/chat_history/subpage_example.html",
    "",
    "```text",
    "Saved",
    "",
    "jamie_parr05",
    "",
    "TEXT",
    "",
    "that was class",
    "",
    "2025-01-01 12:00:00 UTC",
    "```",
    "## 9. Unknowns / approval queue"
  ].join("\n");

  const chunks = snapchatChunks(master);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /that was class/);
  assert.match(chunks[0].text, /date: 2025-01-01 12:00:00 UTC/);
  assert.equal(chunks[0].audience, "admin");
});

test("Facebook parser keeps only Jamie-authored Messenger text", () => {
  const master = [
    "## Sanitised raw Facebook text",
    "### Facebook raw text: `your_facebook_activity/messages/inbox/example/message_1.html`",
    "",
    "```text",
    "Jamie Parr",
    "Yes it is",
    "Jul 22, 2025 [REDACTED_IPv6] am",
    "Someone Else",
    "Is this still available?",
    "Jun 14, 2025 [REDACTED_IPv6] pm",
    "```",
    "# v3 synthesis update"
  ].join("\n");

  const chunks = facebookChunks(master);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /Yes it is/);
  assert.match(chunks[0].text, /conversation: Jamie Parr/);
  assert.doesNotMatch(chunks[0].text, /Is this still available/);
  assert.equal(chunks[0].audience, "admin");
});

test("message groups stay below the context chunk text limit", () => {
  const chunks = groupedMessageChunks(
    Array.from({ length: 40 }, (_, index) => `${index} ${"message ".repeat(60)}`),
    { idPrefix: "test", title: "Test", platform: "test", groupSize: 20, limit: 20 }
  );

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 2_400));
});

test("copied formal social text is excluded from personal evidence", () => {
  assert.equal(likelyCopiedSocialText({
    platform: "instagram",
    text: [
      "According to the following analysis, the methodology demonstrates several outcomes.",
      "1. The first result",
      "2. The second result",
      "References: example"
    ].join("\n")
  }), true);
  assert.equal(likelyCopiedSocialText({
    platform: "instagram",
    text: "i was at work earlier but im free after uni if you still wanna meet"
  }), false);
});

test("relationship chunks merge known aliases into one person history", () => {
  const chunks = relationshipChunks([
    { person: "dylancarr02", platform: "instagram", timestamp: "2024-01-01", text: "remember when we went into town after work" },
    { person: "Dylan Carr", platform: "snapchat", timestamp: "2024-02-01", text: "i should be free after uni tomorrow" },
    { person: "Dylan Carr", platform: "instagram", timestamp: "2024-03-01", text: "that concert was class we need to go again" }
  ]);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every((chunk) => chunk.title.includes("Dylan Carr")));
  assert.equal(chunks[0].type, "relationship-dossier");
});

test("style modes keep casual, supportive and romantic scenarios separate", () => {
  const chunks = styleModeChunks([
    { person: "friend", platform: "instagram", text: "that game was class lol" },
    { person: "friend", platform: "instagram", text: "are you okay im here for you if you need me" },
    { person: "partner", platform: "snapchat", text: "i love you baby miss you xx" },
    { person: "friend", platform: "facebook", text: "im heading into town later you going" }
  ]);
  const casual = chunks.find((chunk) => chunk.id.startsWith("style-mode-friends-casual"));
  const supportive = chunks.find((chunk) => chunk.id.startsWith("style-mode-supportive"));
  const romantic = chunks.find((chunk) => chunk.id.startsWith("style-mode-romantic-affectionate"));
  assert.ok(casual);
  assert.ok(supportive);
  assert.ok(romantic);
  assert.doesNotMatch(casual.text, /love you|baby|here for you/i);
  assert.match(supportive.text, /here for you/i);
  assert.match(romantic.text, /love you baby/i);
});
