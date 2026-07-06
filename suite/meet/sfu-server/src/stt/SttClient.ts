import WebSocket from 'ws';
import { loggers } from '../utils/logger';

export interface SttStreamMetadata {
	sessionId: string;
	roomId: string;
	participantId: string;
	producerId: string;
	participantName?: string;
	sampleRate: number;
	language?: string;
}

export interface SttTranscriptEvent {
	text: string;
	isFinal: boolean;
	durationMs: number;
	sequence: number;
}

export interface ISttStream {
	sendAudio(frame: Buffer): void;
	markFinal(durationMs: number): void;
	close(): Promise<void>;
}

export interface ISttClient {
	createStream(
		metadata: SttStreamMetadata,
		onTranscript: (event: SttTranscriptEvent) => void,
	): Promise<ISttStream>;
	isAvailable(): boolean;
}

interface SttServerMessage {
	type?: string;
	sessionId?: string;
	roomId?: string;
	participantId?: string;
	producerId?: string;
	text?: string;
	isFinal?: boolean;
	durationMs?: number;
	sequence?: number;
}

export class SttClient implements ISttClient {
	private serverUrl: string;
	private available = false;
	private healthCheckTimer: NodeJS.Timeout | null = null;
	private readonly healthCheckIntervalMs = 10_000;

	constructor(serverUrl: string) {
		this.serverUrl = serverUrl.replace(/\/$/, '');
		this.checkHealth();
		this.startHealthCheckLoop();
	}

	private startHealthCheckLoop(): void {
		this.healthCheckTimer = setInterval(() => {
			if (this.available) {
				if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
				this.healthCheckTimer = null;
			} else {
				this.checkHealth();
			}
		}, this.healthCheckIntervalMs);
	}

	private checkHealth(): void {
		fetch(`${this.serverUrl}/health`)
			.then((res) => {
				if (res.ok) {
					this.available = true;
					loggers.stt.info('STT server reachable at %s', this.serverUrl);
				} else {
					loggers.stt.warn(
						'STT server health check failed (status %d)',
						res.status,
					);
				}
			})
			.catch((err) => {
				loggers.stt.debug(
					'STT server unreachable at %s: %s',
					this.serverUrl,
					err.message,
				);
			});
	}

	destroy(): void {
		if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
		this.healthCheckTimer = null;
	}

	isAvailable(): boolean {
		return this.available;
	}

	async createStream(
		metadata: SttStreamMetadata,
		onTranscript: (event: SttTranscriptEvent) => void,
	): Promise<ISttStream> {
		const socket = new WebSocket(this.getStreamUrl());

		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error('Timed out connecting to STT stream'));
			}, 5000);

			socket.once('open', () => {
				clearTimeout(timer);
				resolve();
			});
			socket.once('error', (error) => {
				clearTimeout(timer);
				reject(error);
			});
		});

		socket.send(
			JSON.stringify({
				type: 'start',
				...metadata,
			}),
		);

		socket.on('message', (data) => {
			let message: SttServerMessage;
			try {
				message = JSON.parse(data.toString()) as SttServerMessage;
			} catch {
				loggers.stt.warn('Dropping malformed STT stream message');
				return;
			}

			if (message.type !== 'transcript') return;
			if (!this.messageMatchesSession(message, metadata)) {
				loggers.stt.warn(
					'Dropping cross-session STT message for session %s',
					metadata.sessionId,
				);
				return;
			}

			const text = typeof message.text === 'string' ? message.text.trim() : '';
			if (!text && !message.isFinal) return;
			onTranscript({
				text,
				isFinal: Boolean(message.isFinal),
				durationMs:
					typeof message.durationMs === 'number' ? message.durationMs : 0,
				sequence: typeof message.sequence === 'number' ? message.sequence : 0,
			});
		});

		socket.on('close', (code, reason) => {
			loggers.stt.debug(
				'STT stream closed for %s (code=%d, reason=%s)',
				metadata.sessionId,
				code,
				reason.toString(),
			);
		});

		return new SttStream(socket, metadata.sessionId);
	}

	private getStreamUrl(): string {
		const wsBase = this.serverUrl
			.replace(/^http:/, 'ws:')
			.replace(/^https:/, 'wss:');
		return `${wsBase}/stream`;
	}

	private messageMatchesSession(
		message: SttServerMessage,
		metadata: SttStreamMetadata,
	): boolean {
		return (
			message.sessionId === metadata.sessionId &&
			message.roomId === metadata.roomId &&
			message.participantId === metadata.participantId &&
			message.producerId === metadata.producerId
		);
	}
}

class SttStream implements ISttStream {
	constructor(
		private socket: WebSocket,
		private sessionId: string,
	) {}

	sendAudio(frame: Buffer): void {
		if (this.socket.readyState !== WebSocket.OPEN) return;
		this.socket.send(frame);
	}

	markFinal(durationMs: number): void {
		if (this.socket.readyState !== WebSocket.OPEN) return;
		this.socket.send(
			JSON.stringify({
				type: 'final',
				sessionId: this.sessionId,
				durationMs,
			}),
		);
	}

	close(): Promise<void> {
		return new Promise((resolve) => {
			if (this.socket.readyState === WebSocket.CLOSED) {
				resolve();
				return;
			}
			this.socket.once('close', () => resolve());
			if (this.socket.readyState === WebSocket.OPEN) {
				this.socket.send(
					JSON.stringify({ type: 'end', sessionId: this.sessionId }),
				);
			}
			this.socket.close();
		});
	}
}

export class MockSttClient implements ISttClient {
	private available = true;

	isAvailable(): boolean {
		return this.available;
	}

	async createStream(
		metadata: SttStreamMetadata,
		onTranscript: (event: SttTranscriptEvent) => void,
	): Promise<ISttStream> {
		return new MockSttStream(metadata, onTranscript);
	}
}

class MockSttStream implements ISttStream {
	private chunks: Buffer[] = [];
	private bytes = 0;
	private sequence = 0;

	constructor(
		private metadata: SttStreamMetadata,
		private onTranscript: (event: SttTranscriptEvent) => void,
	) {}

	sendAudio(frame: Buffer): void {
		this.chunks.push(frame);
		this.bytes += frame.length;
	}

	markFinal(durationMs: number): void {
		if (this.bytes === 0) return;
		this.sequence++;
		const seconds = this.bytes / 2 / this.metadata.sampleRate;
		loggers.stt.info(
			'[MockSTT] Would transcribe %d bytes (~%ds audio) for session %s',
			this.bytes,
			seconds.toFixed(1),
			this.metadata.sessionId,
		);
		this.onTranscript({
			text: `[Mock #${this.sequence}: ~${seconds.toFixed(1)}s]`,
			isFinal: true,
			durationMs,
			sequence: this.sequence,
		});
		this.chunks = [];
		this.bytes = 0;
	}

	async close(): Promise<void> {
		this.chunks = [];
		this.bytes = 0;
	}
}
