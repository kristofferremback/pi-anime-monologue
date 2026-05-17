import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_NAME = "anime-monologue";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const protectedEnvKeys = new Set(Object.keys(process.env));
let loadedEnvPaths: string[] = [];
let loadedEnvKeys = new Set<string>();

type NarrationMode = "gist" | "raw";

interface Config {
	enabled: boolean;
	apiKey?: string;
	voiceId?: string;
	modelId: string;
	outputFormat: string;
	voiceSpeed: number;
	player?: string;
	minChunkChars: number;
	maxChunkChars: number;
	narrationMode: NarrationMode;
	gistUseLlm: boolean;
	gistProvider?: string;
	gistModel?: string;
	gistMaxInputChars: number;
	gistTargetWords: number;
	gistMaxTokens: number;
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

function candidateEnvPaths() {
	return Array.from(
		new Set([
			join(process.cwd(), ".env"),
			join(EXTENSION_DIR, ".env"),
			join(EXTENSION_DIR, "..", ".env"),
			join(EXTENSION_DIR, "..", "..", ".env"),
		]),
	);
}

function parseEnvLine(rawLine: string): [string, string] | undefined {
	let line = rawLine.trim();
	if (!line || line.startsWith("#")) return undefined;
	if (line.startsWith("export ")) line = line.slice("export ".length).trim();

	const equals = line.indexOf("=");
	if (equals === -1) return undefined;

	const key = line.slice(0, equals).trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

	let value = line.slice(equals + 1).trim();
	const quote = value[0];
	if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
		value = value.slice(1, -1);
	} else if (quote !== '"' && quote !== "'") {
		value = value.replace(/\s+#.*$/, "");
	}
	if (quote === '"') {
		value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}

	return [key, value];
}

function loadEnvFiles() {
	loadedEnvPaths = [];
	const nextEnv = new Map<string, string>();

	for (const path of candidateEnvPaths()) {
		if (!existsSync(path)) continue;
		loadedEnvPaths.push(path);

		const content = readFileSync(path, "utf8");
		for (const rawLine of content.split(/\r?\n/)) {
			const parsed = parseEnvLine(rawLine);
			if (!parsed) continue;

			const [key, value] = parsed;
			if (!nextEnv.has(key)) nextEnv.set(key, value);
		}
	}

	for (const key of loadedEnvKeys) {
		if (!nextEnv.has(key) && !protectedEnvKeys.has(key)) delete process.env[key];
	}

	const nextLoadedKeys = new Set<string>();
	for (const [key, value] of nextEnv) {
		if (protectedEnvKeys.has(key)) continue;
		process.env[key] = value;
		nextLoadedKeys.add(key);
	}
	loadedEnvKeys = nextLoadedKeys;
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

function envNarrationMode(): NarrationMode {
	return process.env.ANIME_MONOLOGUE_MODE?.trim().toLowerCase() === "raw" ? "raw" : "gist";
}

function readConfig(): Config {
	loadEnvFiles();

	return {
		enabled: process.env.ANIME_MONOLOGUE_ENABLED !== "0",
		apiKey: process.env.ELEVENLABS_API_KEY,
		voiceId: process.env.ELEVENLABS_VOICE_ID,
		modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
		outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT ?? "mp3_44100_128",
		voiceSpeed: clamp(envNumber("ELEVENLABS_SPEED", envNumber("ANIME_MONOLOGUE_SPEED", 1.15)), 0.7, 1.2),
		player: process.env.ANIME_MONOLOGUE_PLAYER,
		minChunkChars: envNumber("ANIME_MONOLOGUE_MIN_CHARS", 90),
		maxChunkChars: envNumber("ANIME_MONOLOGUE_MAX_CHARS", 360),
		narrationMode: envNarrationMode(),
		gistUseLlm: envBoolean("ANIME_MONOLOGUE_GIST_LLM", true),
		gistProvider: process.env.ANIME_MONOLOGUE_GIST_PROVIDER,
		gistModel: process.env.ANIME_MONOLOGUE_GIST_MODEL,
		gistMaxInputChars: envNumber("ANIME_MONOLOGUE_GIST_MAX_INPUT_CHARS", 6000),
		gistTargetWords: envNumber("ANIME_MONOLOGUE_GIST_WORDS", 45),
		gistMaxTokens: envNumber("ANIME_MONOLOGUE_GIST_MAX_TOKENS", 180),
		notify: process.env.ANIME_MONOLOGUE_NOTIFY === "1",
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function sentenceBoundaryIndex(text: string, minChars: number, maxChars: number): number | undefined {
	if (text.length < minChars) return undefined;

	const softLimit = Math.min(text.length, maxChars);
	const candidate = text.slice(0, softLimit);
	const matches = [...candidate.matchAll(/[.!?。！？]\s+|\n+/g)];
	const last = matches.at(-1);
	if (last?.index !== undefined) return last.index + last[0].length;

	if (text.length >= maxChars) {
		const space = candidate.lastIndexOf(" ");
		return space > minChars ? space + 1 : softLimit;
	}

	return undefined;
}

function normalizeForSpeech(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, " code block ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/https?:\/\/\S+/g, "a link")
		.replace(/\s+/g, " ")
		.trim();
}

function clipMiddle(text: string, maxChars: number) {
	if (text.length <= maxChars) return text;
	const half = Math.max(100, Math.floor(maxChars / 2));
	return `${text.slice(0, half)}\n\n[dramatic inner monologue montage omitted]\n\n${text.slice(-half)}`;
}

function firstWords(text: string, count: number) {
	return text.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

function localDramaticGist(trace: string, targetWords: number) {
	const trimmed = firstWords(normalizeForSpeech(trace), Math.max(8, targetWords))
		.replace(/\bI need to\b/gi, "I must")
		.replace(/\bwe need to\b/gi, "we must")
		.replace(/\bmaybe\b/gi, "perhaps")
		.trim();
	if (!trimmed) return "";
	const line = `Can this be enough? Yes — ${trimmed}`;
	return /[.!?…]$/.test(line) ? line : `${line}…`;
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

async function choosePlayer(configured?: string): Promise<{ command: string; args: string[] }> {
	if (configured) return { command: configured, args: [] };
	if (process.platform === "darwin") return { command: "afplay", args: [] };
	if (await fileExists("/usr/bin/mpg123")) return { command: "mpg123", args: ["-q"] };
	if (await fileExists("/usr/bin/ffplay")) return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet"] };
	if (await fileExists("/usr/bin/mpv")) return { command: "mpv", args: ["--no-video", "--really-quiet"] };
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

	reloadConfig() {
		this.config = readConfig();
	}

	isEnabled() {
		return this.config.enabled;
	}

	setEnabled(enabled: boolean) {
		this.config.enabled = enabled;
	}

	setNarrationMode(mode: NarrationMode) {
		this.config.narrationMode = mode;
	}

	status() {
		return {
			enabled: this.config.enabled,
			hasApiKey: Boolean(this.config.apiKey),
			voiceId: this.config.voiceId,
			modelId: this.config.modelId,
			voiceSpeed: this.config.voiceSpeed,
			narrationMode: this.config.narrationMode,
			gistUseLlm: this.config.gistUseLlm,
			gistProvider: this.config.gistProvider,
			gistModel: this.config.gistModel,
			queue: this.queue.length,
			gistQueue: this.gistQueue.length,
			bufferChars: this.buffer.length,
			envFiles: loadedEnvPaths,
		};
	}

	handleThinkingDelta(delta: string, ctx: ExtensionContext) {
		if (!this.config.enabled) return;
		this.buffer += delta;

		if (this.config.narrationMode === "gist") return;

		let boundary: number | undefined;
		while ((boundary = sentenceBoundaryIndex(this.buffer, this.config.minChunkChars, this.config.maxChunkChars)) !== undefined) {
			const chunk = this.buffer.slice(0, boundary);
			this.buffer = this.buffer.slice(boundary);
			this.enqueue(chunk, ctx);
		}
	}

	flush(ctx?: ExtensionContext) {
		const trace = this.buffer.trim();
		this.buffer = "";
		this.speakThinkingTrace(trace, ctx);
	}

	speakThinkingTrace(trace: string, ctx?: ExtensionContext) {
		if (!this.config.enabled || !trace.trim()) return;

		if (this.config.narrationMode === "raw") {
			this.enqueue(trace, ctx);
			return;
		}

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
				this.enqueue(gist, item.ctx);
			}
		} finally {
			this.gistProcessing = false;
		}
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
					systemPrompt: `You transform hidden AI thinking traces into short spoken summaries. Do not reveal step-by-step reasoning. Compress the whole trace to the practical gist only. Style: brief dramatic anime inner monologue with a self-doubt-to-solution arc: a flicker of uncertainty, then resolve. Do not add new facts, catchphrases, jokes, or ungrounded anime words. Serious, tense, and useful. Maximum ${this.config.gistTargetWords} words. No bullets. No markdown.`,
					messages: [
						{
							role: "user" as const,
							content: [
								{
									type: "text" as const,
									text: `<thinking_trace>\n${clippedTrace}\n</thinking_trace>\n\nReturn only the shortened dramatic line to be spoken aloud. It should move from doubt to resolve while preserving the trace's actual conclusion.`,
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

			return extractText(response.content) || localDramaticGist(trace, this.config.gistTargetWords);
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
		const response = await fetch(url, {
			method: "POST",
			signal: this.abortController.signal,
			headers: {
				"xi-api-key": this.config.apiKey,
				"accept": "audio/mpeg",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				text,
				model_id: this.config.modelId,
				voice_settings: {
					stability: 0.35,
					similarity_boost: 0.75,
					style: 0.7,
					use_speaker_boost: true,
					speed: this.config.voiceSpeed,
				},
			}),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`ElevenLabs ${response.status}: ${body.slice(0, 240)}`);
		}

		const bytes = Buffer.from(await response.arrayBuffer());
		const audioPath = join(tmpdir(), `${EXTENSION_NAME}-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);
		await fs.writeFile(audioPath, bytes);

		try {
			const player = await choosePlayer(this.config.player);
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
}

export default function animeMonologue(pi: ExtensionAPI) {
	const speaker = new AnimeMonologueSpeaker();

	pi.on("session_start", async (_event, ctx) => {
		speaker.reloadConfig();
		ctx.ui.setStatus(EXTENSION_NAME, speaker.isEnabled() ? "anime monologue: on" : "anime monologue: off");
		if (speaker.status().hasApiKey && speaker.status().voiceId) return;
		ctx.ui.notify(
			`Anime monologue loaded, but keys are missing. Looked for .env at: ${candidateEnvPaths().join(", ")}`,
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
		speaker.stop();
	});

	pi.registerShortcut("ctrl+alt+m", {
		description: "Stop anime monologue playback and clear queued narration",
		handler: async (ctx) => {
			speaker.stop();
			ctx.ui.notify("Anime monologue stopped. Narration remains enabled for the next thinking trace.", "info");
		},
	});

	pi.registerCommand("anime-monologue", {
		description: "Control ElevenLabs narration of thinking traces: on | off | pause | gist | raw | status | reload | test <text>",
		handler: async (args, ctx) => {
			const [command, ...rest] = args.trim().split(/\s+/);
			switch (command) {
				case "on":
					speaker.setEnabled(true);
					ctx.ui.setStatus(EXTENSION_NAME, "anime monologue: on");
					ctx.ui.notify("Anime monologue thinking narration enabled.", "info");
					break;
				case "off":
					speaker.setEnabled(false);
					speaker.stop();
					ctx.ui.setStatus(EXTENSION_NAME, "anime monologue: off");
					ctx.ui.notify("Anime monologue thinking narration disabled.", "info");
					break;
				case "pause":
				case "stop":
				case "shut-up":
					speaker.stop();
					ctx.ui.notify("Anime monologue stopped and queued narration cleared. It will resume on the next thinking trace unless you turn it off.", "info");
					break;
				case "gist":
					speaker.setNarrationMode("gist");
					ctx.ui.notify("Anime monologue mode: full-block dramatic gist.", "info");
					break;
				case "raw":
					speaker.setNarrationMode("raw");
					ctx.ui.notify("Anime monologue mode: raw thinking trace chunks.", "info");
					break;
				case "mode": {
					const mode = rest[0];
					if (mode !== "gist" && mode !== "raw") {
						ctx.ui.notify("Usage: /anime-monologue mode gist|raw", "error");
						break;
					}
					speaker.setNarrationMode(mode);
					ctx.ui.notify(`Anime monologue mode: ${mode}.`, "info");
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
						`Anime monologue: ${status.enabled ? "on" : "off"}, mode: ${status.narrationMode}${status.gistUseLlm ? " + LLM gist" : " + local gist"}, api key: ${status.hasApiKey ? "yes" : "no"}, voice: ${status.voiceId ?? "missing"}, model: ${status.modelId}, speed: ${status.voiceSpeed}, gist model: ${status.gistProvider && status.gistModel ? `${status.gistProvider}/${status.gistModel}` : "current Pi model"}, tts queue: ${status.queue}, gist queue: ${status.gistQueue}, env files: ${status.envFiles.length ? status.envFiles.join(", ") : "none"}`,
						"info",
					);
					break;
				}
				default:
					ctx.ui.notify("Usage: /anime-monologue on|off|pause|gist|raw|mode gist|mode raw|status|reload|test <text>|think-test <trace>", "error");
			}
		},
	});
}
