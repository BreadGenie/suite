import { onMounted, onUnmounted } from "vue";
import { isUnknownRecord } from "../types";
import type { SFUClient } from "../utils/SFUClient";
import { useCaptionStore } from "./useCaptionStore";

export function useCaptions(deps: { sfuClient: SFUClient }) {
	const { sfuClient } = deps;
	const captionStore = useCaptionStore();

	const handleSttSegment = (data: unknown) => {
		if (!isUnknownRecord(data) || !isUnknownRecord(data.segment)) return;
		const segment = data.segment;
		if (
			typeof segment.participantId !== "string" ||
			typeof segment.text !== "string" ||
			typeof segment.timestamp !== "string" ||
			(segment.participantName !== undefined &&
				typeof segment.participantName !== "string") ||
			(segment.isFinal !== undefined && typeof segment.isFinal !== "boolean")
		)
			return;
		captionStore.addCaptionLine({
			participantId: segment.participantId,
			participantName: segment.participantName || segment.participantId,
			text: segment.text,
			timestamp: segment.timestamp,
			isFinal: segment.isFinal,
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
