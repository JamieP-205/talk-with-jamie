#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = process.cwd();
const errors = [];

function exactPathExists(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    const entries = fs.readdirSync(current);
    if (!entries.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

for (const page of ["index.html", "404.html"]) {
  const file = path.join(root, page);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    errors.push(`${page} is missing or empty`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  if (!/<title>.+<\/title>/is.test(source)) errors.push(`${page} is missing a title`);
  if (!/<meta\s+name=["']description["']/i.test(source)) errors.push(`${page} is missing a description`);

  for (const match of source.matchAll(/(?:href|src)=["']([^"'#?]+)["']/gi)) {
    const reference = match[1];
    if (/^(?:[a-z]+:|\/\/)/i.test(reference) || reference === "/") continue;
    const target = reference.startsWith("/")
      ? path.join(root, reference.slice(1))
      : path.resolve(path.dirname(file), reference);
    if (!exactPathExists(target)) errors.push(`${page} references missing or case-mismatched file: ${reference}`);
  }

  for (const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      new vm.Script(match[1], { filename: page });
    } catch (error) {
      errors.push(`${page} contains invalid inline JavaScript: ${error.message}`);
    }
  }
}

const config = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const routes = [
  "setup-status", "setup", "register", "login", "guest-login", "logout", "me",
  "public-thread", "public-chat", "admin-chat", "admin-contacts", "admin-save-contacts",
  "admin-public-conversations", "admin-public-conversation",
  "admin-delete-public-conversation", "admin-block-user", "admin-unblock-user"
];
for (const route of routes) {
  if (!config.includes(`route=${route}`)) errors.push(`netlify.toml is missing the ${route} API redirect`);
}
if (/\/home\/|Downloads[\\/]/i.test(config)) errors.push("netlify.toml contains a machine-specific path");

for (const required of ["favicon.svg", "jamie-avatar.jpg", "netlify/functions/api.js", "netlify/functions/_lib.js"]) {
  const file = path.join(root, required);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) errors.push(`${required} is missing or empty`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("Talk With Jamie site and deployment validation passed.");
