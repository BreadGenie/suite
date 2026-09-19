import { describe, expect, it, vi } from 'vitest';
import { registerAuthHandlers } from './AuthHandlers';
import { registerRoomJoinHandlers } from './RoomJoinHandlers';

function captureHandler(eventName: string) {
	let handler: ((...args: unknown[]) => void) | undefined;
	const socket = {
		id: 'socket-1',
		roomId: 'room-1',
		participantId: 'participant-1',
		scope: 'full',
		on: (event: string, listener: (...args: unknown[]) => void) => {
			if (event === eventName) handler = listener;
		},
	};
	return { socket, getHandler: () => handler };
}

describe('caption lifecycle cleanup', () => {
	it('removes a caption subscriber when it leaves the room', async () => {
		const { socket, getHandler } = captureHandler('leave_room');
		const removeSubscriber = vi.fn(() => true);
		const stopRoom = vi.fn().mockResolvedValue(undefined);
		const leave = vi.fn().mockResolvedValue(undefined);
		registerRoomJoinHandlers({
			participantConnections: { leave },
			sttManager: { removeSubscriber, stopRoom },
		} as never)(socket as never);

		getHandler()?.();
		await vi.waitFor(() => expect(leave).toHaveBeenCalled());

		expect(removeSubscriber).toHaveBeenCalledWith('room-1', 'socket-1');
		expect(stopRoom).toHaveBeenCalledWith('room-1', true);
	});

	it('removes a caption subscriber when refreshed auth requires E2EE', async () => {
		const { socket, getHandler } = captureHandler('auth:update_token');
		const updateSocketToken = vi.fn(() => {
			(socket as typeof socket & { e2eeRequired?: boolean }).e2eeRequired =
				true;
		});
		const removeSubscriber = vi.fn(() => true);
		const stopRoom = vi.fn().mockResolvedValue(undefined);
		registerAuthHandlers({
			authManager: { updateSocketToken },
			sttManager: { removeSubscriber, stopRoom },
			telemetry: { authEvents: { inc: vi.fn() } },
		} as never)(socket as never);
		const callback = vi.fn();

		getHandler()?.({ token: 'e2ee-token' }, callback);
		await vi.waitFor(() => expect(stopRoom).toHaveBeenCalled());

		expect(removeSubscriber).toHaveBeenCalledWith('room-1', 'socket-1');
		expect(callback).toHaveBeenCalledWith({ success: true });
	});
});
