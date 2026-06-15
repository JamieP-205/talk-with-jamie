"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { BlobsServer } = require("@netlify/blobs/server");
const { connectLambda, getStore } = require("@netlify/blobs");

delete process.env.SESSION_SECRET;
process.env.ADMIN_SETUP_TOKEN = "integration-setup-token-with-enough-length";
process.env.ALLOW_CONTEXT_ADMIN_MUTATION = "1";
delete process.env.AI_API_URL;
delete process.env.AI_API_KEY;
delete process.env.AI_MODEL;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
delete process.env.COHERE_API_KEY;
delete process.env.COHERE_MODEL;
delete process.env.TALK_BLOBS_SITE_ID;
delete process.env.TALK_BLOBS_TOKEN;

const { handleApi } = require("../netlify/functions/_lib");

test("legacy deployment supports admin, guest, registered user, context, and chat flows", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talk-with-jamie-blobs-"));
  const token = "integration-blobs-token";
  const siteID = `test-site-${Date.now()}`;
  const deployID = `test-deploy-${Date.now()}`;
  const server = new BlobsServer({ directory, token });
  const { address } = await server.start();

  t.after(async () => {
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const lambdaContext = Buffer.from(JSON.stringify({ url: address, token })).toString("base64");
  const baseHeaders = {
    host: "localhost",
    origin: "http://localhost",
    "x-nf-client-connection-ip": "127.0.0.1",
    "x-nf-site-id": siteID,
    "x-nf-deploy-id": deployID
  };

  function event(route, { method = "GET", body, cookie, query = {} } = {}) {
    return {
      blobs: lambdaContext,
      body: body === undefined ? null : JSON.stringify(body),
      headers: {
        ...baseHeaders,
        ...(cookie ? { cookie } : {})
      },
      httpMethod: method,
      queryStringParameters: { route, ...query }
    };
  }

  async function request(route, options) {
    const response = await handleApi(event(route, options));
    let data;
    try {
      data = JSON.parse(response.body);
    } catch {
      data = {};
    }
    return { ...response, data };
  }

  function sessionCookie(response) {
    const header = response.headers["Set-Cookie"];
    assert.ok(header, "response should set a session cookie");
    return header.split(";")[0];
  }

  connectLambda(event("seed"));
  await getStore("app-config").setJSON("config.json", {
    configured: true,
    adminPasswordHash: bcrypt.hashSync("admin-password-for-tests", 10),
    sessionSecret: "legacy-session-secret-that-is-more-than-thirty-two-characters",
    createdAt: "2026-01-01T00:00:00.000Z"
  });

  const setupStatus = await request("setup-status");
  assert.equal(setupStatus.statusCode, 200, setupStatus.body);
  assert.deepEqual(setupStatus.data, { configured: true, legacyAccount: true });

  const adminLogin = await request("login", {
    method: "POST",
    body: { username: "jamie", password: "admin-password-for-tests" }
  });
  assert.equal(adminLogin.statusCode, 200, adminLogin.body);
  const adminCookie = sessionCookie(adminLogin);

  const adminMe = await request("me", { cookie: adminCookie });
  assert.equal(adminMe.statusCode, 200, adminMe.body);
  assert.deepEqual(adminMe.data, {
    username: "jamie",
    role: "admin",
    accountType: "admin"
  });

  const contextImport = await request("admin-context-import", {
    method: "POST",
    cookie: adminCookie,
    body: {
      pack: {
        name: "Integration context",
        chunks: [
          {
            id: "public-style",
            title: "Public style",
            audience: "public",
            always: true,
            tags: ["style"],
            text: "Keep normal replies short, direct, and conversational."
          },
          {
            id: "admin-project",
            title: "Private project knowledge",
            audience: "admin",
            tags: ["project"],
            text: "Jamie built Talk With Jamie as a personal context retrieval project."
          }
        ]
      }
    }
  });
  assert.equal(contextImport.statusCode, 200, contextImport.body);
  assert.equal(contextImport.data.chunkCount, 2);

  const contextStatus = await request("admin-context-status", { cookie: adminCookie });
  assert.equal(contextStatus.statusCode, 200, contextStatus.body);
  assert.equal(contextStatus.data.configured, true);
  assert.equal(contextStatus.data.chunkCount, 2);

  const anonymousContextStatus = await request("admin-context-status");
  assert.equal(anonymousContextStatus.statusCode, 401, anonymousContextStatus.body);

  const guestLogin = await request("guest-login", { method: "POST", body: {} });
  assert.equal(guestLogin.statusCode, 200, guestLogin.body);
  const guestCookie = sessionCookie(guestLogin);

  const guestMe = await request("me", { cookie: guestCookie });
  assert.equal(guestMe.statusCode, 200, guestMe.body);
  assert.equal(guestMe.data.role, "user");
  assert.equal(guestMe.data.accountType, "guest");
  assert.match(guestMe.data.username, /^guest_[a-f0-9]{12}$/);

  const remember = await request("public-chat", {
    method: "POST",
    cookie: guestCookie,
    body: { message: "Remember that my favourite game is Halo." }
  });
  assert.equal(remember.statusCode, 200, remember.body);
  const memoryCookie = sessionCookie(remember);

  const recall = await request("public-chat", {
    method: "POST",
    cookie: `${guestCookie}; ${memoryCookie}`,
    body: { message: "What game did I say was my favourite?" }
  });
  assert.equal(recall.statusCode, 200, recall.body);
  assert.equal(recall.data.reply, "you said your favourite game is Halo.");

  const guestContextStatus = await request("admin-context-status", { cookie: guestCookie });
  assert.equal(guestContextStatus.statusCode, 403, guestContextStatus.body);

  connectLambda(event("simulate-edge-delay"));
  await getStore("talk-with-jamie-users").delete(guestMe.data.username);
  const guestDuringPropagation = await request("me", { cookie: guestCookie });
  assert.equal(guestDuringPropagation.statusCode, 200, guestDuringPropagation.body);

  const register = await request("register", {
    method: "POST",
    body: { username: "test_user", password: "registered-password" }
  });
  assert.equal(register.statusCode, 200, register.body);
  const registeredCookie = sessionCookie(register);

  const immediateLogin = await request("login", {
    method: "POST",
    cookie: registeredCookie,
    body: { username: "test_user", password: "registered-password" }
  });
  assert.equal(immediateLogin.statusCode, 200, immediateLogin.body);

  const registeredMe = await request("me", { cookie: registeredCookie });
  assert.equal(registeredMe.statusCode, 200, registeredMe.body);
  assert.deepEqual(registeredMe.data, {
    username: "test_user",
    role: "user",
    accountType: "registered"
  });

  const login = await request("login", {
    method: "POST",
    body: { username: "test_user", password: "registered-password" }
  });
  assert.equal(login.statusCode, 200, login.body);

  const chat = await request("public-chat", {
    method: "POST",
    cookie: sessionCookie(login),
    body: { message: "What kind of project is this?" }
  });
  assert.equal(chat.statusCode, 200, chat.body);
  assert.match(chat.data.reply, /AI Jamie is not configured yet/);

  const thread = await request("public-thread", { cookie: registeredCookie });
  assert.equal(thread.statusCode, 200, thread.body);
  assert.equal(thread.data.messages.length, 2);
  assert.equal(thread.data.messages[0].text, "What kind of project is this?");
  assert.equal(thread.data.threads.length, 1);

  const createdThread = await request("public-new-thread", {
    method: "POST",
    cookie: registeredCookie,
    body: {}
  });
  assert.equal(createdThread.statusCode, 200, createdThread.body);
  assert.equal(createdThread.data.messages.length, 0);
  assert.equal(createdThread.data.threads.length, 2);

  const secondChat = await request("public-chat", {
    method: "POST",
    cookie: registeredCookie,
    body: { chatId: createdThread.data.activeChatId, message: "This is a separate chat" }
  });
  assert.equal(secondChat.statusCode, 200, secondChat.body);

  const originalThread = await request("public-thread", {
    cookie: registeredCookie,
    query: { chatId: thread.data.activeChatId }
  });
  assert.equal(originalThread.statusCode, 200, originalThread.body);
  assert.equal(originalThread.data.messages[0].text, "What kind of project is this?");

  const deletedThread = await request("public-delete-thread", {
    method: "POST",
    cookie: registeredCookie,
    body: { chatId: createdThread.data.activeChatId }
  });
  assert.equal(deletedThread.statusCode, 200, deletedThread.body);
  assert.equal(deletedThread.data.threads.length, 1);

  const adminConversations = await request("admin-public-conversations", {
    cookie: adminCookie
  });
  assert.equal(adminConversations.statusCode, 200, adminConversations.body);
  const listedUser = adminConversations.data.conversations.find(
    (conversation) => conversation.username === "test_user"
  );
  assert.ok(listedUser);
  assert.equal(listedUser.chatCount, 1);

  const viewedConversation = await request("admin-public-conversation", {
    cookie: adminCookie,
    query: { username: "test_user" }
  });
  assert.equal(viewedConversation.statusCode, 200, viewedConversation.body);
  assert.equal(viewedConversation.data.conversation.username, "test_user");
});
