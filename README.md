# pi-plugin-anime-monologue

A Pi extension that listens for assistant `thinking` trace deltas, trims them into short dramatic anime inner-monologue gists, sends those to ElevenLabs TTS, and plays the returned audio locally.

By default it leaves Pi's displayed thinking traces alone, waits for the full thinking block, then summarizes that whole block for speech. The gist step uses Pi's current model/auth unless configured otherwise. Set `ANIME_MONOLOGUE_MODE=raw` if you want the old behavior that speaks raw trace chunks.

## Setup

```bash
export ELEVENLABS_API_KEY="..."
export ELEVENLABS_VOICE_ID="..."   # from ElevenLabs voice settings/API

pi -e ./src/index.ts
```

Or create a `.env` file next to `package.json` / in the current project directory:

```dotenv
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

Real environment variables win over values in `.env`. The extension now checks several likely locations: the current working directory, the extension directory, and parent directories around the extension file.

Or install/copy this as a Pi package/extension. The package declares:

```json
{
  "pi": { "extensions": ["./src/index.ts"] }
}
```

## Commands

- `/anime-monologue status` - show config/status
- `/anime-monologue on` - enable narration
- `/anime-monologue off` - disable narration and clear queued audio
- `/anime-monologue pause` - stop current playback and clear queued audio, but stay enabled for future thinking traces
- `/anime-monologue gist` - speak a brief dramatic gist of each full thinking block
- `/anime-monologue raw` - speak raw thinking chunks
- `/anime-monologue mode gist|raw` - explicit mode switch
- `/anime-monologue reload` - reload environment config / colocated `.env`
- `/anime-monologue test <text>` - synthesize and play a raw test line
- `/anime-monologue think-test <trace>` - run a fake thinking trace through gist mode and speak it

Shortcut:

- `Ctrl+Alt+M` - stop current playback and clear queued narration

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | required | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | required | Voice ID to use |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ElevenLabs model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | ElevenLabs output format |
| `ELEVENLABS_SPEED` / `ANIME_MONOLOGUE_SPEED` | `1.15` | Voice speed, clamped to ElevenLabs' typical `0.7`-`1.2` range |
| `ANIME_MONOLOGUE_ENABLED` | `1` | Set to `0` to start disabled |
| `ANIME_MONOLOGUE_MODE` | `gist` | `gist` for full-block dramatic summaries, `raw` for raw thinking chunks |
| `ANIME_MONOLOGUE_GIST_LLM` | `1` | Set to `0` to use a local no-LLM dramatic trimmer |
| `ANIME_MONOLOGUE_GIST_PROVIDER` | current Pi model | Optional provider for gist generation, e.g. `openai-codex` |
| `ANIME_MONOLOGUE_GIST_MODEL` | current Pi model | Optional model id for gist generation |
| `ANIME_MONOLOGUE_GIST_WORDS` | `45` | Target spoken gist length |
| `ANIME_MONOLOGUE_GIST_MAX_INPUT_CHARS` | `6000` | Max thinking trace chars sent to the gist model |
| `ANIME_MONOLOGUE_GIST_MAX_TOKENS` | `180` | Max tokens for the gist response |
| `ANIME_MONOLOGUE_MIN_CHARS` | `90` | Minimum chars before speaking a chunk in raw mode |
| `ANIME_MONOLOGUE_MAX_CHARS` | `360` | Hard-ish chunk size limit in raw mode |
| `ANIME_MONOLOGUE_PLAYER` | auto | Override player command (`afplay`, `mpv`, `ffplay`, etc.) |

On macOS playback uses `afplay` automatically. On Linux it tries common players (`mpg123`, `ffplay`, `mpv`, `play`).

## Notes

- The extension only receives thinking traces when the active provider/model emits Pi `thinking` content.
- TTS/playback runs in a background queue so it should not block Pi streaming.
- Gist mode asks the configured/current Pi model for a brief full-block summary with a self-doubt-to-solution dramatic arc, and explicitly tells it not to reveal step-by-step reasoning or add catchphrases/new facts.
- Raw mode chunks are lightly normalized for speech: code blocks become “code block”, URLs become “a link”, and whitespace is collapsed.
