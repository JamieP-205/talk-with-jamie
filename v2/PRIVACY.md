# Privacy Notes

Talk With Jamie v2 stores account identifiers, password hashes, chat messages, generated
replies, timestamps, administrator contact notes and a distilled context pack in Netlify Blobs.

## Private Context

Raw exports are not deployed or committed. A local builder creates a smaller JSON pack that:

- keeps only Jamie-authored WhatsApp examples
- excludes incoming WhatsApp messages and media
- redacts obvious email addresses, phone numbers, links and long identifiers
- rejects common credential and banking-secret patterns
- labels deeper evidence as admin-only

The administrator must review the generated pack before importing it.

Public chat can retrieve only `public` chunks. Jamie's authenticated admin chat and drafting
workspace can retrieve admin chunks. There is no API route for downloading the stored pack.

## Provider Processing

The current message, recent conversation, visitor facts explicitly remembered by the service and
selected context are sent to the configured model provider to generate a reply. Raw export files
are not sent. The OpenAI integration sets `store: false`, but provider-side abuse monitoring and
legal retention rules may still apply. Production deployment must accurately identify the provider,
retention behaviour and the contact route for access or deletion requests.

## User Controls

- Passwords are hashed.
- Sessions use signed `HttpOnly`, `SameSite=Strict` cookies.
- Chats can be reviewed and deleted by the administrator.
- Accounts can be blocked.
- The active context pack can be removed from the admin screen.

No credential, production data, raw export or generated context pack belongs in Git.
