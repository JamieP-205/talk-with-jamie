# Deployment Workflow

## Production Mapping

- Repository: `JamieP-205/talk-with-jamie`
- Branch: `main`
- Netlify site: `talkwithjamie`
- Production URL: `https://talkwithjamie.netlify.app`
- Base directory: `v2`
- Build command: `npm run build`
- Publish directory: `.`
- Functions directory: `netlify/functions`

## Normal Change Process

1. Make the change in `v2`.
2. Run `npm ci` when dependencies changed, then run `npm test`.
3. Review the diff and confirm no private source data, generated context pack or secret is tracked.
4. Commit the focused change and push it to GitHub.
5. Use the Netlify deploy preview for branch or pull-request checks.
6. Push or merge to `main` after the preview passes.
7. Verify the production setup status, authentication, chat API, storage and security headers.

## Private Data

The following stay local and are ignored by Git:

- `.private-context-source/`
- `.private-context/`
- `.env` and `.env.*`, except the documented examples
- raw social exports, chat archives and downloaded account data

The generated private pack is uploaded through the maintenance workflow. The deployed admin
interface cannot replace or delete it. Environment variables remain in Netlify and are never
copied into GitHub.

## Recovery

Manual Netlify CLI deployment is reserved for recovery or a reviewed migration. A recovery
deploy must target the existing site ID and must not create a new site, clear Blob stores or
replace environment variables.
