# Changelog

## [0.1.0] – 2026-05-17

### Added

- Initial release.
- Listen for assistant `thinking` trace deltas via `message_update` events.
- Generate dramatic anime inner-monologue gists using Pi's current model or a configured alternative.
- Synthesize speech via ElevenLabs TTS with streaming or file-based playback.
- Queue-based audio system with stop, pause, and toggle controls.
- Commands: `/anime-monologue on|off|pause|speed|words|model|language|min|stream|show-gist|dedupe|status|reload|test|think-test`.
- Shortcuts: `Ctrl+Alt+M` (stop), `Ctrl+Alt+N` (toggle).
