#!/usr/bin/env node

if (
  process.env.CONTEXT === "production"
  && process.env.ALLOW_TALK_BACKEND_REPLACEMENT !== "1"
) {
  console.error(
    "Production deployment blocked: the live Talk With Jamie backend data has not been migrated. "
    + "Complete MIGRATION.md and set ALLOW_TALK_BACKEND_REPLACEMENT=1 only when the replacement is approved."
  );
  process.exit(1);
}

console.log("Production migration guard passed.");
