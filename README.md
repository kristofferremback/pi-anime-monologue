# pi-anime-monologue

[![npm version](https://img.shields.io/npm/v/pi-anime-monologue?style=flat-square)](https://www.npmjs.com/package/pi-anime-monologue)
[![License](https://img.shields.io/npm/l/pi-anime-monologue?style=flat-square)](LICENSE)

A Pi extension that listens for assistant `thinking` trace deltas, trims them into short dramatic anime inner-monologue gists, sends those to ElevenLabs TTS, and plays the returned audio locally.

By default it leaves Pi's displayed thinking traces alone, waits for the full thinking block, then summarizes that whole block for speech. The gist step uses Pi's current model/auth unless configured otherwise. Set `ANIME_MONOLOGUE_MODE=raw` if you want the old behavior that speaks raw trace chunks.

## Install

### From npm (recommended)

```bash
pi install npm:pi-anime-monologue
```

Then reload or restart Pi.

### From source

```bash
git clone https://github.com/kristofferremback/pi-anime-monologue.git
cd pi-anime-monologue
npm install
pi -e ./src/index.ts
```

## Quick start

1. Run the guided setup inside Pi:

```text
/anime-monologue onboard
```

This writes plugin-scoped config to `~/.pi/agent/anime-monologue.json` instead of loading a project `.env` file.

You can also use process environment variables if you prefer:

```bash
export ELEVENLABS_API_KEY="..."
export ELEVENLABS_VOICE_ID="..."
```

2. Load the extension:

```bash
pi -e ./src/index.ts
```

Or if installed as a package, it auto-loads.

3. In the Pi prompt, run `/anime-monologue status` to verify it's ready.

## Suggested ElevenLabs voice

This plugin is tuned for an Eleven v3 / Text-to-Dialogue-style anime protagonist inner-monologue voice: expressive enough to follow bracketed delivery tags, but paced slowly enough that ellipses and line breaks land. You can recreate it from this [ElevenLabs voice design link](https://elevenlabs.io/app/voice-lab?action=create&creationType=voiceDesign&prompt=A+young+adult+American+anime+dub+protagonist+performing+a+single-speaker+inner+monologue+for+Eleven+v3+%2F+Text+to+Dialogue.+Bright%2C+forward%2C+nasal+resonance+with+natural+American+twang%2C+hard+r+sounds%2C+flat+a+vowels%2C+and+a+little+raspy+vocal+fry.+Breathy+and+close-mic%2C+but+not+soft%2C+rounded%2C+sweet%2C+British%2C+or+Australian.+Emotionally+flexible%3A+starts+as+a+tense+whisper%2C+pauses+after+short+fragmented+thoughts%2C+then+catches+a+clue+and+rises+into+a+strained+heroic+resolve.+Pacing+should+be+scene-aware+and+unhurried%3A+clear+micro-pauses+after+ellipses+and+em+dashes%2C+audible+breaths+before+pivots%2C+no+machine-gun+delivery.+Think+modern+shonen+anime+dub+energy+in+a+vulnerable+but+determined+moment%3A+melodramatic%2C+sincere%2C+crackling%2C+and+grounded.&previewText=%5Bwhispering%5D+I...+I+don%27t+have+the+whole+answer+yet.%0A%5Bbreathes+in%5D+But+this+trace...+it%27s+not+chaos.+It%27s+pointing+somewhere%E2%80%94%0A%5Bvoice+breaking%5D+If+I+slow+down%2C+follow+the+clue%2C+and+make+the+next+move...+I+can+turn+this+around%21&seed=59013&loudness=0.65&guidanceScale=3), then copy its voice ID into `ELEVENLABS_VOICE_ID`.

For the best pacing with the generated gist prompt, use an Eleven v3-capable model and a slightly slower speed if the delivery rushes:

```bash
export ELEVENLABS_MODEL_ID="eleven_v3"
export ELEVENLABS_SPEED="0.92"
```

Readable settings from that link:

```text
Voice prompt:
A young adult American anime dub protagonist performing a single-speaker inner monologue for Eleven v3 / Text to Dialogue. Bright, forward, nasal resonance with natural American twang, hard r sounds, flat a vowels, and a little raspy vocal fry. Breathy and close-mic, but not soft, rounded, sweet, British, or Australian. Emotionally flexible: starts as a tense whisper, pauses after short fragmented thoughts, then catches a clue and rises into a strained heroic resolve. Pacing should be scene-aware and unhurried: clear micro-pauses after ellipses and em dashes, audible breaths before pivots, no machine-gun delivery. Think modern shonen anime dub energy in a vulnerable but determined moment: melodramatic, sincere, crackling, and grounded.

Preview text:
[whispering] I... I don't have the whole answer yet.
[breathes in] But this trace... it's not chaos. It's pointing somewhere—
[voice breaking] If I slow down, follow the clue, and make the next move... I can turn this around!

Seed:
59013

Loudness:
0.65

Guidance scale:
3
```

## Commands

| Command | Description |
| --- | --- |
| `/anime-monologue status` | Show config and status |
| `/anime-monologue onboard` | Guided setup; writes `~/.pi/agent/anime-monologue.json` |
| `/anime-monologue on` | Enable narration |
| `/anime-monologue off` | Disable narration and clear queued audio |
| `/anime-monologue pause` | Stop playback and clear queue, stay enabled |
| `/anime-monologue speed <0.5-1.2>` | Set voice speed |
| `/anime-monologue voice [id]` | Set voice ID (show current if omitted) |
| `/anime-monologue tts-model [id]` | Set ElevenLabs TTS model; use `eleven_v3` for audio tags |
| `/anime-monologue words <8-120>` | Set gist target length |
| `/anime-monologue model <provider> <model>` | Set gist LLM provider/model |
| `/anime-monologue model current` | Use current Pi model for gists |
| `/anime-monologue language <code>` | Set ElevenLabs language code |
| `/anime-monologue min <chars>` | Skip gist for tiny traces |
| `/anime-monologue stream on\|off` | Toggle streaming audio |
| `/anime-monologue show-gist on\|off` | Toggle gist notification |
| `/anime-monologue dedupe on\|off` | Toggle duplicate suppression |
| `/anime-monologue reload` | Reload config from environment and `~/.pi/agent/anime-monologue.json` |
| `/anime-monologue test <text>` | Speak a raw test line |
| `/anime-monologue think-test <trace>` | Run fake trace through gist pipeline |

### Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+M` | Stop playback and clear narration queue |
| `Ctrl+Alt+N` | Toggle narration on/off |

## Configuration

Preferred plugin-scoped config file: `~/.pi/agent/anime-monologue.json`.

```json
{
	"enabled": true,
	"elevenLabsApiKey": "sk_...",
	"elevenLabsVoiceId": "..."
}
```

Environment variables override matching config-file values.

| Variable | Default | Description |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | required | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | required | Voice ID to use |
| `ELEVENLABS_MODEL_ID` | `eleven_v3` | ElevenLabs model; v2 models may read bracketed delivery tags aloud |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Output format |
| `ELEVENLABS_LANGUAGE_CODE` / `ANIME_MONOLOGUE_LANGUAGE_CODE` | `en` | Language code |
| `ELEVENLABS_SPEED` / `ANIME_MONOLOGUE_SPEED` | `1.0` | Voice speed (`0.5`–`1.2`); try `0.9`–`0.95` if the monologue rushes |
| `ANIME_MONOLOGUE_ENABLED` | `0` | Set to `1` to start enabled |
| `ANIME_MONOLOGUE_GIST_LLM` | `1` | Set to `0` for local-only gist trimming |
| `ANIME_MONOLOGUE_GIST_PROVIDER` | current Pi model | Provider for gist generation |
| `ANIME_MONOLOGUE_GIST_MODEL` | current Pi model | Model for gist generation |
| `ANIME_MONOLOGUE_GIST_WORDS` | `55` | Target spoken gist length |
| `ANIME_MONOLOGUE_GIST_MAX_INPUT_CHARS` | `6000` | Max trace chars sent to gist model |
| `ANIME_MONOLOGUE_GIST_MAX_TOKENS` | `240` | Max tokens for gist response |
| `ANIME_MONOLOGUE_MIN_GIST_INPUT_CHARS` | `120` | Skip gist for smaller traces |
| `ANIME_MONOLOGUE_STREAM_AUDIO` | `1` | Stream direct to player when available |
| `ANIME_MONOLOGUE_SHOW_GIST` | `1` | Show spoken gist as Pi notification |
| `ANIME_MONOLOGUE_DEDUPE` | `1` | Skip duplicate traces/gists |
| `ANIME_MONOLOGUE_PLAYER` | auto | Override player command |

## Package structure

```
pi-anime-monologue/
├── src/
│   └── index.ts          # Extension entry point (default export)
├── .env.example          # Optional process env vars
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package.json          # pi manifest in pi.extensions
└── tsconfig.json
```

## Notes

- The extension only receives thinking traces when the active provider/model emits Pi `thinking` content.
- If thinking blocks show only `Thinking...`, Pi's built-in thinking display is collapsed; press `Ctrl+T` in Pi to toggle hidden thinking blocks.
- TTS/playback runs in a background queue so it should not block Pi streaming.
- Gist mode asks the configured/current Pi model for a brief 2–3 beat summary with an uncertain-whisper → breath/pivot → determined-landing arc, and explicitly tells it not to reveal step-by-step reasoning or add catchphrases/new facts.
