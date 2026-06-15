# Production Migration

I use this checklist before replacing the backend currently serving [talkwithjamie.netlify.app](https://talkwithjamie.netlify.app/).

The live deployment contains configuration and stored data that are not represented by public files. The backend in this repository implements the client route contract, but it must be tested and migrated deliberately rather than connected to production without a data plan.

## Before Replacing The Live Backend

- [ ] Export or back up users, conversations, contacts, prompts, blocked-user records, and configuration.
- [ ] Record environment variable names without copying secret values into the repository.
- [ ] Deploy this repository to a separate Netlify test site.
- [ ] Verify registration, login, guest access, public chat, admin drafts, contact saving, conversation viewing, blocking, unblocking, and deletion.
- [ ] Confirm whether existing password hashes and sessions are compatible.
- [ ] Import compatible data into the replacement Blobs stores.
- [ ] Publish an accurate privacy notice with retention and deletion information.
- [ ] Confirm a rollback path to the current production deployment.

## Production Approval

I only set `ALLOW_TALK_BACKEND_REPLACEMENT=1` after every applicable item above is complete. Without that explicit flag, the production build fails before deployment.
