# Unified inbox navigation v0.2.1

## Navigation hierarchy

- Overview
- Unified inbox
  - All conversations
  - DMs
  - Comments
- Approvals
- Contacts
- Workflows
- Quarantine
- Analytics
- Settings

DMs and Comments are no longer top-level navigation items. In embedded/HIVE mode, selecting Unified inbox reveals a secondary horizontal submenu. In the standalone desktop/mobile sidebar, the same child queues appear indented beneath Unified inbox.

## Social filter behaviour

- DMs: Facebook and Instagram only.
- Comments: Facebook, Instagram and YouTube only.
- An incompatible channel filter such as Email is automatically cleared when entering DMs or Comments.

## Backend impact

No AIMS backend change is required. The supplied AIMS build already exposes authoritative `interaction_type` (`dm` / `comment`) and `social_platform` queue metadata.
