# Privacy Notes

Talk With Jamie stores account identifiers, password hashes for registered users, chat messages, generated replies, timestamps, and administrator contact notes in Netlify Blobs.

- Passwords are never stored directly.
- Session cookies are signed, `HttpOnly`, and `SameSite=Strict`.
- The administrator can review and delete stored conversations.
- Chat content is sent to the configured AI provider to generate a reply.
- Users should not submit passwords, payment information, health records, private documents, or other sensitive data.

Before public launch, publish a privacy notice that names the hosting and AI providers, states the retention period, provides a deletion contact, and reflects the laws that apply to the operator and audience.
