# Privacy Notes

Talk With Jamie can store account identifiers, password hashes, chat messages, generated replies, timestamps, and private administrator contact notes in Netlify Blobs.

## Current Safeguards

- Passwords are hashed with scrypt and are never stored directly.
- Session cookies are signed, `HttpOnly`, and `SameSite=Strict`.
- Users are warned not to submit sensitive information.
- The administrator can review and delete stored conversations.
- Public and administrative chat requests are rate limited.
- Request bodies, usernames, messages, and profile fields have size and format limits.

## Provider Processing

Chat content is sent to the configured model provider to generate a response. A production privacy notice must identify the hosting and model providers, explain retention, provide a deletion contact, and match the laws that apply to the operator and audience.

Real user exports, conversations, credentials, and private configuration do not belong in this repository.
