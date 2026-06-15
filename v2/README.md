# Talk With Jamie v2

I built version 2 to solve the main weakness in the original project: the model had a generic
prompt, but none of my evidence-backed writing style or personal context.

This folder is a complete Netlify deployment. It adds private context retrieval while keeping
raw personal exports and private source files out of the website and
out of GitHub.

## What Changed

- Ranked context retrieval for every public chat and admin draft
- A built-in public-safe persona covering projects, interests, preferences, goals and style
- Persistent visitor facts that are fed back into later replies
- Multiple persistent chats per account, with create, switch and delete controls
- Direct OpenAI Responses API support with a configurable model
- A local context builder that joins both sides of social conversations while keeping raw exports local
- Cross-platform alias merging and relationship dossiers for recurring contacts
- Verified owner facts and recency-aware handling for changing views
- Redaction and exclusion rules for credentials, financial identifiers and high-risk content
- Deployment-only context maintenance; the live admin interface cannot replace or delete the pack
- Private context storage in Netlify Blobs
- Public/admin context separation
- Context-extraction and suspicious-output blocking
- Five-minute server-side context caching
- Legacy login, conversation and admin-thread migration
- Automated tests for context validation, ranking and privacy boundaries

The application remains clearly labelled as AI. Context helps it choose wording and relevant
background; it must not claim to be the human Jamie or expose source material.

## Build The Private Context Pack

The source exports are intentionally outside this folder and ignored by Git.

Place the extracted source text in `../.private-context-source/`, then run:

```bash
npm ci
npm run context:build
```

The builder expects:

- `JAMIE_DIGITAL_TWIN_MASTER_EVERYTHING_v3_PHONE_OPENABLE.txt`
- `assistant_conversation_export_v1.md`
- the eight supplied `WhatsApp Chat with ...txt` files

It writes:

```text
../.private-context/talk-with-jamie-v2.context-pack.json
```

The generated pack is not committed. It is reviewed and uploaded through the private
maintenance workflow to the `talk-with-jamie-context` Blob store. The deployed website has no
enabled route or interface for replacing or deleting the pack.

## Netlify Configuration

Required:

- `SESSION_SECRET` - random value of at least 32 characters
- `ADMIN_SETUP_TOKEN` - one-time setup value of at least 20 characters

Configure one model provider:

- Recommended: `OPENAI_API_KEY`, with optional `OPENAI_MODEL` (defaults to `gpt-5.4-mini`)
- OpenAI-compatible: `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`
- Cohere: `COHERE_API_KEY`, `COHERE_MODEL`

Private maintenance scripts may also need:

- `TALK_BLOBS_SITE_ID`
- `TALK_BLOBS_TOKEN`

No AI key, Netlify token or context data belongs in source code.

## Deployment

The production site is connected to the `main` branch of
`JamieP-205/talk-with-jamie`. Netlify uses `v2` as the base directory, runs
`npm run build`, publishes the base directory, and deploys the functions in
`v2/netlify/functions`.

Normal changes follow this process:

1. run `npm ci` and `npm test` in `v2`
2. commit and push the change to GitHub
3. use the Netlify deploy preview for pull requests or non-production branches
4. merge or push to `main` only after authentication, storage and API checks pass

Manual CLI production deploys are reserved for recovery or a controlled migration.

## Architecture

- `app.js` - public chat, multi-chat controls, admin drafting and conversation management
- `netlify/functions/_context.js` - pack validation, audience filtering and ranking
- `netlify/functions/_lib.js` - authentication, providers, Blobs, migration and API routes
- `tools/build-private-context.js` - local private-pack builder
- `test/` - authentication, context, privacy and deployment tests

## Important Privacy Boundary

Raw social exports contain other people's messages and personal details. They are local source
material, not deployable assets. The builder uses both sides to understand relationships, then
stores a compact redacted pack rather than the original archives. Review the generated pack
before maintenance upload.
