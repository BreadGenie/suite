import { onMounted, onUnmounted } from "vue";
import type { SFUClient } from "../utils/SFUClient";
import { useCaptionStore } from "./useCaptionStore";

export function useCaptions(deps: { sfuClient: SFUClient }) {
	const { sfuClient } = deps;
	const captionStore = useCaptionStore();

	const handleSttSegment = (data: Record<string, unknown>) => {
		const segment = data?.segment as Record<string, unknown> | undefined;
		if (!segment) return;
		captionStore.addCaptionLine({
			participantId: segment.participantId as string,
			participantName:
				(segment.participantName as string) ||
				(segment.participantId as string),
			text: segment.text as string,
			timestamp: segment.timestamp as string,
			isFinal: segment.isFinal as boolean | undefined,
		});
	};

	const toggleCaptions = async () => {
		if (!sfuClient.isConnected()) return;

		const newEnabled = !captionStore.isCaptionsEnabled;
		try {
			await sfuClient.sendRequest("stt:toggle", {
				enabled: newEnabled,
			});
			captionStore.setCaptionsEnabled(newEnabled);
		} catch (error) {
			console.error("Failed to toggle captions:", error);
		}
	};

	onMounted(() => {
		sfuClient.on("stt:segment", handleSttSegment);
	});

	onUnmounted(() => {
		sfuClient.off("stt:segment");
	});

	return {
		toggleCaptions,
	};
}
