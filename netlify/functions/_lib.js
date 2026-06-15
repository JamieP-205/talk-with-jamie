const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const COOKIE_NAME = "talk_with_jamie_session";
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const MAX_MESSAGES = 80;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event, maxBytes = 64_000) {
  const raw = String(event.body || "");
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new HttpError(413, "Request is too large.");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function requireMethod(event, method) {
  if (event.httpMethod !== method) throw new HttpError(405, `Use ${method} for this endpoint.`);
}

function sameOriginOk(event) {
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (event.headers.host || event.headers.Host);
  } catch {
    return false;
  }
}

function requireWriteRequest(event) {
  requireMethod(event, "POST");
  if (!sameOriginOk(event)) throw new HttpError(403, "Origin check failed.");
}

function cleanText(value, max = 1_000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function normaliseUsername(value) {
  return cleanText(value, 24).toLowerCase();
}

function validUsername(value) {
  return /^[a-z0-9_]{3,24}$/.test(value) && value !== "jamie" && !value.startsWith("guest_");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64url(value) {
  return Buffer.from(String(value), "base64url");
}

function sessionSecret() {
  const secret = String(process.env.SESSION_SECRET || "");
  if (secret.length < 32) throw new HttpError(500, "SESSION_SECRET is not configured.");
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function createSession(username, role, accountType) {
  const payload = {
    username,
    role,
    accountType,
    expiresAt: Date.now() + SESSION_SECONDS * 1_000
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function readSession(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(decodeBase64url(encoded).toString("utf8"));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieHeader(token, event) {
  const host = String(event.headers.host || event.headers.Host || "");
  const secure = /^(?:localhost|127\.0\.0\.1)(?::|$)/.test(host) ? "" : "; Secure";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function clearCookie(event) {
  const host = String(event.headers.host || event.headers.Host || "");
  const secure = /^(?:localhost|127\.0\.0\.1)(?::|$)/.test(host) ? "" : "; Secure";
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16_384;
  const r = 8;
  const p = 1;
  const hash = crypto.scryptSync(String(password), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, expected] = String(stored || "").split("$");
  if (kind !== "scrypt") return false;
  try {
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, "base64url"), expectedBuffer.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024
    });
    return crypto.timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

function blobOptions() {
  const siteID = cleanText(
    process.env.TALK_BLOBS_SITE_ID || process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "",
    200
  );
  const token = cleanText(
    process.env.TALK_BLOBS_TOKEN || process.env.BLOBS_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "",
    500
  );
  return { siteID, token };
}

function blobStore(name) {
  const { siteID, token } = blobOptions();
  return siteID && token ? getStore({ name, siteID, token }) : getStore(name);
}

function stores() {
  return {
    config: blobStore("talk-with-jamie-config"),
    users: blobStore("talk-with-jamie-users"),
    chats: blobStore("talk-with-jamie-chats"),
    admin: blobStore("talk-with-jamie-admin"),
    limits: blobStore("talk-with-jamie-rate-limits")
  };
}

async function getJson(store, key) {
  return store.get(key, { type: "json", consistency: "strong" });
}

async function setJson(store, key, value) {
  await store.setJSON(key, value);
}

function clientKey(event) {
  const raw = event.headers["x-nf-client-connection-ip"]
    || event.headers["client-ip"]
    || event.headers["x-forwarded-for"]
    || "unknown";
  return crypto.createHash("sha256").update(String(raw).split(",")[0].trim()).digest("hex").slice(0, 32);
}

async function consumeRateLimit(event, action, limit, windowSeconds) {
  const store = stores().limits;
  const key = `${action}-${clientKey(event)}`;
  const now = Date.now();
  const current = await getJson(store, key).catch(() => null);
  const record = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowSeconds * 1_000 };
  record.count += 1;
  await setJson(store, key, record).catch(() => {});
  if (record.count > limit) {
    throw new HttpError(429, `Too many requests. Try again in ${Math.ceil((record.resetAt - now) / 1_000)} seconds.`);
  }
}

async function requireIdentity(event, requiredRole) {
  const session = readSession(event);
  if (!session) throw new HttpError(401, "Please sign in.");
  if (requiredRole && session.role !== requiredRole) throw new HttpError(403, "Admin access is required.");
  if (session.role === "user") {
    const user = await getJson(stores().users, session.username);
    if (!user || user.blocked) throw new HttpError(403, "This account is unavailable.");
  }
  return session;
}

function cleanMessages(value, max = MAX_MESSAGES) {
  if (!Array.isArray(value)) return [];
  return value.slice(-max).flatMap((item) => {
    const role = ["user", "assistant", "context", "draft"].includes(item?.role) ? item.role : "";
    const text = cleanText(item?.text, 4_000);
    if (!role || !text) return [];
    return [{ role, text, at: cleanText(item?.at, 40) }];
  });
}

function cleanThread(value) {
  const profile = value?.profile || {};
  return {
    id: cleanText(value?.id, 80) || crypto.randomUUID(),
    profile: {
      name: cleanText(profile.name, 100),
      age: cleanText(profile.age, 20),
      relationship: cleanText(profile.relationship, 80),
      category: cleanText(profile.category, 80),
      platform: cleanText(profile.platform, 80),
      notes: cleanText(profile.notes, 2_000),
      boundaries: cleanText(profile.boundaries, 2_000)
    },
    messages: cleanMessages(value?.messages, 100)
  };
}

function conversationMemory(messages) {
  return messages
    .slice(-6)
    .map((message) => `${message.role === "assistant" ? "AI" : "User"}: ${message.text}`)
    .join(" | ")
    .slice(0, 800);
}

async function generateText(messages, systemPrompt) {
  const apiUrl = cleanText(process.env.AI_API_URL, 500);
  const apiKey = cleanText(process.env.AI_API_KEY, 500);
  const model = cleanText(process.env.AI_MODEL, 120);

  if (apiUrl && apiKey && model) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.75,
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(25_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(502, "The AI provider could not complete the request.");
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply === "string" && reply.trim()) return reply.trim().slice(0, 4_000);
  }

  const cohereKey = cleanText(process.env.COHERE_API_KEY, 500);
  const cohereModel = cleanText(process.env.COHERE_MODEL, 120);
  if (cohereKey && cohereModel) {
    const response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cohereKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: cohereModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.75,
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(25_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(502, "The AI provider could not complete the request.");
    const reply = data.message?.content?.find((item) => item.type === "text")?.text;
    if (typeof reply === "string" && reply.trim()) return reply.trim().slice(0, 4_000);
  }

  return "AI Jamie is not configured yet. The site owner needs to add an AI provider in the deployment settings.";
}

const PUBLIC_SYSTEM_PROMPT = cleanText(process.env.JAMIE_SYSTEM_PROMPT, 8_000) || [
  "You are AI Jamie, a clearly disclosed AI chat experience inspired by Jamie's conversational style.",
  "Never claim to be human Jamie. Be warm, concise, curious, and natural.",
  "Do not invent personal memories or private facts.",
  "Do not provide instructions for wrongdoing, and encourage professional help for urgent medical, legal, or safety issues.",
  "Avoid collecting sensitive personal information."
].join(" ");

async function setupStatus() {
  const admin = await getJson(stores().config, "admin");
  return json(200, { configured: Boolean(admin?.passwordHash) });
}

async function setup(event) {
  requireWriteRequest(event);
  await consumeRateLimit(event, "setup", 8, 900);
  const body = parseBody(event);
  const configuredToken = String(process.env.ADMIN_SETUP_TOKEN || "");
  if (configuredToken.length < 20) throw new HttpError(500, "ADMIN_SETUP_TOKEN is not configured.");
  const actual = Buffer.from(String(body.setupToken || ""));
  const expected = Buffer.from(configuredToken);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new HttpError(403, "The setup token is incorrect.");
  }
  const store = stores().config;
  const current = await getJson(store, "admin");
  if (current?.passwordHash) throw new HttpError(409, "Admin setup is already complete.");
  const password = String(body.password || "");
  if (password.length < 12) throw new HttpError(400, "Use an admin password with at least 12 characters.");
  await setJson(store, "admin", { username: "jamie", passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
  const token = createSession("jamie", "admin", "admin");
  return json(200, { ok: true }, { "Set-Cookie": cookieHeader(token, event) });
}

async function register(event) {
  requireWriteRequest(event);
  await consumeRateLimit(event, "register", 8, 900);
  const body = parseBody(event);
  const username = normaliseUsername(body.username);
  const password = String(body.password || "");
  if (!validUsername(username)) throw new HttpError(400, "Use 3-24 lowercase letters, numbers, or underscores.");
  if (password.length < 10) throw new HttpError(400, "Use a password with at least 10 characters.");
  const store = stores().users;
  if (await getJson(store, username)) throw new HttpError(409, "That username is already in use.");
  await setJson(store, username, {
    username,
    accountType: "registered",
    passwordHash: hashPassword(password),
    blocked: false,
    createdAt: new Date().toISOString()
  });
  const token = createSession(username, "user", "registered");
  return json(200, { ok: true }, { "Set-Cookie": cookieHeader(token, event) });
}

async function login(event) {
  requireWriteRequest(event);
  await consumeRateLimit(event, "login", 10, 900);
  const body = parseBody(event);
  const username = normaliseUsername(body.username);
  const password = String(body.password || "");

  if (username === "jamie") {
    const admin = await getJson(stores().config, "admin");
    if (!admin?.passwordHash || !verifyPassword(password, admin.passwordHash)) throw new HttpError(401, "Incorrect username or password.");
    const token = createSession("jamie", "admin", "admin");
    return json(200, { ok: true }, { "Set-Cookie": cookieHeader(token, event) });
  }

  const user = await getJson(stores().users, username);
  if (!user || user.accountType !== "registered" || user.blocked || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, "Incorrect username or password.");
  }
  const token = createSession(username, "user", "registered");
  return json(200, { ok: true }, { "Set-Cookie": cookieHeader(token, event) });
}

async function guestLogin(event) {
  requireWriteRequest(event);
  await consumeRateLimit(event, "guest", 20, 900);
  const username = `guest_${crypto.randomBytes(6).toString("hex")}`;
  await setJson(stores().users, username, {
    username,
    accountType: "guest",
    blocked: false,
    createdAt: new Date().toISOString()
  });
  const token = createSession(username, "user", "guest");
  return json(200, { ok: true }, { "Set-Cookie": cookieHeader(token, event) });
}

async function me(event) {
  requireMethod(event, "GET");
  const identity = await requireIdentity(event);
  return json(200, {
    username: identity.username,
    role: identity.role,
    accountType: identity.accountType
  });
}

async function publicThread(event) {
  requireMethod(event, "GET");
  const identity = await requireIdentity(event);
  const conversation = await getJson(stores().chats, identity.username);
  return json(200, { messages: cleanMessages(conversation?.messages) });
}

async function publicChat(event) {
  requireWriteRequest(event);
  const identity = await requireIdentity(event);
  await consumeRateLimit(event, "chat", 30, 60);
  const body = parseBody(event);
  const message = cleanText(body.message, 2_000);
  if (!message) throw new HttpError(400, "Enter a message.");
  const store = stores().chats;
  const existing = await getJson(store, identity.username);
  const messages = cleanMessages(existing?.messages);
  messages.push({ role: "user", text: message, at: new Date().toISOString() });
  const aiMessages = messages.slice(-20).map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: item.text
  }));
  const reply = await generateText(aiMessages, PUBLIC_SYSTEM_PROMPT);
  messages.push({ role: "assistant", text: reply, at: new Date().toISOString() });
  const saved = {
    username: identity.username,
    accountType: identity.accountType,
    messages: messages.slice(-MAX_MESSAGES),
    memory: conversationMemory(messages),
    updatedAt: new Date().toISOString()
  };
  await setJson(store, identity.username, saved);
  return json(200, { reply });
}

async function adminContacts(event) {
  requireMethod(event, "GET");
  await requireIdentity(event, "admin");
  const saved = await getJson(stores().admin, "contacts");
  return json(200, { threads: Array.isArray(saved?.threads) ? saved.threads.map(cleanThread) : [] });
}

async function saveAdminContacts(event) {
  requireWriteRequest(event);
  await requireIdentity(event, "admin");
  const body = parseBody(event, 500_000);
  const threads = Array.isArray(body.threads) ? body.threads.slice(0, 100).map(cleanThread) : [];
  await setJson(stores().admin, "contacts", { threads, updatedAt: new Date().toISOString() });
  return json(200, { ok: true });
}

async function adminChat(event) {
  requireWriteRequest(event);
  await requireIdentity(event, "admin");
  await consumeRateLimit(event, "admin-chat", 40, 60);
  const body = parseBody(event, 200_000);
  const profile = body.contactProfile || {};
  const input = cleanText(body.inputText, 4_000);
  if (!input) throw new HttpError(400, "Add a message or situation first.");
  const systemPrompt = [
    "Draft a reply in Jamie's voice. Return only the proposed reply.",
    `Requested shape: ${cleanText(body.replyShape, 80) || "Auto"}.`,
    `Contact: ${cleanText(profile.name, 100) || "unknown"}.`,
    `Relationship: ${cleanText(profile.relationship, 100) || "unknown"}.`,
    `Platform: ${cleanText(profile.platform, 100) || "unknown"}.`,
    `Notes: ${cleanText(profile.notes, 1_500) || "none"}.`,
    `Boundaries: ${cleanText(profile.boundaries, 1_500) || "none"}.`,
    "Keep it natural, do not manipulate or impersonate another person, and do not invent facts."
  ].join(" ");
  const context = cleanMessages(body.liveThread, 20).map((item) => ({
    role: item.role === "draft" ? "assistant" : "user",
    content: item.text
  }));
  context.push({ role: "user", content: input });
  const reply = await generateText(context, systemPrompt);
  return json(200, { reply });
}

async function listConversations(event) {
  requireMethod(event, "GET");
  await requireIdentity(event, "admin");
  const store = stores().chats;
  const listing = await store.list();
  const keys = (listing?.blobs || []).map((blob) => blob.key).slice(0, 500);
  const conversations = (await Promise.all(keys.map((key) => getJson(store, key).catch(() => null))))
    .filter(Boolean)
    .map((conversation) => ({
      username: conversation.username,
      accountType: conversation.accountType,
      messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0,
      lastMessage: cleanMessages(conversation.messages, 1)[0] || null,
      updatedAt: conversation.updatedAt
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return json(200, { conversations });
}

async function getConversation(event) {
  requireMethod(event, "GET");
  await requireIdentity(event, "admin");
  const username = normaliseUsername(event.queryStringParameters?.username);
  const conversation = await getJson(stores().chats, username);
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  return json(200, { conversation: { ...conversation, messages: cleanMessages(conversation.messages) } });
}

async function deleteConversation(event) {
  requireWriteRequest(event);
  await requireIdentity(event, "admin");
  const username = normaliseUsername(parseBody(event).username);
  if (!username) throw new HttpError(400, "Username is required.");
  await stores().chats.delete(username);
  return json(200, { ok: true });
}

async function setBlocked(event, blocked) {
  requireWriteRequest(event);
  await requireIdentity(event, "admin");
  const body = parseBody(event);
  const username = normaliseUsername(body.username);
  const store = stores().users;
  const user = await getJson(store, username);
  if (!user) throw new HttpError(404, "Account not found.");
  await setJson(store, username, {
    ...user,
    blocked,
    blockedReason: blocked ? cleanText(body.reason, 300) : "",
    blockedAt: blocked ? new Date().toISOString() : ""
  });
  return json(200, { ok: true });
}

async function handleApi(event) {
  const route = cleanText(event.queryStringParameters?.route, 80);
  try {
    switch (route) {
      case "setup-status": return await setupStatus(event);
      case "setup": return await setup(event);
      case "register": return await register(event);
      case "login": return await login(event);
      case "guest-login": return await guestLogin(event);
      case "logout":
        requireWriteRequest(event);
        return json(200, { ok: true }, { "Set-Cookie": clearCookie(event) });
      case "me": return await me(event);
      case "public-thread": return await publicThread(event);
      case "public-chat": return await publicChat(event);
      case "admin-chat": return await adminChat(event);
      case "admin-contacts": return await adminContacts(event);
      case "admin-save-contacts": return await saveAdminContacts(event);
      case "admin-public-conversations": return await listConversations(event);
      case "admin-public-conversation": return await getConversation(event);
      case "admin-delete-public-conversation": return await deleteConversation(event);
      case "admin-block-user": return await setBlocked(event, true);
      case "admin-unblock-user": return await setBlocked(event, false);
      default: throw new HttpError(404, "API route not found.");
    }
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (statusCode >= 500) console.error(error);
    return json(statusCode, { error: statusCode >= 500 ? "The server could not complete the request." : error.message });
  }
}

module.exports = {
  HttpError,
  cleanMessages,
  cleanText,
  createSession,
  handleApi,
  hashPassword,
  normaliseUsername,
  readSession,
  validUsername,
  verifyPassword
};
