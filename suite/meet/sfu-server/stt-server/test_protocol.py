import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from protocol import (
    TranscriptEventFactory,
    clean_transcript,
    openai_sse_event,
    transcript_delta,
    validate_start_message,
)


class ProtocolTest(unittest.TestCase):
    def setUp(self):
        self.start = {
            "type": "start",
            "sessionId": "session-1",
            "roomId": "room-1",
            "participantId": "participant-1",
            "producerId": "producer-1",
            "sampleRate": 16000,
        }

    def test_validates_start_metadata_and_sample_rate(self):
        metadata, error = validate_start_message(self.start.copy())
        self.assertIsNone(error)
        self.assertEqual(metadata, self.start)

        _, error = validate_start_message({**self.start, "producerId": ""})
        self.assertEqual(error, "Missing required stream metadata: producerId")

        _, error = validate_start_message({**self.start, "sampleRate": 48000})
        self.assertEqual(error, "sampleRate must be 16000")

    def test_transcript_events_retain_session_identity_and_sequence(self):
        factory = TranscriptEventFactory(self.start)
        draft = factory.create("hello", False, 500)
        final = factory.create("hello world", True, 900)

        self.assertEqual(draft["sequence"], 1)
        self.assertEqual(final["sequence"], 2)
        self.assertEqual(final["sessionId"], "session-1")
        self.assertEqual(final["roomId"], "room-1")
        self.assertEqual(final["participantId"], "participant-1")
        self.assertEqual(final["producerId"], "producer-1")

    def test_cleans_language_tags_and_frames_openai_events(self):
        self.assertEqual(clean_transcript(" <EN-us>  Hello   world "), "Hello world")
        self.assertEqual(
            openai_sse_event({"type": "transcript.text.delta", "delta": "Hello"}),
            'data: {"type": "transcript.text.delta", "delta": "Hello"}\n\n',
        )

    def test_transcript_delta_handles_growth_and_hypothesis_rewrites(self):
        self.assertEqual(transcript_delta("Hello", "Hello world"), " world")
        self.assertIsNone(transcript_delta("Hello word", "Hello world"))
        self.assertIsNone(transcript_delta("Hello", "Hello"))


if __name__ == "__main__":
    unittest.main()
