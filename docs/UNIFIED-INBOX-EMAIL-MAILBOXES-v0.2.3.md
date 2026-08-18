# Unified Inbox email automation scope — AIMS-UI v0.2.3

The Unified Inbox exposes only communication channels managed by AIMS. For email, that means `info@jonathan-harris.online`.

`admin@jonathan-harris.online` and `newsletter@jonathan-harris.online` are intentionally outside AIMS Comms Hub automation. Their former nested operator queues have therefore been removed from the console. They are not presented as manual-reply lanes because doing so would make AIMS part of their handling path.

DMs and Comments remain separate Unified Inbox child queues. Managed `info@` conversations continue to use the normal Inbox/workspace route and the existing AIMS reply controls.

The backend is authoritative for the exclusion, so removing the UI routes is defence in depth rather than the sole control.
