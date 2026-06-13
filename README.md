# Talk With Jamie

Private-by-default Netlify application for a clearly disclosed “AI Jamie” chat experience. It supports registered and guest sessions, persistent chat history, an administrator conversation viewer, and an administrator-only reply drafting workspace.

Live site: [talkwithjamie.netlify.app](https://talkwithjamie.netlify.app/)

## Production status

The live site is configured and working. The folder originally supplied for this repository contained the production client and generated Netlify configuration, but not the deployed function source or private data files. This repository therefore includes a reviewed replacement backend that implements the same public route contract.

Do not connect this repository to the existing production site until the migration in [MIGRATION.md](MIGRATION.md) is complete. A production build guard prevents an accidental replacement.

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

## Replacement-backend deployment

1. Complete the production migration checklist.
2. Add the required environment variables in Netlify.
3. Set `ALLOW_TALK_BACKEND_REPLACEMENT=1` only after backups and migration testing are complete.
4. Deploy to a separate Netlify test site first.
5. Complete first-run setup with `ADMIN_SETUP_TOKEN`.
6. Remove or rotate `ADMIN_SETUP_TOKEN` after setup.
7. Sign out and verify admin login with username `jamie`.

## Local checks

```bash
npm ci
npm test
```

Use `npx netlify dev` for end-to-end local testing with functions and local Blobs.

## Privacy and safety

Chats are stored and visible to the administrator. The interface tells users not to share sensitive information and clearly identifies the service as AI. Review [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before production use.
