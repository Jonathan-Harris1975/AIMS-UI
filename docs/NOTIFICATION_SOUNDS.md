# AIMS Comms Hub notification sound map

Source: `upload/hive_commshub_sounds.zip` from the implementation request. The archive has no mapping README. Supplied MP3s were decoded successfully with FFmpeg and are served from `apps/console/audio/comms/`.

| Event | Source filename | Served path | Default |
| --- | --- | --- | --- |
| Actionable new message | `comms_1_new_message.mp3` | `/console/audio/comms/comms_1_new_message.mp3` | Silent; optional and requires action |
| Review required | `comms_2_review_required.mp3` | `/console/audio/comms/comms_2_review_required.mp3` | Enabled |
| Urgent / blocked | `comms_3_urgent.mp3` | `/console/audio/comms/comms_3_urgent.mp3` | Enabled |
| Resolved | `comms_4_resolved.mp3` | `/console/audio/comms/comms_4_resolved.mp3` | Silent; optional |

Comms Hub preferences are stored in browser local storage. The settings include master mute, per-event switches, volume, Test Sound and browser permission request. Only newly received actionable events with explicit review/urgent/resolved types or `metadata.requires_action` are eligible; ordinary `info` and processing events remain silent. Opening the notification acknowledges it for repeat-alert suppression without marking the underlying communication resolved. Playback errors do not remove the visible notification or its action.

The UI normalizes messages to the shared event schema at `.github/schemas/notification-event.schema.json` before notification delivery.

The UI normalizes HIVE operational events to the same event schema at `.github/schemas/notification-event.schema.json` before notification delivery.
