# AIMS-UI UI/UX audit and overhaul

## Stack and existing approach

- Framework-free HTML, CSS and ES modules.
- Shared design tokens in `packages/theme/tokens.css`.
- Operator console in `apps/console`; Shadow DOM CogniPal widget in `apps/widget`.
- Existing responsive breakpoints at 1180px, 900px and 640px, including a dedicated mobile conversation-card view.

## Issues found

- Primary cyan actions used white text, producing weak contrast for a critical action style.
- Several status/social borders were light-theme colour remnants inside the dark console.
- Notification metadata and some interaction labels were unnecessarily small.
- Keyboard focus was good in form fields but less consistent on rows, notification items and utility controls.
- Touch target sizing varied across dense operator controls.
- Loading skeleton colours were much lighter than the surrounding dark interface.
- CogniPal could expose more asynchronous state to assistive technology and had undersized secondary controls.

## Changes implemented

- Added semantic accent/danger/focus tokens and corrected primary/danger contrast.
- Normalised status, comment, warning, AI and message borders to dark-theme alpha tokens.
- Improved focus-visible, focus-within, touch, reduced-motion and overscroll behaviour.
- Kept the existing responsive table-to-card strategy and strengthened mobile filters/notification sizing.
- Improved notification typography, operator density and dark loading skeletons.
- Added keyboard prevention for Space on selectable conversation rows.
- Improved CogniPal live-status semantics, counter announcements, focus/touch sizing and metadata readability.
- Added UI contract tests to guard the new interaction baseline.
