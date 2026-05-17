import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Readable } from "node:stream";

const EXTENSION_NAME = "pi-anime-monologue";

interface Config {
	enabled: boolean;
	apiKey?: string;
	voiceId?: string;
	modelId: string;
	outputFormat: string;
	languageCode?: string;
	voiceSpeed: number;
	player?: string;
	streamAudio: boolean;
	showGist: boolean;
	dedupe: boolean;
	gistUseLlm: boolean;
	gistProvider?: string;
	gistModel?: string;
	gistMaxInputChars: number;
	gistTargetWords: number;
	gistMaxTokens: number;
	minGistInputChars: number;
	notify: boolean;
}

interface QueueItem {
	text: string;
	ctx?: ExtensionContext;
}

interface GistQueueItem {
	trace: string;
	ctx?: ExtensionContext;
	generation: number;
}



function envNumber(name: string, fallback: number) {
	const value = process.env[name];
	if (value === undefined) return fallback;
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function envBoolean(name: string, fallback: boolean) {
	const value = process.env[name];
	if (value === undefined) return fallback;
	return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function envLanguageCode() {
	const value = process.env.ELEVENLABS_LANGUAGE_CODE ?? process.env.ANIME_MONOLOGUE_LANGUAGE_CODE ?? "en";
	const normalized = value.trim();
	return ["auto", "clear", "none", ""].includes(normalized.toLowerCase()) ? undefined : normalized;
}

function parseOnOff(value: string | undefined): boolean | undefined {
	if (!value) return undefined;
	const normalized = value.trim().toLowerCase();
	if (["on", "true", "1", "yes", "enabled"].includes(normalized)) return true;
	if (["off", "false", "0", "no", "disabled"].includes(normalized)) return false;
	return undefined;
}

function readConfig(): Config {
	return {
		enabled: process.env.ANIME_MONOLOGUE_ENABLED === "1",
		apiKey: process.env.ELEVENLABS_API_KEY,
		voiceId: process.env.ELEVENLABS_VOICE_ID,
		modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
		outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT ?? "mp3_44100_128",
		languageCode: envLanguageCode(),
		voiceSpeed: clamp(envNumber("ELEVENLABS_SPEED", envNumber("ANIME_MONOLOGUE_SPEED", 1.15)), 0.7, 1.2),
		player: process.env.ANIME_MONOLOGUE_PLAYER,
		streamAudio: envBoolean("ANIME_MONOLOGUE_STREAM_AUDIO", true),
		showGist: envBoolean("ANIME_MONOLOGUE_SHOW_GIST", true),
		dedupe: envBoolean("ANIME_MONOLOGUE_DEDUPE", true),
		gistUseLlm: envBoolean("ANIME_MONOLOGUE_GIST_LLM", true),
		gistProvider: process.env.ANIME_MONOLOGUE_GIST_PROVIDER,
		gistModel: process.env.ANIME_MONOLOGUE_GIST_MODEL,
		gistMaxInputChars: envNumber("ANIME_MONOLOGUE_GIST_MAX_INPUT_CHARS", 6000),
		gistTargetWords: envNumber("ANIME_MONOLOGUE_GIST_WORDS", 55),
		gistMaxTokens: envNumber("ANIME_MONOLOGUE_GIST_MAX_TOKENS", 240),
		minGistInputChars: envNumber("ANIME_MONOLOGUE_MIN_GIST_INPUT_CHARS", 120),
		notify: process.env.ANIME_MONOLOGUE_NOTIFY === "1",
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizeForSpeech(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, " code block ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/https?:\/\/\S+/g, "a link")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeKey(text: string) {
	return normalizeForSpeech(text).toLowerCase();
}

function clipMiddle(text: string, maxChars: number) {
	if (text.length <= maxChars) return text;
	const half = Math.max(100, Math.floor(maxChars / 2));
	return `${text.slice(0, half)}\n\n[dramatic inner monologue montage omitted]\n\n${text.slice(-half)}`;
}

function firstWords(text: string, count: number) {
	return text.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

function stripLeadingGistDecorations(text: string) {
	return text
		.trim()
		.replace(/^\s*(?:[\p{Extended_Pictographic}\uFE0F]\s*)+/u, "")
		.replace(/^\s*(?:#{1,6}\s*)?(?:\*\*|__)[^*_\n]{1,80}(?:\*\*|__)\s*:?\s*/u, "")
		.replace(/^\s*(?:gist|summary|inner monologue|spoken line|monologue|narration)\s*:\s*/i, "")
		.replace(/^\s*#{1,6}\s+[^\n]{1,80}\n+/, "");
}

function completeSpokenLine(text: string) {
	let line = normalizeForSpeech(stripLeadingGistDecorations(text))
		.replace(/^['"“”]+|['"“”]+$/g, "")
		.replace(/^[-–—\s]+/, "")
		.replace(/^\.{2,}/, "")
		.replace(/^…+/, "")
		.trim();
	line = stripLeadingGistDecorations(line);
	if (!line) return "";

	// If the model gave multiple sentences, keep them only if they are complete.
	const lastPunctuation = Math.max(line.lastIndexOf("."), line.lastIndexOf("!"), line.lastIndexOf("?"));
	if (lastPunctuation > 20 && lastPunctuation < line.length - 1) {
		const trailing = line.slice(lastPunctuation + 1).trim();
		if (trailing.split(/\s+/).filter(Boolean).length > 3) line = line.slice(0, lastPunctuation + 1);
	}

	return /[.!?]$/.test(line) ? line : `${line}.`;
}

function localDramaticGist(trace: string, targetWords: number) {
	const trimmed = firstWords(normalizeForSpeech(trace), Math.max(8, targetWords))
		.replace(/\bI need to\b/gi, "I must")
		.replace(/\bwe need to\b/gi, "we must")
		.replace(/\bmaybe\b/gi, "perhaps")
		.trim();
	return completeSpokenLine(trimmed);
}

function extractText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is { type: "text"; text: string } => {
			return typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string";
		})
		.map((block) => block.text)
		.join("\n")
		.trim();
}

function isAbortError(error: unknown) {
	return error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message));
}

function isThinkingDelta(event: unknown): event is { type: "thinking_delta"; delta: string } {
	return (
		typeof event === "object" &&
		event !== null &&
		(event as { type?: unknown }).type === "thinking_delta" &&
		typeof (event as { delta?: unknown }).delta === "string"
	);
}

function isThinkingEnd(event: unknown): event is { type: "thinking_end"; content: string } {
	return typeof event === "object" && event !== null && (event as { type?: unknown }).type === "thinking_end";
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

async function commandExists(command: string): Promise<boolean> {
	if (command.includes("/")) return fileExists(command);
	for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
		if (await fileExists(join(dir, command))) return true;
	}
	return false;
}

async function chooseStreamingPlayer(configured?: string): Promise<{ command: string; args: string[] } | undefined> {
	// If the user explicitly configured a player, assume it expects file paths and use file fallback.
	if (configured) return undefined;
	if (await commandExists("ffplay")) return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"] };
	if (await commandExists("mpv")) return { command: "mpv", args: ["--no-video", "--really-quiet", "-"] };
	if (await commandExists("mpg123")) return { command: "mpg123", args: ["-q", "-"] };
	if (await commandExists("play")) return { command: "play", args: ["-q", "-t", "mp3", "-"] };
	return undefined;
}

async function chooseFilePlayer(configured?: string): Promise<{ command: string; args: string[] }> {
	if (configured) return { command: configured, args: [] };
	if (process.platform === "darwin" && (await commandExists("afplay"))) return { command: "afplay", args: [] };
	if (await commandExists("mpg123")) return { command: "mpg123", args: ["-q"] };
	if (await commandExists("ffplay")) return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet"] };
	if (await commandExists("mpv")) return { command: "mpv", args: ["--no-video", "--really-quiet"] };
	return { command: "play", args: ["-q"] };
}

class AnimeMonologueSpeaker {
	private config = readConfig();
	private queue: QueueItem[] = [];
	private gistQueue: GistQueueItem[] = [];
	private processing = false;
	private gistProcessing = false;
	private buffer = "";
	private announcedMissingConfig = false;
	private abortController?: AbortController;
	private summaryAbortController?: AbortController;
	private playerProcess?: ChildProcess;
	private stopGeneration = 0;
	private lastTraceKey?: string;
	private lastGistKey?: string;

	reloadConfig() {
		this.config = readConfig();
	}

	isEnabled() {
		return this.config.enabled;
	}

	setEnabled(enabled: boolean) {
		this.config.enabled = enabled;
	}

	setVoiceSpeed(speed: number) {
		this.config.voiceSpeed = clamp(speed, 0.7, 1.2);
		return this.config.voiceSpeed;
	}

	setLanguageCode(languageCode?: string) {
		this.config.languageCode = languageCode?.trim() || undefined;
		return this.config.languageCode;
	}

	setGistTargetWords(words: number) {
		this.config.gistTargetWords = Math.round(clamp(words, 8, 120));
		this.config.gistMaxTokens = Math.max(this.config.gistMaxTokens, this.config.gistTargetWords * 4);
		return this.config.gistTargetWords;
	}

	setGistModel(provider?: string, model?: string) {
		this.config.gistProvider = provider;
		this.config.gistModel = model;
	}

	setMinGistInputChars(chars: number) {
		this.config.minGistInputChars = Math.max(0, Math.round(chars));
		return this.config.minGistInputChars;
	}

	setStreamAudio(enabled: boolean) {
		this.config.streamAudio = enabled;
	}

	setShowGist(enabled: boolean) {
		this.config.showGist = enabled;
	}

	setDedupe(enabled: boolean) {
		this.config.dedupe = enabled;
	}

	status() {
		return {
			enabled: this.config.enabled,
			hasApiKey: Boolean(this.config.apiKey),
			voiceId: this.config.voiceId,
			modelId: this.config.modelId,
			languageCode: this.config.languageCode,
			voiceSpeed: this.config.voiceSpeed,
			streamAudio: this.config.streamAudio,
			showGist: this.config.showGist,
			dedupe: this.config.dedupe,
			gistUseLlm: this.config.gistUseLlm,
			gistProvider: this.config.gistProvider,
			gistModel: this.config.gistModel,
			gistTargetWords: this.config.gistTargetWords,
			minGistInputChars: this.config.minGistInputChars,
			queue: this.queue.length,
			gistQueue: this.gistQueue.length,
			bufferChars: this.buffer.length,
		};
	}

	handleThinkingDelta(delta: string, _ctx: ExtensionContext) {
		if (!this.config.enabled) return;
		this.buffer += delta;
	}

	flush(ctx?: ExtensionContext) {
		const trace = this.buffer.trim();
		this.buffer = "";
		this.enqueueGist(trace, ctx);
	}

	speakThinkingTrace(trace: string, ctx?: ExtensionContext) {
		if (!this.config.enabled || !trace.trim()) return;
		this.enqueueGist(trace, ctx);
	}

	stop() {
		this.stopGeneration++;
		this.buffer = "";
		this.queue = [];
		this.gistQueue = [];
		this.abortController?.abort();
		this.abortController = undefined;
		this.summaryAbortController?.abort();
		this.summaryAbortController = undefined;
		this.lastTraceKey = undefined;
		this.lastGistKey = undefined;
		this.playerProcess?.kill("SIGTERM");
		this.playerProcess = undefined;
	}

	enqueue(text: string, ctx?: ExtensionContext) {
		const normalized = normalizeForSpeech(text);
		if (!normalized) return;
		this.queue.push({ text: normalized, ctx });
		void this.drain();
	}

	private enqueueGist(trace: string, ctx?: ExtensionContext) {
		const trimmed = trace.trim();
		if (!trimmed) return;

		const traceKey = normalizeKey(trimmed);
		if (traceKey.length < this.config.minGistInputChars) return;
		if (this.config.dedupe && traceKey === this.lastTraceKey) return;
		this.lastTraceKey = traceKey;

		this.gistQueue.push({ trace: trimmed, ctx, generation: this.stopGeneration });
		void this.drainGists();
	}

	private async drainGists() {
		if (this.gistProcessing) return;
		this.gistProcessing = true;

		try {
			while (this.gistQueue.length > 0) {
				const item = this.gistQueue.shift()!;
				if (item.generation !== this.stopGeneration || !this.config.enabled) continue;

				let gist = localDramaticGist(item.trace, this.config.gistTargetWords);
				if (this.config.gistUseLlm && item.ctx) {
					try {
						gist = await this.generateDramaticGist(item.trace, item.ctx);
					} catch (error) {
						if (this.config.notify && !isAbortError(error)) {
							const message = error instanceof Error ? error.message : String(error);
							item.ctx.ui.notify(`Anime monologue gist failed, using local trim: ${message}`, "warning");
						}
					}
				}

				if (item.generation !== this.stopGeneration || !this.config.enabled) continue;

				const gistKey = normalizeKey(gist);
				if (!gistKey) continue;
				if (this.config.dedupe && gistKey === this.lastGistKey) continue;
				this.lastGistKey = gistKey;

				this.displayGist(gist, item.ctx);
				this.enqueue(gist, item.ctx);
			}
		} finally {
			this.gistProcessing = false;
		}
	}

	private displayGist(gist: string, ctx?: ExtensionContext) {
		if (!this.config.showGist || !ctx) return;
		ctx.ui.notify(`🎙 Anime monologue: ${gist}`, "info");
	}

	private resolveGistModel(ctx: ExtensionContext) {
		if (this.config.gistProvider && this.config.gistModel) {
			const configured = ctx.modelRegistry.find(this.config.gistProvider, this.config.gistModel);
			if (configured) return configured;
			if (this.config.notify) {
				ctx.ui.notify(
					`Anime monologue could not find gist model ${this.config.gistProvider}/${this.config.gistModel}; using current model fallback.`,
					"warning",
				);
			}
		}
		return ctx.model;
	}

	private async generateDramaticGist(trace: string, ctx: ExtensionContext) {
		const model = this.resolveGistModel(ctx);
		if (!model) return localDramaticGist(trace, this.config.gistTargetWords);

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) throw new Error(auth.error);
		if (!auth.apiKey && !auth.headers) throw new Error(`no auth available for ${model.provider}/${model.id}`);

		const clippedTrace = clipMiddle(trace, this.config.gistMaxInputChars);
		const controller = new AbortController();
		this.summaryAbortController = controller;

		try {
			const response = await complete(
				model,
				{
					systemPrompt: `You transform hidden AI thinking traces into short spoken summaries. Always write in English. Do not reveal step-by-step reasoning. Compress the whole trace to the practical gist only. Style: brief dramatic anime inner monologue with a self-doubt-to-solution arc. Phrase uncertainty as a question or hesitant thought, not a flat statement. Use dramatic punctuation: ellipses for pauses, exclamation marks for resolve. Add subtle stutters for emotional weight, like "I... I must" or "I... could this be it?". Avoid repeating a fixed opening phrase. Do not add new facts, catchphrases, jokes, or ungrounded anime words. Serious, tense, and useful. Return only the spoken line itself: one or two complete sentences, maximum ${this.config.gistTargetWords} words. End with final punctuation. Do not start the line with punctuation. No emoji. No headings, titles, labels, prefaces, bullets, or markdown. If the thinking trace contains raw escape codes, regex sequences, or backslash patterns, describe them in words instead of outputting the raw characters.`,
					messages: [
						{
							role: "user" as const,
							content: [
								{
									type: "text" as const,
									text: `<thinking_trace>\n${clippedTrace}\n</thinking_trace>\n\nReturn only the shortened dramatic line to be spoken aloud. Do not include any heading, label, emoji, or formatting. It should move from doubt to resolve while preserving the trace's actual conclusion. Use ellipses and exclamation marks for drama. Do not start with punctuation. If the trace contains escape codes or backslash patterns, describe them in words rather than outputting the raw characters.`,
								},
							],
							timestamp: Date.now(),
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens: this.config.gistMaxTokens,
					temperature: 0.9,
					signal: controller.signal,
				},
			);

			return completeSpokenLine(extractText(response.content)) || localDramaticGist(trace, this.config.gistTargetWords);
		} finally {
			if (this.summaryAbortController === controller) this.summaryAbortController = undefined;
		}
	}

	private async drain() {
		if (this.processing) return;
		this.processing = true;

		try {
			while (this.queue.length > 0) {
				const item = this.queue.shift()!;
				try {
					await this.speak(item.text);
				} catch (error) {
					if (isAbortError(error)) continue;
					const message = error instanceof Error ? error.message : String(error);
					item.ctx?.ui.notify(`Anime monologue TTS failed: ${message}`, "error");
				}
			}
		} finally {
			this.processing = false;
		}
	}

	private async playAudioStream(body: ReadableStream<Uint8Array>, player: { command: string; args: string[] }) {
		const audioStream = Readable.fromWeb(body as any);

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const child = spawn(player.command, player.args, { stdio: ["pipe", "ignore", "ignore"] });
			this.playerProcess = child;

			const finish = (error?: Error) => {
				if (settled) return;
				settled = true;
				audioStream.destroy();
				if (this.playerProcess === child) this.playerProcess = undefined;
				if (error) reject(error);
				else resolve();
			};

			child.on("error", finish);
			child.on("close", (code, signal) => {
				if (signal === "SIGTERM" || signal === "SIGKILL") return finish();
				return code === 0 ? finish() : finish(new Error(`${player.command} exited ${code}`));
			});

			audioStream.on("error", (error) => {
				child.kill("SIGTERM");
				finish(error instanceof Error ? error : new Error(String(error)));
			});

			if (!child.stdin) {
				child.kill("SIGTERM");
				finish(new Error(`${player.command} did not expose stdin`));
				return;
			}

			child.stdin.on("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EPIPE") return;
				child.kill("SIGTERM");
				finish(error);
			});

			audioStream.pipe(child.stdin);
		});
	}

	private async playAudioFile(bytes: Buffer) {
		const audioPath = join(tmpdir(), `${EXTENSION_NAME}-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);
		await fs.writeFile(audioPath, bytes);

		try {
			const player = await chooseFilePlayer(this.config.player);
			await new Promise<void>((resolve, reject) => {
				const child = spawn(player.command, [...player.args, audioPath], { stdio: "ignore" });
				this.playerProcess = child;
				child.on("error", reject);
				child.on("close", (code, signal) => {
					if (this.playerProcess === child) this.playerProcess = undefined;
					if (signal === "SIGTERM" || signal === "SIGKILL") return resolve();
					return code === 0 ? resolve() : reject(new Error(`${player.command} exited ${code}`));
				});
			});
		} finally {
			await fs.rm(audioPath, { force: true });
		}
	}

	private async speak(text: string) {
		if (!this.config.apiKey || !this.config.voiceId) {
			if (!this.announcedMissingConfig) {
				this.announcedMissingConfig = true;
				throw new Error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID");
			}
			return;
		}

		this.abortController = new AbortController();
		const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.config.voiceId)}/stream?output_format=${encodeURIComponent(this.config.outputFormat)}`;
		const body: Record<string, unknown> = {
			text: completeSpokenLine(text),
			model_id: this.config.modelId,
			voice_settings: {
				stability: 0.35,
				similarity_boost: 0.75,
				style: 0.7,
				use_speaker_boost: true,
				speed: this.config.voiceSpeed,
			},
		};
		if (this.config.languageCode) body.language_code = this.config.languageCode;

		const response = await fetch(url, {
			method: "POST",
			signal: this.abortController.signal,
			headers: {
				"xi-api-key": this.config.apiKey,
				"accept": "audio/mpeg",
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`ElevenLabs ${response.status}: ${body.slice(0, 240)}`);
		}

		if (this.config.streamAudio && response.body) {
			const streamingPlayer = await chooseStreamingPlayer(this.config.player);
			if (streamingPlayer) {
				await this.playAudioStream(response.body, streamingPlayer);
				return;
			}
		}

		await this.playAudioFile(Buffer.from(await response.arrayBuffer()));
	}
}

export default function animeMonologue(pi: ExtensionAPI) {
	const speaker = new AnimeMonologueSpeaker();

	pi.on("session_start", async (event, ctx) => {
		speaker.reloadConfig();

		// Restore persisted enabled state when resuming a session
		if (event.reason === "resume") {
			for (const entry of ctx.sessionManager.getEntries().reverse()) {
				if (entry.type === "custom" && entry.customType === `${EXTENSION_NAME}-state`) {
					const data = entry.data as { enabled: boolean } | undefined;
					if (data && typeof data.enabled === "boolean") {
						speaker.setEnabled(data.enabled);
					}
					break;
				}
			}
		}

		ctx.ui.setHiddenThinkingLabel("Thinking hidden — press Ctrl+T to show trace");
		const theme = ctx.ui.theme;
		if (speaker.isEnabled()) {
			ctx.ui.setStatus(EXTENSION_NAME, theme.fg("dim", "anime monologue: on"));
		}
		if (speaker.status().hasApiKey && speaker.status().voiceId) return;
		ctx.ui.notify(
			"Anime monologue loaded, but keys are missing. Run `/anime-monologue onboard` for guided setup, or set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID manually.",
			"info",
		);
	});

	pi.on("message_update", (event, ctx) => {
		if (isThinkingDelta(event.assistantMessageEvent)) {
			speaker.handleThinkingDelta(event.assistantMessageEvent.delta, ctx);
		} else if (isThinkingEnd(event.assistantMessageEvent)) {
			speaker.flush(ctx);
		}
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role === "assistant") speaker.flush(ctx);
	});

	pi.on("agent_end", () => {
		speaker.flush();
	});

	pi.on("session_shutdown", () => {
		pi.appendEntry(`${EXTENSION_NAME}-state`, { enabled: speaker.isEnabled() });
		speaker.stop();
	});

	pi.registerShortcut("ctrl+alt+m", {
		description: "Stop anime monologue playback and clear queued narration",
		handler: async (ctx) => {
			speaker.stop();
			ctx.ui.notify("Anime monologue stopped. Narration remains enabled for the next thinking trace.", "info");
		},
	});

	pi.registerShortcut("ctrl+alt+n", {
		description: "Toggle anime monologue narration",
		handler: async (ctx) => {
			const theme = ctx.ui.theme;
			if (speaker.isEnabled()) {
				speaker.setEnabled(false);
				speaker.stop();
				ctx.ui.setStatus(EXTENSION_NAME, undefined);
				pi.appendEntry(`${EXTENSION_NAME}-state`, { enabled: false });
				ctx.ui.notify("Anime monologue disabled.", "info");
				return;
			}
			speaker.setEnabled(true);
			ctx.ui.setStatus(EXTENSION_NAME, theme.fg("dim", "anime monologue: on"));
			pi.appendEntry(`${EXTENSION_NAME}-state`, { enabled: true });
			ctx.ui.notify("Anime monologue enabled.", "info");
		},
	});

	pi.registerCommand("anime-monologue", {
		description: "Control anime inner-monologue TTS narration: on | off | pause | onboard | speed | words | model | language | status | reload | test <text>",
		handler: async (args, ctx) => {
			const [command, ...rest] = args.trim().split(/\s+/);
			switch (command) {
				case "on":
					speaker.setEnabled(true);
					ctx.ui.setStatus(EXTENSION_NAME, ctx.ui.theme.fg("dim", "anime monologue: on"));
					pi.appendEntry(`${EXTENSION_NAME}-state`, { enabled: true });
					ctx.ui.notify("Anime monologue thinking narration enabled.", "info");
					break;
				case "off":
					speaker.setEnabled(false);
					speaker.stop();
					ctx.ui.setStatus(EXTENSION_NAME, undefined);
					pi.appendEntry(`${EXTENSION_NAME}-state`, { enabled: false });
					ctx.ui.notify("Anime monologue thinking narration disabled.", "info");
					break;
				case "pause":
				case "stop":
				case "shut-up":
					speaker.stop();
					ctx.ui.notify("Anime monologue stopped and queued narration cleared. It will resume on the next thinking trace unless you turn it off.", "info");
					break;
				case "speed": {
					const speed = Number(rest[0]);
					if (!Number.isFinite(speed)) {
						ctx.ui.notify("Usage: /anime-monologue speed <0.7-1.2>", "error");
						break;
					}
					ctx.ui.notify(`Anime monologue speed set to ${speaker.setVoiceSpeed(speed)}.`, "info");
					break;
				}
				case "words": {
					const words = Number(rest[0]);
					if (!Number.isFinite(words)) {
						ctx.ui.notify("Usage: /anime-monologue words <8-120>", "error");
						break;
					}
					ctx.ui.notify(`Anime monologue gist target set to ${speaker.setGistTargetWords(words)} words.`, "info");
					break;
				}
				case "model": {
					if (rest[0] === "clear" || rest[0] === "current") {
						speaker.setGistModel(undefined, undefined);
						ctx.ui.notify("Anime monologue gist model reset to current Pi model.", "info");
						break;
					}
					const [provider, model] = rest;
					if (!provider || !model) {
						ctx.ui.notify("Usage: /anime-monologue model <provider> <model> OR /anime-monologue model current", "error");
						break;
					}
					speaker.setGistModel(provider, model);
					ctx.ui.notify(`Anime monologue gist model set to ${provider}/${model}.`, "info");
					break;
				}
				case "language": {
					const language = rest[0] ?? "en";
					speaker.setLanguageCode(language === "auto" || language === "clear" ? undefined : language);
					ctx.ui.notify(`Anime monologue ElevenLabs language code set to ${language}.`, "info");
					break;
				}
				case "min":
				case "min-gist": {
					const chars = Number(rest[0]);
					if (!Number.isFinite(chars)) {
						ctx.ui.notify("Usage: /anime-monologue min <chars>", "error");
						break;
					}
					ctx.ui.notify(`Anime monologue minimum gist input set to ${speaker.setMinGistInputChars(chars)} chars.`, "info");
					break;
				}
				case "stream": {
					const enabled = parseOnOff(rest[0]);
					if (enabled === undefined) {
						ctx.ui.notify("Usage: /anime-monologue stream on|off", "error");
						break;
					}
					speaker.setStreamAudio(enabled);
					ctx.ui.notify(`Anime monologue streaming audio ${enabled ? "enabled" : "disabled"}.`, "info");
					break;
				}
				case "show-gist": {
					const enabled = parseOnOff(rest[0]);
					if (enabled === undefined) {
						ctx.ui.notify("Usage: /anime-monologue show-gist on|off", "error");
						break;
					}
					speaker.setShowGist(enabled);
					ctx.ui.notify(`Anime monologue UI gist display ${enabled ? "enabled" : "disabled"}.`, "info");
					break;
				}
				case "dedupe": {
					const enabled = parseOnOff(rest[0]);
					if (enabled === undefined) {
						ctx.ui.notify("Usage: /anime-monologue dedupe on|off", "error");
						break;
					}
					speaker.setDedupe(enabled);
					ctx.ui.notify(`Anime monologue dedupe ${enabled ? "enabled" : "disabled"}.`, "info");
					break;
				}
			case "onboard":
				case "setup": {
					const status = speaker.status();
					const missing: string[] = [];
					if (!status.hasApiKey) missing.push("ELEVENLABS_API_KEY");
					if (!status.voiceId) missing.push("ELEVENLABS_VOICE_ID");

					const theme = ctx.ui.theme;
					ctx.ui.notify(
						`Anime monologue setup:\n` +
							`  API key:  ${status.hasApiKey ? theme.fg("success", "✓ set") : theme.fg("error", "✗ missing")}\n` +
							`  Voice ID: ${status.voiceId ? theme.fg("success", `✓ ${status.voiceId}`) : theme.fg("error", "✗ missing")}`,
						"info",
					);

					if (missing.length === 0) {
						ctx.ui.notify("All required config is set. You're good to go! 🎉", "info");
						break;
					}

					const shouldSetup = await ctx.ui.confirm(
						"Anime Monologue Setup",
						`Missing: ${missing.join(", ")}. Would you like to configure them now?\n\nValues will be written to .env in the project root.`,
					);
					if (!shouldSetup) break;

					// Read current env values to pre-fill suggestions
					const currentApiKey = process.env.ELEVENLABS_API_KEY;
					const currentVoiceId = process.env.ELEVENLABS_VOICE_ID;

					let apiKey = status.hasApiKey ? currentApiKey : undefined;
					let voiceId = status.voiceId ?? currentVoiceId;

					if (!apiKey) {
						const input = await ctx.ui.input(
							"Enter your ElevenLabs API key (sk_...)",
							"sk_",
						);
						if (!input) {
							ctx.ui.notify("Setup cancelled.", "warning");
							break;
						}
						apiKey = input.trim();
					}

					if (!voiceId) {
						const input = await ctx.ui.input(
							"Enter your ElevenLabs voice ID",
							"",
						);
						if (!input) {
							ctx.ui.notify("Setup cancelled.", "warning");
							break;
						}
						voiceId = input.trim();
					}

					// Write to .env file in project root
					const envPath = join(ctx.cwd, ".env");
					try {
						let existing = "";
						try {
							existing = await fs.readFile(envPath, "utf-8");
						} catch {
							// File doesn't exist yet
						}

						const lines = existing.split("\n");
						const updateVar = (key: string, value: string) => {
							const idx = lines.findIndex(
								(l) => l.startsWith(`${key}=`) || l.startsWith(`# ${key}=`),
							);
							if (idx !== -1) {
								lines[idx] = `${key}=${value}`;
							} else {
								lines.push(`${key}=${value}`);
							}
						};

						if (apiKey) updateVar("ELEVENLABS_API_KEY", apiKey);
						if (voiceId) updateVar("ELEVENLABS_VOICE_ID", voiceId);

						await fs.writeFile(envPath, lines.join("\n") + "\n");
						ctx.ui.notify(".env updated. Run `/anime-monologue reload` to apply the changes.", "info");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(`Failed to write .env: ${message}. Set the variables manually.`, "error");
					}
					break;
				}
				case "reload":
					speaker.reloadConfig();
					ctx.ui.notify("Anime monologue config reloaded from environment.", "info");
					break;
				case "test": {
					const text = rest.join(" ") || "Nani?! My thoughts are overflowing with dramatic determination!";
					speaker.enqueue(text, ctx);
					ctx.ui.notify("Queued test line for ElevenLabs.", "info");
					break;
				}
				case "think-test":
				case "gist-test": {
					const trace =
						rest.join(" ") ||
						"I need to inspect the implementation, identify latency sources, avoid narrating everything, preserve useful decisions, and make the user able to interrupt playback quickly.";
					speaker.speakThinkingTrace(trace, ctx);
					ctx.ui.notify("Queued fake thinking trace through the gist pipeline.", "info");
					break;
				}
				case "status":
				case "":
				case undefined: {
					const status = speaker.status();
					ctx.ui.notify(
						`Anime monologue: ${status.enabled ? "on" : "off"}, ${status.gistUseLlm ? "LLM gist" : "local gist"}, api key: ${status.hasApiKey ? "yes" : "no"}, voice: ${status.voiceId ?? "missing"}, model: ${status.modelId}, language: ${status.languageCode ?? "auto"}, speed: ${status.voiceSpeed}, stream: ${status.streamAudio ? "on" : "off"}, show gist: ${status.showGist ? "on" : "off"}, dedupe: ${status.dedupe ? "on" : "off"}, words: ${status.gistTargetWords}, min chars: ${status.minGistInputChars}, gist model: ${status.gistProvider && status.gistModel ? `${status.gistProvider}/${status.gistModel}` : "current Pi model"}, tts queue: ${status.queue}, gist queue: ${status.gistQueue}`,
						"info",
					);
					break;
				}
				default:
					ctx.ui.notify("Usage: /anime-monologue on|off|pause|onboard|speed <n>|words <n>|model <provider> <model>|language <code>|min <chars>|stream on|off|show-gist on|off|dedupe on|off|status|reload|test <text>|think-test <trace>", "error");
			}
		},
	});
}
