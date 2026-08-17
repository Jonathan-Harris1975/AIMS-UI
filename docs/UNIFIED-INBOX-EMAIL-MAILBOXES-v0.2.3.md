# Unified Inbox email mailboxes — AIMS-UI v0.2.3

Unified Inbox now includes two additional nested operator queues alongside DMs and Comments:

- **Admin email** → `admin@jonathan-harris.online`
- **Newsletter email** → `newsletter@jonathan-harris.online`

Both queues filter the shared Comms Hub queue by `email_account_key`, preserve the normal workspace view, and route the Back control to the correct specialist inbox.

Admin and Newsletter show a manual-reply-only operator message. The existing email reply composer is reused and AIMS remains authoritative for the manual-only and first-response timing rules. If AIMS schedules a first response, the UI reports the due time instead of claiming that the message was already sent.
