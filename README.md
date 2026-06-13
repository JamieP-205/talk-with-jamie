# Talk With Jamie

[![CI](https://github.com/jamieparr05/talk-with-jamie/actions/workflows/ci.yml/badge.svg)](https://github.com/jamieparr05/talk-with-jamie/actions/workflows/ci.yml)

Private-by-default Netlify application for a clearly disclosed “AI Jamie” chat experience. It supports registered and guest sessions, persistent chat history, an administrator conversation viewer, and an administrator-only reply drafting workspace.

## Architecture

- Single-page HTML/CSS/JavaScript client
- One routed Netlify Function for the API
- Netlify Blobs for configuration, users, chat history, contacts, and rate limits
- Signed `HttpOnly`, `SameSite=Strict` session cookies
- Scrypt password hashing
- Configurable OpenAI-compatible or Cohere chat provider

## Required environment variables

- `SESSION_SECRET`: random secret of at least 32 characters
- `ADMIN_SETUP_TOKEN`: one-time setup token of at least 20 characters

Netlify Blobs is configured automatically for repository-based Netlify deploys. Manual deploys can use:

- `TALK_BLOBS_SITE_ID`
- `TALK_BLOBS_TOKEN`

Configure one AI option:

- OpenAI-compatible: `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`
- Cohere: `COHERE_API_KEY` and `COHERE_MODEL`

Optional:

- `JAMIE_SYSTEM_PROMPT`: custom public-chat behaviour, up to 8,000 characters

## First deployment

1. Add the required environment variables in Netlify.
2. Deploy the repository.
3. Open the site and complete first-run setup with `ADMIN_SETUP_TOKEN`.
4. Remove or rotate `ADMIN_SETUP_TOKEN` after setup.
5. Sign out and verify admin login with username `jamie`.

## Local checks

```bash
npm ci
npm test
```

Use `npx netlify dev` for end-to-end local testing with functions and local Blobs.

## Privacy and safety

Chats are stored and visible to the administrator. The interface tells users not to share sensitive information and clearly identifies the service as AI. Review [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before production use.
