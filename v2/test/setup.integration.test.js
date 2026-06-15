"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlobsServer } = require("@netlify/blobs/server");

delete process.env.SESSION_SECRET;
process.env.ADMIN_SETUP_TOKEN = "fresh-setup-token-with-enough-length";
delete process.env.TALK_BLOBS_SITE_ID;
delete process.env.TALK_BLOBS_TOKEN;

const { handleApi } = require("../netlify/functions/_lib");

test("fresh admin setup creates a usable secure session without an environment session secret", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talk-with-jamie-setup-"));
  const token = "setup-blobs-token";
  const server = new BlobsServer({ directory, token });
  const { address } = await server.start();

  t.after(async () => {
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const blobs = Buffer.from(JSON.stringify({ url: address, token })).toString("base64");
  const headers = {
    host: "localhost",
    origin: "http://localhost",
    "x-nf-client-connection-ip": "127.0.0.2",
    "x-nf-site-id": `setup-site-${Date.now()}`,
    "x-nf-deploy-id": `setup-deploy-${Date.now()}`
  };

  async function request(route, { method = "GET", body, cookie } = {}) {
    const response = await handleApi({
      blobs,
      body: body === undefined ? null : JSON.stringify(body),
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
      httpMethod: method,
      queryStringParameters: { route }
    });
    return { ...response, data: JSON.parse(response.body) };
  }

  const status = await request("setup-status");
  assert.equal(status.statusCode, 200, status.body);
  assert.equal(status.data.configured, false);

  const setup = await request("setup", {
    method: "POST",
    body: {
      setupToken: process.env.ADMIN_SETUP_TOKEN,
      password: "fresh-admin-password"
    }
  });
  assert.equal(setup.statusCode, 200, setup.body);
  const cookie = setup.headers["Set-Cookie"].split(";")[0];

  const me = await request("me", { cookie });
  assert.equal(me.statusCode, 200, me.body);
  assert.deepEqual(me.data, {
    username: "jamie",
    role: "admin",
    accountType: "admin"
  });
});
