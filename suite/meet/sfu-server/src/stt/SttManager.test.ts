import { describe, expect, it, vi } from 'vitest';
import type { ISttClient, ISttStream } from './SttClient';
import { SttManager } from './SttManager';

function createSttClient() {
	let onAvailable: (() => void) | undefined;
	const client: ISttClient = {
		isAvailable: () => false,
		onAvailable: (listener) => {
			onAvailable = listener;
		},
		createStream: vi.fn<() => Promise<ISttStream>>(),
	};
	return { client, recover: () => onAvailable?.() };
}

describe('SttManager', () => {
	it('restarts subscribed rooms when the STT service recovers', async () => {
		const sttClient = createSttClient();
		const manager = new SttManager({ sttClient: sttClient.client });
		const restartRoom = vi.fn<() => Promise<void>>().mockResolvedValue();
		manager.addSubscriber('room-1', 'socket-1');
		manager.setRestartRoomTranscription(restartRoom);

		sttClient.recover();
		await vi.waitFor(() => expect(restartRoom).toHaveBeenCalledWith('room-1'));
	});

	it('passes only room subscribers to the transcript emitter', () => {
		const sttClient = createSttClient();
		const manager = new SttManager({ sttClient: sttClient.client });
		const emit = vi.fn();
		manager.addSubscriber('room-1', 'socket-1');
		manager.setEmitToSubscribers(emit);

		const internals = manager as unknown as {
			handleTranscript: (
				roomId: string,
				participantId: string,
				participantName: string,
				text: string,
				isFinal: boolean,
				durationMs: number,
			) => void;
		};
		internals.handleTranscript(
			'room-1',
			'participant-1',
			'Alice',
			'Hello',
			true,
			100,
		);

		expect(emit).toHaveBeenCalledWith(
			'room-1',
			new Set(['socket-1']),
			'stt:segment',
			expect.objectContaining({ roomId: 'room-1' }),
		);
	});
});
