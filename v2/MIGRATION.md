# Version 2 Deployment Checklist

I use this checklist before replacing the current production deployment.

## Before Production

- [ ] Back up the current Netlify deployment and Blob stores.
- [ ] Rotate any AI key that has previously appeared inside a downloadable project archive.
- [ ] Configure a fresh model-provider key through Netlify environment variables.
- [ ] Confirm `SESSION_SECRET` and `ADMIN_SETUP_TOKEN` are configured.
- [ ] Deploy v2 to a preview URL.
- [ ] Test the existing Jamie admin password.
- [ ] Test an existing registered user login.
- [ ] Confirm an existing conversation appears after that user signs in.
- [ ] Test registration, guest login, logout and session expiry.
- [ ] Test public chat without a context pack.
- [ ] Build and manually review the generated private context JSON.
- [ ] Import the pack through the admin **Private context** screen.
- [ ] Confirm public chat uses style context without revealing source material.
- [ ] Confirm admin self-chat can use deeper evidence.
- [ ] Test admin drafts, saved contacts, conversation viewing, blocking and deletion.
- [ ] Confirm the privacy notice identifies the chosen model provider.
- [ ] Record the previous production deploy URL for rollback.

## Compatibility

Version 2 first checks the cleaned store names used by this repository. When an old account,
conversation or admin thread exists only in the previous live store, it is copied into the new
format on successful use.

Legacy AI keys are deliberately not read from stored application configuration. A fresh key
must be supplied through Netlify environment variables.

## Approval

Use `netlify deploy --prod --build` only after the preview deployment passes this checklist.
