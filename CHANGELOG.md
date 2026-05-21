# Changelog

## [0.5.0] – 2026-05-21

### Added

- **Cheesy reverb**: Post-process ElevenLabs TTS audio through sox `reverb` for dramatic anime inner-monologue echo. Toggle via `/anime-monologue reverb on|off`, `Ctrl+Alt+R` shortcut, or `ANIME_MONOLOGUE_REVERB` env var. Requires `sox` (`brew install sox`).
- **Warning notifications**: New `ANIME_MONOLOGUE_NOTIFY` env var (default `0`) enables warning notifications when LLM gist generation fails or a configured gist model is not found.
- **Command aliases**: `setup` (alias for `onboard`), `stop`/`shut-up` (aliases for `pause`), `gist-test` (alias for `think-test`), `eleven-model` (alias for `tts-model`).

### Changed

- **Voice design prompt**: Updated the suggested ElevenLabs voice for Eleven v3 / Text-to-Dialogue-style pacing, with slower scene-aware cadence, clearer breath pivots, and bracketed delivery tags in the preview text.
- **LLM gist prompt**: Reworked the summary prompt into a 2–3 beat structure: uncertain whisper → breath/sigh pivot → determined landing, using at most three Eleven v3 voice/delivery tags.
- **Speech normalization**: Preserve line breaks in generated gists so Eleven v3 can use text structure for pacing instead of flattening everything into one line.
- **ElevenLabs model default**: Default TTS model is now `eleven_v3`, and `/anime-monologue tts-model [id]` can set or inspect it at runtime.
- **Non-v3 fallback**: Strip bracketed delivery tags before TTS when using a non-v3 ElevenLabs model so tags are not read aloud literally.
- **Local gist fallback**: Shapes fallback summaries into paced beats with `[whispering]`, `[breathes in]`, and `[determined]` delivery cues.

## [0.4.0] – 2026-05-17

### Added

- All config setters (`setEnabled`, `setVoiceId`, `setVoiceSpeed`, `setLanguageCode`, `setGistTargetWords`, `setGistModel`, `setMinGistInputChars`, `setStreamAudio`, `setShowGist`, `setDedupe`) now auto-persist to `~/.pi/agent/anime-monologue.json` on every change.
- TTS speed range expanded to `0.5`–`1.2` (was `0.7`–`1.2`).

### Changed

- **Voice design prompt**: Replaced "boyish, breathy" with bright, forward, nasal American anime VA twang. Explicitly bans British RP, Aussie lift, and rounded vowels. Targets Ichigo/Naruto/Eren/Deku vocal energy. Updated ElevenLabs voice design link and preview text.
- **ElevenLabs voice settings**: Stability `0.35`→`0.15`, style `0.7`→`0.95`, similarity boost `0.75`→`0.80` for maximum expressiveness and dramatic delivery.
- **LLM gist prompt**: Rewrote for breathy, melodramatic shonen anime style with `[breath]`/`[exhale]` markers, stutters, ellipses, and American English contractions. Bans British-coded words ("shall", "perhaps", "shan't").
- **Local gist fallback**: Replaces British-coded phrasing ("must"→"gotta", "perhaps"→"maybe... just maybe", etc.) for consistency.
- **Default TTS speed**: Lowered from `1.15` to `1.0`.

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
