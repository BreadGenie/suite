import json
import re

TARGET_SAMPLE_RATE = 16000


def clean_transcript(text: str) -> str:
    text = re.sub(r"\s*<[a-z]{2,3}(?:-[a-z0-9]{2,8})?>\s*", " ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def validate_start_message(message: dict) -> tuple[dict | None, str | None]:
    if message.get("type") != "start":
        return None, "First stream message must be type=start"
    missing = [
        key
        for key in ("sessionId", "roomId", "participantId", "producerId", "sampleRate")
        if not message.get(key)
    ]
    if missing:
        return None, f"Missing required stream metadata: {', '.join(missing)}"
    try:
        message["sampleRate"] = int(message["sampleRate"])
    except (TypeError, ValueError):
        return None, "sampleRate must be an integer"
    if message["sampleRate"] != TARGET_SAMPLE_RATE:
        return None, f"sampleRate must be {TARGET_SAMPLE_RATE}"
    return message, None


class TranscriptEventFactory:
    def __init__(self, metadata: dict):
        self.metadata = metadata
        self.sequence = 0

    def create(self, text: str, is_final: bool, duration_ms: float) -> dict:
        self.sequence += 1
        return {
            "type": "transcript",
            "sessionId": self.metadata["sessionId"],
            "roomId": self.metadata["roomId"],
            "participantId": self.metadata["participantId"],
            "producerId": self.metadata["producerId"],
            "sequence": self.sequence,
            "text": text,
            "isFinal": is_final,
            "durationMs": duration_ms,
        }


def openai_sse_event(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def transcript_delta(previous: str, current: str) -> str | None:
    if current == previous:
        return None
    return current[len(previous) :] if current.startswith(previous) else None
