"use strict";

const app = document.getElementById("app");

const state = {
  setup: null,
  me: null,
  mode: "auto",
  publicMessages: [],
  adminThreads: [],
  activeThread: null,
  conversations: [],
  selectedConversation: null,
  authMode: "login",
  loading: false,
  error: ""
};

const platforms = [
  "Snapchat",
  "Instagram",
  "WhatsApp",
  "Messages",
  "Discord",
  "TikTok",
  "Facebook",
  "LinkedIn",
  "Email",
  "Other"
];

const categories = [
  "Dating / Hinge / Tinder",
  "Friend",
  "Close friend",
  "Family",
  "Work",
  "Uni",
  "Random",
  "Bot / scammer",
  "Marketplace",
  "Professional / LinkedIn",
  "Other"
];

const relationships = [
  "New person",
  "Talking stage",
  "Friend",
  "Close friend",
  "Family",
  "Manager",
  "Coworker",
  "Uni person",
  "Recruiter",
  "Stranger",
  "Scammer / bot",
  "Other"
];

const replyShapes = [
  "Auto",
  "One short message",
  "Several short bubbles",
  "One paragraph",
  "Warm and curious",
  "Dry / funny",
  "Careful / polite",
  "Soft / flirty",
  "Blunt but not rude"
];

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The selected theme still applies for the current page.
    }
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function createThread(name = "New person") {
  return {
    id: createId(),
    profile: {
      name,
      age: "",
      relationship: "New person",
      category: "Dating / Hinge / Tinder",
      platform: "Instagram",
      notes: "",
      boundaries: ""
    },
    messages: []
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // An empty or invalid error body is handled by the status fallback.
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storage.set("theme", theme);
}

function toggleTheme() {
  const current = storage.get("theme") || "dark";
  setTheme(current === "dark" ? "light" : "dark");
  render();
}

function themeButton() {
  const label = (storage.get("theme") || "dark") === "dark" ? "Light" : "Dark";
  return `<button class="ghost small" type="button" data-action="toggle-theme">${label}</button>`;
}

function avatar() {
  return '<img class="avatar" src="/jamie-avatar.jpg" alt="Jamie">';
}

function errorBox() {
  return state.error
    ? `<div class="error-box" role="alert">${escapeHtml(state.error)}</div>`
    : "";
}

async function refreshIdentity() {
  try {
    state.me = await api("/api/me");
  } catch {
    state.me = null;
  }
}

async function initialise() {
  setTheme(storage.get("theme") || "dark");

  try {
    state.setup = await api("/api/setup-status");
  } catch (error) {
    state.setup = { configured: false };
    state.error = `Could not reach the setup function: ${error.message}`;
  }

  await refreshIdentity();
  render();
}

function render() {
  try {
    if (!state.setup) return renderLoading();
    if (!state.setup.configured) return renderSetup();
    if (state.me?.role === "admin" && state.mode === "public") return renderPublic();
    if (state.me?.role === "admin" && state.mode === "conversations") return renderConversations();
    if (state.me?.role === "admin") return renderAdmin();
    if (state.me?.role === "user") return renderPublic();
    return renderAuth();
  } catch (error) {
    app.innerHTML = `
      <main class="center">
        <section class="card">
          <h1>Frontend error</h1>
          <div class="error-box">${escapeHtml(error.stack || error.message)}</div>
          <button class="btn" type="button" data-action="reload">Reload</button>
        </section>
      </main>
    `;
  }
}

function renderLoading() {
  app.innerHTML = `
    <main class="center">
      <section class="card">
        <h1>Loading Talk With Jamie…</h1>
        ${errorBox()}
      </section>
    </main>
  `;
}

function renderSetup() {
  app.innerHTML = `
    <main class="center">
      <section class="card">
        <h1>First-run admin setup</h1>
        <p class="muted">
          Create the private admin password. The admin username is <strong>jamie</strong>.
          Use the one-time setup token configured in Netlify.
        </p>
        ${errorBox()}
        <form class="stack" data-form="setup">
          <input class="input" id="setup-token" type="password" autocomplete="off" placeholder="One-time setup token" aria-label="One-time setup token" required>
          <input class="input" id="setup-password" type="password" autocomplete="new-password" placeholder="Create admin password" aria-label="Create admin password" required>
          <input class="input" id="setup-password-confirm" type="password" autocomplete="new-password" placeholder="Confirm password" aria-label="Confirm admin password" required>
          <button class="btn" type="submit">Finish setup</button>
        </form>
      </section>
    </main>
  `;
}

async function setupAdmin(event) {
  event.preventDefault();
  state.error = "";

  const setupToken = document.getElementById("setup-token").value;
  const password = document.getElementById("setup-password").value;
  const confirmation = document.getElementById("setup-password-confirm").value;

  if (password.length < 12) {
    state.error = "Use at least 12 characters.";
    return renderSetup();
  }

  if (password !== confirmation) {
    state.error = "Passwords do not match.";
    return renderSetup();
  }

  try {
    await api("/api/setup", {
      method: "POST",
      body: JSON.stringify({ setupToken, password })
    });
    state.setup = { configured: true };
    await refreshIdentity();
    render();
  } catch (error) {
    state.error = error.message;
    renderSetup();
  }
}

function renderAuth() {
  const loginActive = state.authMode === "login";
  app.innerHTML = `
    <main class="app">
      <header class="header">
        ${avatar()}
        <div class="title">
          <h1>Jamie</h1>
          <p>AI Jamie chat</p>
        </div>
        ${themeButton()}
      </header>
      <section class="messages">
        <div class="row them"><div class="bubble them">Hey</div></div>
        <div class="row them"><div class="bubble them">Make an account to keep the chat, or continue as a guest.</div></div>
        <div class="card">
          <div class="tabs">
            <button class="ghost ${loginActive ? "active-tab" : ""}" type="button" data-action="auth-mode" data-mode="login">Log in</button>
            <button class="ghost ${loginActive ? "" : "active-tab"}" type="button" data-action="auth-mode" data-mode="register">Create account</button>
          </div>
          ${errorBox()}
          <form class="stack" data-form="auth">
            <input class="input" id="username" autocomplete="username" autocapitalize="none" placeholder="Username" aria-label="Username" required>
            <input class="input" id="password" type="password" autocomplete="${loginActive ? "current-password" : "new-password"}" placeholder="Password" aria-label="Password" required>
            <button class="btn" type="submit">${loginActive ? "Log in" : "Create account"}</button>
          </form>
          <button class="ghost full-width-action" type="button" data-action="guest-login">Continue as guest</button>
          <p class="muted">
            This is an AI, not human Jamie. Chats are stored and may be reviewed by the administrator.
            Do not share sensitive information.
          </p>
        </div>
      </section>
    </main>
  `;
}

async function submitAuth(event) {
  event.preventDefault();
  state.error = "";

  try {
    await api(state.authMode === "login" ? "/api/login" : "/api/register", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });
    await refreshIdentity();
    await loadPublicMessages();
    render();
  } catch (error) {
    state.error = error.message;
    renderAuth();
  }
}

