import { onUnmounted, type Ref, ref } from "vue";
import {
	createNoiseSuppressionAudioWorklet,
	type NoiseSuppressionAudioWorkletHandle,
} from "@workadventure/noise-suppression/audio-worklet";

interface NoiseCancellationResult {
	stream: MediaStream;
	cleanup: () => void;
}

interface UseNoiseCancellationReturn {
	isProcessing: Ref<boolean>;
	processedStream: Ref<MediaStream | null>;
	error: Ref<string | null>;
	applyNoiseCancellation: (
		inputStream: MediaStream,
	) => Promise<NoiseCancellationResult>;
	stopProcessing: () => void;
}

/**
 * Composable for noise cancellation using DTLN.
 */
export function useNoiseCancellation(): UseNoiseCancellationReturn {
	const isProcessing = ref<boolean>(false);
	const processedStream = ref<MediaStream | null>(null);
	const error = ref<string | null>(null);

	let audioContext: AudioContext | null = null;
	let sourceNode: MediaStreamAudioSourceNode | null = null;
	let destinationNode: MediaStreamAudioDestinationNode | null = null;
	let noiseSuppressorWorklet: NoiseSuppressionAudioWorkletHandle | null = null;

	async function applyNoiseCancellation(
		inputStream: MediaStream,
	): Promise<NoiseCancellationResult> {
		const audioTrack = inputStream.getAudioTracks()[0];
		if (!audioTrack) {
			return {
				stream: inputStream,
				cleanup: () => {},
			};
		}

		try {
			isProcessing.value = true;
			error.value = null;

			stopProcessing();

			// DTLN expects mono 16kHz audio.
			audioContext = new AudioContext({ sampleRate: 16000 });
			noiseSuppressorWorklet = await createNoiseSuppressionAudioWorklet(
				audioContext,
				{ bypassUntilReady: true },
			);

			const audioOnlyStream = new MediaStream([audioTrack]);
			sourceNode = audioContext.createMediaStreamSource(audioOnlyStream);

			destinationNode = audioContext.createMediaStreamDestination();

			// connect the audio graph: source -> noise suppressor -> destination
			sourceNode.connect(noiseSuppressorWorklet.node);
			noiseSuppressorWorklet.node.connect(destinationNode);

			const outputStream = destinationNode.stream;
			processedStream.value = outputStream;

			return {
				stream: outputStream,
				cleanup: stopProcessing,
			};
		} catch (err) {
			console.error("[DTLN] Failed to apply noise cancellation:", err);
			error.value =
				err instanceof Error
					? err.message
					: "Failed to apply noise cancellation";
			isProcessing.value = false;

			return {
				stream: inputStream,
				cleanup: () => {},
			};
		}
	}

	function stopProcessing(): void {
		isProcessing.value = false;

		if (sourceNode) {
			try {
				sourceNode.disconnect();
			} catch (e) {
				console.warn("Failed to disconnect source node:", e);
			}
			sourceNode = null;
		}

		if (noiseSuppressorWorklet) {
			try {
				noiseSuppressorWorklet.dispose();
			} catch (e) {
				console.warn("Failed to disconnect noise suppressor node:", e);
			}
			noiseSuppressorWorklet = null;
		}

		if (audioContext && audioContext.state !== "closed") {
			try {
				audioContext.close();
			} catch (e) {
				console.warn("Failed to close AudioContext:", e);
			}
			audioContext = null;
		}

		destinationNode = null;
		processedStream.value = null;
	}

	onUnmounted(() => {
		stopProcessing();
	});

	return {
		isProcessing,
		processedStream,
		error,
		applyNoiseCancellation,
		stopProcessing,
	};
}
