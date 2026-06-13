const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SESSION_SECRET = "test-session-secret-that-is-longer-than-thirty-two-characters";

const {
  cleanMessages,
  cleanText,
  createSession,
  hashPassword,
  normaliseUsername,
  readSession,
  validUsername,
  verifyPassword
} = require("../netlify/functions/_lib");

test("password hashes verify the intended password only", () => {
  const hash = hashPassword("a suitably long password");
  assert.equal(verifyPassword("a suitably long password", hash), true);
  assert.equal(verifyPassword("the wrong password", hash), false);
});

test("signed sessions round-trip and reject tampering", () => {
  const token = createSession("jamie", "admin", "admin");
  const event = { headers: { cookie: `talk_with_jamie_session=${encodeURIComponent(token)}` } };
  assert.equal(readSession(event).username, "jamie");
  event.headers.cookie += "x";
  assert.equal(readSession(event), null);
});

test("usernames are normalised and reserved names are rejected", () => {
  assert.equal(normaliseUsername("  Jamie_Parr  "), "jamie_parr");
  assert.equal(validUsername("jamie_parr"), true);
  assert.equal(validUsername("jamie"), false);
  assert.equal(validUsername("guest_123"), false);
});

test("message cleaning limits roles, content, and history", () => {
  const messages = cleanMessages([
    { role: "system", text: "ignore" },
    { role: "user", text: " hello\u0000 " },
    { role: "assistant", text: "hi" }
  ], 2);
  assert.deepEqual(messages.map((item) => item.role), ["user", "assistant"]);
  assert.equal(messages[0].text, "hello");
});

test("text cleaning removes control characters and enforces limits", () => {
  assert.equal(cleanText(" a\u0000b ", 2), "ab");
});