async function guestLogin() {
  state.error = "";
  try {
    await api("/api/guest-login", { method: "POST", body: "{}" });
    await refreshIdentity();
    await loadPublicMessages();
    render();
  } catch (error) {
    state.error = error.message;
    renderAuth();
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // Local state is still cleared if the session has already expired.
  }

  state.me = null;
  state.mode = "auto";
  state.publicMessages = [];
  state.error = "";
  render();
}

async function loadPublicMessages() {
  try {
    const data = await api("/api/public-thread");
    state.publicMessages = data.messages || [];
  } catch (error) {
    state.error = error.message;
  }
}

function messageRows() {
  const messages = state.publicMessages || [];
  let html = "";

  if (!messages.length) {
    html += '<div class="row them"><div class="bubble them">Hey</div></div>';
    html += '<div class="row them"><div class="bubble them">This is AI Jamie, just so it’s clear.</div></div>';
  }

  for (const message of messages) {
    const side = message.role === "user" ? "me" : "them";
    html += `
      <div class="row ${side}">
        <div class="bubble ${side}">
          ${escapeHtml(message.text)}
          ${message.status ? `<div class="status">${escapeHtml(message.status)}</div>` : ""}
        </div>
      </div>
    `;
  }

  if (state.loading) {
    html += '<div class="row them"><div class="typing" aria-label="AI Jamie is typing"><span></span><span></span><span></span></div></div>';
  }

  return html;
}

