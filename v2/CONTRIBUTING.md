# Contributing

This application handles account and conversation data. Keep changes small, reviewable, and privacy-conscious.

1. Create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Run `npm test`.
4. Test authentication, guest access, chat persistence, blocking, deletion, and admin-only routes with `netlify dev`.
5. Never commit deployment tokens, AI keys, Blobs credentials, generated context packs, user exports, or conversation data.

Security-sensitive changes require a clear threat model in the pull request. Context changes must also test public/admin audience separation.
