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

This plugin was tuned with an anime protagonist inner-monologue Voice Design. You can recreate it from this [ElevenLabs voice design link](https://elevenlabs.io/app/voice-lab?action=create&creationType=voiceDesign&prompt=An+American+anime+dub+voice+actor+doing+a+breathy+inner+monologue+%E2%80%94+bright%2C+forward%2C+nasal+resonance+with+natural+twang.+Not+soft+or+round.+Not+%22boyish%22+in+a+sweet+sense.+Think+the+edgy%2C+crackling+energy+of+Ichigo%2C+Naruto%2C+Eren%2C+or+Deku+in+a+vulnerable+but+determined+moment.+Heavy+nasal+brightness%2C+forward-placed+vowels+%28hard+%27r%27+sounds%2C+flat+%27a%27%29.+Starts+with+a+raspy%2C+trembling+whisper+%5Bbreath%5D+%5Bexhale%5D%2C+then+climbs+into+a+strained%2C+almost+heroic+crackle.+Breathy+and+intense+but+grounded+in+American+vocal+fry+and+twang.+No+British+RP%2C+no+Aussie+lift%2C+no+rounded+vowels.+Melodramatic+but+sincere.&previewText=%5Bbreath%5D+I+can%27t...+I+can%27t+stop+now.+Not+when+I%27ve+come+this+far.+%5Bbreath%5D+My+heart+feels+like+it%27s+gonna+burst+but+%5Bexhale%5D+that%27s+fine...+that+just+means+I%27m+alive.+I+gotta+push+through.+I+gotta+see+what%27s+waiting+for+me+on+the+other+side%21&seed=59013&loudness=0.7&guidanceScale=3), then copy its voice ID into `ELEVENLABS_VOICE_ID`.

Readable settings from that link:

```text
Voice prompt:
An American anime dub voice actor doing a breathy inner monologue — bright, forward, nasal resonance with natural twang. Not soft or round. Not "boyish" in a sweet sense. Think the edgy, crackling energy of Ichigo, Naruto, Eren, or Deku in a vulnerable but determined moment. Heavy nasal brightness, forward-placed vowels (hard 'r' sounds, flat 'a'). Starts with a raspy, trembling whisper [breath] [exhale], then climbs into a strained, almost heroic crackle. Breathy and intense but grounded in American vocal fry and twang. No British RP, no Aussie lift, no rounded vowels. Melodramatic but sincere.

Preview text:
[breath] I can't... I can't stop now. Not when I've come this far. [breath] My heart feels like it's gonna burst but [exhale] that's fine... that just means I'm alive. I gotta push through. I gotta see what's waiting for me on the other side!

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
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ElevenLabs model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Output format |
| `ELEVENLABS_LANGUAGE_CODE` / `ANIME_MONOLOGUE_LANGUAGE_CODE` | `en` | Language code |
| `ELEVENLABS_SPEED` / `ANIME_MONOLOGUE_SPEED` | `1.0` | Voice speed (`0.5`–`1.2`) |
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
- Gist mode asks the configured/current Pi model for a brief full-block summary with a self-doubt-to-solution dramatic arc, and explicitly tells it not to reveal step-by-step reasoning or add catchphrases/new facts.