function renderPublic() {
  app.innerHTML = `
    <main class="app">
      <header class="header">
        ${avatar()}
        <div class="title">
          <h1>Jamie</h1>
          <p>${state.loading ? "typing…" : "AI Jamie · online"}</p>
        </div>
        ${themeButton()}
        ${state.me?.role === "admin" ? '<button class="ghost small" type="button" data-action="open-admin">Admin</button>' : ""}
        <button class="ghost small" type="button" data-action="logout">Log out</button>
      </header>
      <section class="messages" id="messages" aria-live="polite">${messageRows()}</section>
      <footer class="composer">
        <textarea id="public-message" aria-label="Message AI Jamie" placeholder="Message…"></textarea>
        <button class="btn" type="button" data-action="send-public" ${state.loading ? "disabled" : ""}>Send</button>
      </footer>
    </main>
  `;

  requestAnimationFrame(() => {
    const messages = document.getElementById("messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

async function sendPublicMessage() {
  const input = document.getElementById("public-message");
  const text = (input?.value || "").trim();
  if (!text || state.loading) return;

  state.publicMessages.push({ role: "user", text, status: "Sent" });
  if (input) input.value = "";
  state.loading = true;
  renderPublic();

  window.setTimeout(() => {
    const lastMessage = state.publicMessages[state.publicMessages.length - 1];
    if (lastMessage?.role === "user") lastMessage.status = "Delivered";
    renderPublic();
  }, 300);

  try {
    const data = await api("/api/public-chat", {
      method: "POST",
      body: JSON.stringify({ message: text })
    });
    const lastUserMessage = [...state.publicMessages].reverse().find((message) => message.role === "user");
    if (lastUserMessage) lastUserMessage.status = "Read";
    state.publicMessages.push({ role: "assistant", text: data.reply || "" });
  } catch (error) {
    state.publicMessages.push({ role: "assistant", text: "Sorry, something went wrong there." });
    state.error = error.message;
  } finally {
    state.loading = false;
    renderPublic();
  }
}

async function loadAdminThreads() {
  try {
    const data = await api("/api/admin-contacts");
    state.adminThreads = data.threads?.length ? data.threads : [createThread()];
  } catch (error) {
    state.error = error.message;
    state.adminThreads = [createThread()];
  }
  state.activeThread = state.adminThreads[0].id;
}

function activeThread() {
  return state.adminThreads.find((thread) => thread.id === state.activeThread)
    || state.adminThreads[0];
}

function profileField(label, key, thread) {
  return `
    <label>
      ${label}
      <input class="input" value="${escapeHtml(thread.profile[key])}" data-profile-key="${key}">
    </label>
  `;
}

function areaField(label, key, thread) {
  return `
    <label class="wide">
      ${label}
      <textarea class="input" data-profile-key="${key}">${escapeHtml(thread.profile[key] || "")}</textarea>
    </label>
  `;
}

function selectField(label, key, options, thread) {
  return `
    <label>
      ${label}
      <select data-profile-key="${key}">
        ${options.map((option) => `<option ${option === thread.profile[key] ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderAdmin() {
  if (!state.adminThreads.length) {
    loadAdminThreads().then(render);
    return renderLoading();
  }

  const thread = activeThread();
  app.innerHTML = `
    <main class="admin">
      <aside class="side">
        <div class="brand">
          <img class="avatar" src="/jamie-avatar.jpg" alt="">
          <div>
            <strong>Jamie Admin</strong>
            <small>${escapeHtml(state.me.username)}</small>
          </div>
        </div>
        <div class="side-actions">
          <button class="btn" type="button" data-action="new-thread">+ New</button>
          <button class="ghost" type="button" data-action="save-admin">Save</button>
          <button class="ghost" type="button" data-action="open-public">Chat as Jamie</button>
          <button class="ghost" type="button" data-action="open-conversations">Conversations</button>
          <button class="ghost" type="button" data-action="logout">Lock</button>
          ${themeButton()}
        </div>
        <div class="list">
          ${state.adminThreads.map((item) => `
            <button class="item ${item.id === state.activeThread ? "active" : ""}" type="button" data-action="select-thread" data-thread-id="${escapeHtml(item.id)}">
              <span>${escapeHtml(item.profile.name || "Unnamed")}</span>
              <small>${escapeHtml(item.profile.platform)} · ${escapeHtml(item.profile.relationship)}</small>
            </button>
          `).join("")}
        </div>
      </aside>
      <section class="main">
        <header class="top">
          <h1>${escapeHtml(thread.profile.name || "Unnamed")}</h1>
          <p>${escapeHtml(thread.profile.platform)} · ${escapeHtml(thread.profile.category)}</p>
        </header>
        <section class="grid">
          ${profileField("Name", "name", thread)}
          ${profileField("Age", "age", thread)}
          ${selectField("Platform", "platform", platforms, thread)}
          ${selectField("Category", "category", categories, thread)}
          ${selectField("Relationship", "relationship", relationships, thread)}
          <label>
            Reply shape
            <select id="reply-shape">
              ${replyShapes.map((shape) => `<option>${escapeHtml(shape)}</option>`).join("")}
            </select>
          </label>
          ${areaField("Notes", "notes", thread)}
          ${areaField("Boundaries / cautions", "boundaries", thread)}
        </section>
        <section class="history">
          ${thread.messages.length
            ? thread.messages.map((message, index) => `
              <article class="admin-bubble ${message.role === "draft" ? "ai" : "user"}">
                ${escapeHtml(message.text)}
                ${message.role === "draft"
                  ? `<br><button class="ghost small" type="button" data-action="copy-draft" data-message-index="${index}">Copy</button>`
                  : ""}
              </article>
            `).join("")
            : '<p class="muted">Paste a message or situation and I will draft a reply in the selected style.</p>'}
        </section>
        <footer class="admin-composer">
          <textarea id="draft-input" aria-label="Message or situation to draft a reply for" placeholder="Paste the message or situation here…"></textarea>
          <div class="actions">
            <button class="btn" type="button" data-action="draft-reply">Draft reply</button>
          </div>
        </footer>
      </section>
    </main>
  `;
}

function patchProfile(key, value) {
  const thread = activeThread();
  if (thread) thread.profile[key] = value;
}

function newAdminThread() {
  const thread = createThread();
  state.adminThreads.unshift(thread);
  state.activeThread = thread.id;
  renderAdmin();
}

async function copyDraft(index) {
  const message = activeThread()?.messages[index];
  if (message?.text) await navigator.clipboard.writeText(message.text);
}

async function saveAdmin() {
  await api("/api/admin-save-contacts", {
    method: "POST",
    body: JSON.stringify({ threads: state.adminThreads })
  });
  window.alert("Saved");
}

async function draftReply() {
  const inputElement = document.getElementById("draft-input");
  const inputText = inputElement?.value.trim();
  if (!inputText) return;

  const thread = activeThread();
  const replyShape = document.getElementById("reply-shape")?.value || "Auto";
  thread.messages.push({ role: "context", text: inputText });
  renderAdmin();

  try {
    const data = await api("/api/admin-chat", {
      method: "POST",
      body: JSON.stringify({
        contactId: thread.id,
        contactProfile: thread.profile,
        replyShape,
        liveThread: thread.messages,
        inputText
      })
    });
    thread.messages.push({ role: "draft", text: data.reply });
    renderAdmin();
  } catch (error) {
    window.alert(error.message);
    renderAdmin();
  }
}

async function loadConversations() {
  const data = await api("/api/admin-public-conversations");
  state.conversations = data.conversations || [];
}

async function openConversation(username) {
  const data = await api(`/api/admin-public-conversation?username=${encodeURIComponent(username)}`);
  state.selectedConversation = data.conversation;
  renderConversations();
}

function conversationHtml(conversation) {
  return `
    <div class="tools">
      <button class="danger" type="button" data-action="block-user" data-username="${escapeHtml(conversation.username)}">Block user</button>
      <button class="danger" type="button" data-action="delete-chat" data-username="${escapeHtml(conversation.username)}">Delete chat</button>
    </div>
    <div class="admin-bubble"><strong>Memory:</strong> ${escapeHtml(conversation.memory || "No summary yet")}</div>
    ${(conversation.messages || []).map((message) => `
      <article class="admin-bubble ${message.role === "assistant" ? "ai" : "user"}">
        <strong>${message.role === "assistant" ? "AI Jamie" : "User"}:</strong>
        ${escapeHtml(message.text)}
        ${message.at ? `<br><small>${escapeHtml(message.at)}</small>` : ""}
      </article>
    `).join("")}
  `;
}

function renderConversations() {
  app.innerHTML = `
    <main class="admin">
      <aside class="side">
        <div class="brand">
          <img class="avatar" src="/jamie-avatar.jpg" alt="">
          <div>
            <strong>Public chats</strong>
            <small>${state.conversations.length} conversations</small>
          </div>
        </div>
        <div class="side-actions">
          <button class="ghost" type="button" data-action="open-admin">Back</button>
          ${themeButton()}
        </div>
        <div class="list">
          ${state.conversations.map((conversation) => `
            <button class="item ${state.selectedConversation?.username === conversation.username ? "active" : ""}" type="button" data-action="open-conversation" data-username="${escapeHtml(conversation.username)}">
              <span>${escapeHtml(conversation.username)}</span>
              <small>${escapeHtml(conversation.accountType)} · ${conversation.messageCount} messages</small>
              <small>${escapeHtml(conversation.lastMessage?.text || "No messages")}</small>
            </button>
          `).join("")}
        </div>
      </aside>
      <section class="main">
        <header class="top">
          <h1>${escapeHtml(state.selectedConversation?.username || "Select a chat")}</h1>
          <p>${escapeHtml(state.selectedConversation?.accountType || "Public and guest conversation viewer")}</p>
        </header>
        <section class="history">
          ${state.selectedConversation
            ? conversationHtml(state.selectedConversation)
            : '<p class="muted">Choose a conversation on the left.</p>'}
        </section>
      </section>
    </main>
  `;
}

async function blockUser(username) {
  if (!window.confirm("Block this user?")) return;
  await api("/api/admin-block-user", {
    method: "POST",
    body: JSON.stringify({ username, reason: "blocked from admin viewer" })
  });
  window.alert("Blocked");
}

async function deleteChat(username) {
  if (!window.confirm("Delete this conversation?")) return;
  await api("/api/admin-delete-public-conversation", {
    method: "POST",
    body: JSON.stringify({ username })
  });
  state.selectedConversation = null;
  await loadConversations();
  renderConversations();
}

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  if (form.dataset.form === "setup") setupAdmin(event);
  if (form.dataset.form === "auth") submitAuth(event);
});

document.addEventListener("change", (event) => {
  const field = event.target.closest("[data-profile-key]");
  if (field) patchProfile(field.dataset.profileKey, field.value);
});

document.addEventListener("keydown", (event) => {
  if (event.target.id !== "public-message") return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPublicMessage();
  }
});

document.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;

  const action = control.dataset.action;
  try {
    if (action === "toggle-theme") toggleTheme();
    if (action === "reload") location.reload();
    if (action === "auth-mode") {
      state.authMode = control.dataset.mode;
      state.error = "";
      renderAuth();
    }
    if (action === "guest-login") await guestLogin();
    if (action === "logout") await logout();
    if (action === "send-public") await sendPublicMessage();
    if (action === "open-admin") {
      state.mode = "admin";
      render();
    }
    if (action === "open-public") {
      state.mode = "public";
      await loadPublicMessages();
      render();
    }
    if (action === "open-conversations") {
      state.mode = "conversations";
      await loadConversations();
      render();
    }
    if (action === "new-thread") newAdminThread();
    if (action === "select-thread") {
      state.activeThread = control.dataset.threadId;
      renderAdmin();
    }
    if (action === "copy-draft") await copyDraft(Number(control.dataset.messageIndex));
    if (action === "save-admin") await saveAdmin();
    if (action === "draft-reply") await draftReply();
    if (action === "open-conversation") await openConversation(control.dataset.username);
    if (action === "block-user") await blockUser(control.dataset.username);
    if (action === "delete-chat") await deleteChat(control.dataset.username);
  } catch (error) {
    state.error = error.message;
    render();
  }
});

window.addEventListener("error", (event) => {
  app.innerHTML = `
    <main class="center">
      <section class="card">
        <h1>Frontend error</h1>
        <div class="error-box">${escapeHtml(event.message)}</div>
        <button class="btn" type="button" data-action="reload">Reload</button>
      </section>
    </main>
  `;
});

initialise();
