# Production Migration

The live site at `https://talkwithjamie.netlify.app/` already has a configured backend and stored data. Its deployed function source and private data were not present in the supplied project folder, so they cannot be reproduced or migrated from public URLs alone.

## Before replacing the live backend

- [ ] Obtain the original Netlify Function source or confirm it is permanently unavailable.
- [ ] Export or back up the current users, conversations, contacts, prompts, blocked-user list, and configuration.
- [ ] Record the current environment variable names without copying secret values into this repository.
- [ ] Deploy this repository to a separate Netlify test site.
- [ ] Verify registration, login, guest access, public chat, admin drafts, contact saving, conversation viewing, blocking, unblocking, and deletion.
- [ ] Decide whether existing password hashes and sessions can be migrated.
- [ ] Import compatible data into the replacement Blobs stores.
- [ ] Publish an accurate privacy notice and retention/deletion process.
- [ ] Confirm a rollback path to the current production deploy.

## Production approval

Only after the checklist is complete should `ALLOW_TALK_BACKEND_REPLACEMENT=1` be set on the production Netlify site. Without that explicit flag, the build fails before deployment.
