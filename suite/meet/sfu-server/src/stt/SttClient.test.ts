import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { SttClient, type SttTranscriptEvent } from './SttClient';

describe('SttClient Realtime protocol', () => {
	let server: Server | undefined;
	let websocketServer: WebSocketServer | undefined;
	let client: SttClient | undefined;

	afterEach(async () => {
		client?.destroy();
		await new Promise<void>(
			(resolve) => websocketServer?.close(() => resolve()) ?? resolve(),
		);
		await new Promise<void>(
			(resolve) => server?.close(() => resolve()) ?? resolve(),
		);
	});

	it('configures a transcription session and maps committed item events to Meet transcripts', async () => {
		server = createServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end('{"status":"ok"}');
		});
		websocketServer = new WebSocketServer({ server, path: '/v1/realtime' });
		await new Promise<void>((resolve) =>
			server!.listen(0, '127.0.0.1', resolve),
		);
		const address = server.address();
		if (!address || typeof address === 'string')
			throw new Error('Missing test server address');

		const clientEvents: Record<string, unknown>[] = [];
		websocketServer.on('connection', (socket) => {
			socket.send(
				JSON.stringify({
					type: 'session.created',
					event_id: 'event-created',
					session: { id: 'sess-1', type: 'transcription' },
				}),
			);
			socket.on('message', (raw) => {
				const event = JSON.parse(raw.toString()) as Record<string, unknown>;
				clientEvents.push(event);
				if (event.type === 'session.update') {
					socket.send(
						JSON.stringify({
							type: 'session.updated',
							event_id: 'event-updated',
							session: { id: 'sess-1', type: 'transcription' },
						}),
					);
				}
				if (event.type === 'input_audio_buffer.commit') {
					socket.send(
						JSON.stringify({
							type: 'input_audio_buffer.committed',
							event_id: 'event-committed',
							item_id: 'item-1',
							previous_item_id: null,
						}),
					);
					socket.send(
						JSON.stringify({
							type: 'conversation.item.input_audio_transcription.delta',
							event_id: 'event-delta',
							item_id: 'item-1',
							content_index: 0,
							delta: 'hello',
						}),
					);
					socket.send(
						JSON.stringify({
							type: 'conversation.item.input_audio_transcription.completed',
							event_id: 'event-completed',
							item_id: 'item-1',
							content_index: 0,
							transcript: 'hello world',
							usage: { type: 'duration', seconds: 0.1 },
						}),
					);
				}
			});
		});

		client = new SttClient(`http://127.0.0.1:${address.port}`);
		const transcripts: SttTranscriptEvent[] = [];
		const stream = await client.createStream(
			{
				sessionId: 'meet-session-1',
				roomId: 'room-1',
				participantId: 'participant-1',
				producerId: 'producer-1',
				sampleRate: 24000,
				language: 'en-US',
			},
			(event) => transcripts.push(event),
		);

		stream.sendAudio(Buffer.from([0, 0, 1, 0]));
		stream.markFinal(100);
		await stream.close();

		const update = clientEvents.find(
			(event) => event.type === 'session.update',
		);
		const append = clientEvents.find(
			(event) => event.type === 'input_audio_buffer.append',
		);
		expect(update).toMatchObject({
			session: {
				type: 'transcription',
				audio: { input: { format: { type: 'audio/pcm', rate: 24000 } } },
			},
		});
		expect(append).toMatchObject({
			audio: Buffer.from([0, 0, 1, 0]).toString('base64'),
		});
		expect(transcripts).toEqual([
			{ text: 'hello', isFinal: false, durationMs: 100, sequence: 1 },
			{ text: 'hello world', isFinal: true, durationMs: 100, sequence: 2 },
		]);
	});
});
