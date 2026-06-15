const test = require("node:test");
const assert = require("node:assert/strict");
process.env.SESSION_SECRET = "test-session-secret-that-is-longer-than-thirty-two-characters";

const {
  apiRoute,
  cleanMessages,
  cleanText,
  contactKeyForProfile,
  createSession,
  extractMemoryFacts,
  generateText,
  hashPassword,
  memoryRecallReply,
  normaliseUsername,
  providerStatus,
  readMemoryCookie,
  readSession,
  responseOutputText,
  validUsername,
  verifyPassword
} = require("../netlify/functions/_lib");

test("known private contacts map to relationship-specific context", () => {
  assert.equal(contactKeyForProfile({ name: "James Parr" }), "james");
  assert.equal(contactKeyForProfile({ name: "Johnny Carr" }), "johnny");
  assert.equal(contactKeyForProfile({ relationship: "Dad" }), "dad");
  assert.equal(contactKeyForProfile({ name: "Someone else" }), "");
});

test("API routes resolve from query parameters and Netlify rewrite paths", () => {
  assert.equal(apiRoute({ queryStringParameters: { route: "setup-status" } }), "setup-status");
  assert.equal(apiRoute({
    headers: { "x-nf-original-path": "/api/public-chat" },
    queryStringParameters: {}
  }), "public-chat");
  assert.equal(apiRoute({
    rawUrl: "https://preview.example/api/admin-context-status",
    queryStringParameters: {}
  }), "admin-context-status");
  assert.equal(apiRoute({ path: "/api/login", queryStringParameters: null }), "login");
});

test("password hashes verify the intended password only", () => {
  const hash = hashPassword("a suitably long password");
  assert.equal(verifyPassword("a suitably long password", hash), true);
  assert.equal(verifyPassword("the wrong password", hash), false);
});

test("signed sessions round-trip and reject tampering", async () => {
  const token = await createSession("jamie", "admin", "admin");
  const event = { headers: { cookie: `talk_with_jamie_session=${encodeURIComponent(token)}` } };
  assert.equal((await readSession(event)).username, "jamie");
  event.headers.cookie += "x";
  assert.equal(await readSession(event), null);
});

test("memory cookies reject unrelated or unsigned values", async () => {
  assert.deepEqual(await readMemoryCookie({ headers: { cookie: "" } }, "guest_test"), []);
  assert.deepEqual(await readMemoryCookie({
    headers: { cookie: "talk_with_jamie_memory=not-signed" }
  }, "guest_test"), []);
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

test("explicit non-sensitive visitor facts can be remembered", () => {
  assert.deepEqual(extractMemoryFacts("Remember that my favourite game is Minecraft."), [
    "my favourite game is Minecraft"
  ]);
  assert.deepEqual(extractMemoryFacts("My password is definitely-not-real."), []);
});

test("explicit visitor-memory questions are answered from saved facts", () => {
  assert.equal(
    memoryRecallReply("What game did I say was my favourite?", ["my favourite game is Halo"]),
    "you said your favourite game is Halo."
  );
  assert.equal(memoryRecallReply("What projects have you built?", ["my favourite game is Halo"]), "");
});

test("OpenAI Responses output is parsed from raw API responses", () => {
  assert.equal(responseOutputText({ output_text: " direct " }), "direct");
  assert.equal(responseOutputText({
    output: [{ content: [{ type: "output_text", text: " nested " }] }]
  }), "nested");
});

test("OpenAI Responses provider uses private stateless requests", async () => {
  const originalFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-5.4-mini";
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: "Yeah that makes sense" }] }]
      })
    };
  };

  try {
    assert.deepEqual(providerStatus(), {
      configured: true,
      provider: "OpenAI Responses API",
      model: "gpt-5.4-mini"
    });
    const reply = await generateText([{ role: "user", content: "hello" }], "Reply naturally.");
    assert.equal(reply, "Yeah that makes sense");
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.body.store, false);
    assert.deepEqual(request.body.reasoning, { effort: "low" });
    assert.equal(request.body.instructions, "Reply naturally.");
    assert.deepEqual(request.body.input, [{ role: "user", content: "hello" }]);
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  }
});
