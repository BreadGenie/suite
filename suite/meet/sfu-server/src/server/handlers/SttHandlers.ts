import type { Socket } from 'socket.io';
import { loggers } from '../../utils/logger';
import type { HandlerDeps, TypedSocket } from './Handler';

export function registerSttHandlers(deps: HandlerDeps) {
	return (socket: Socket) => {
		socket.on('stt:toggle', async (data, callback) => {
			try {
				deps.authManager.ensureFullAccess(socket);
				if (!deps.sttManager) {
					callback({ success: false, error: 'STT is not configured' });
					return;
				}

				const typedSocket = socket as TypedSocket;
				const roomId = typedSocket.roomId;
				const enabled =
					typeof data?.enabled === 'boolean' ? data.enabled : false;

				if (!roomId) {
					callback({ success: false, error: 'Not in a room' });
					return;
				}

				if (enabled) {
					const wasFirst = deps.sttManager.addSubscriber(roomId, socket.id);
					if (wasFirst) {
						await deps.mediasoup.startSttForExistingProducers(
							roomId,
							deps.sttManager,
						);
					}
				} else {
					const wasLast = deps.sttManager.removeSubscriber(roomId, socket.id);
					if (wasLast) {
						await deps.sttManager.stopRoom(roomId);
					}
				}

				callback({ success: true, enabled });
			} catch (error) {
				loggers.socketHandler.warn(
					'stt:toggle failed: %s',
					(error as Error).message,
				);
				callback({ success: false, error: (error as Error).message });
			}
		});
	};
}
