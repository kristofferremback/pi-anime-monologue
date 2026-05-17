# Changelog

## [0.3.0] – 2026-05-17

### Added

- Plugin-scoped config file `~/.pi/agent/anime-monologue.json` support.
- `FileConfig` type and `readFileConfig()` helper for reading JSON config.
- `envOrFile()`, `envOrFileBoolean()`, `envOrFileNumber()` helpers that merge file config with environment variables (env vars override file values).
- `onboard`/`setup` command now writes config to `~/.pi/agent/anime-monologue.json` instead of `.env`.
- Config file path shown in status notification and missing-keys warning.
- `/anime-monologue voice [id]` command to set or query the voice ID at runtime.
- `writeConfig()` method on `AnimeMonologueSpeaker` that persists the full runtime config back to `~/.pi/agent/anime-monologue.json`.

### Changed

- `readConfig()` now merges file config with env vars; env vars take precedence.
- `reload` command reloads from both environment and config file.
- `ANIME_MONOLOGUE_ENABLED` default changed to `0` (off by default).
- Onboard sequence writes config file with `0600` permissions for security.
- `/anime-monologue voice` now persists the voice ID to the config file via `writeConfig()`, so it survives restarts and reloads.

## [0.2.0] – 2026-05-17

### Added

- `/anime-monologue onboard` (alias `setup`): Interactive guided setup that checks for missing config and writes values to `.env`.
- Session-start notification now suggests `/anime-monologue onboard` when API key or voice ID is missing.

### Changed

- Default to **off** for new sessions (`ANIME_MONOLOGUE_ENABLED=1` required to enable).
- Persist enabled/disabled state across session resumes via `pi.appendEntry()`.
- Status text in the footer now uses muted (`dim`) styling to match other footer elements.
- Never show "anime monologue: off" in the footer — status is cleared when disabled.

## [0.1.0] – 2026-05-17

### Added

- Initial release.
- Listen for assistant `thinking` trace deltas via `message_update` events.
- Generate dramatic anime inner-monologue gists using Pi's current model or a configured alternative.
- Synthesize speech via ElevenLabs TTS with streaming or file-based playback.
- Queue-based audio system with stop, pause, and toggle controls.
- Commands: `/anime-monologue on|off|pause|speed|words|model|language|min|stream|show-gist|dedupe|status|reload|test|think-test`.
- Shortcuts: `Ctrl+Alt+M` (stop), `Ctrl+Alt+N` (toggle).
