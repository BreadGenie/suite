import re

from suite.store.search_store import FieldSpec, SearchStore

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


class EmailAddressIndex(SearchStore):
    """Shared, per-account index of email addresses for recipient suggestions.

    Sources (cached messages, contact cards, ...) feed in plain {name, email} dicts, so the index
    knows nothing about where an address came from. Each document is keyed by the lowercased
    address, so re-indexing the same address from any source is an upsert and addresses stay unique
    by construction. The index is cumulative: entries are only added or updated, never removed when
    a source is evicted, so it doubles as an address book of everyone the user has corresponded with.
    """

    ENTITY = "email_address"
    FIELDS = (
        # Lowercased address; the unique document key, so the same address upserts across sources.
        FieldSpec("id", stored=True, tokenizer="raw"),
        # Original-cased address and display name, returned verbatim in suggestions.
        FieldSpec("email", stored=True, tokenizer="raw"),
        FieldSpec("name", stored=True, tokenizer="raw"),
        # "name email" blob, tokenized so a query can match either part.
        FieldSpec("text"),
    )
    DEFAULT_SEARCH_FIELDS = ("text",)

    def to_document(self, address: dict) -> dict:
        email = (address.get("email") or "").strip()
        name = (address.get("name") or "").strip() or None

        return {
            "id": email.lower(),
            "email": email,
            "name": name,
            "text": " ".join(filter(None, (name, email))),
        }

    def index_addresses(self, addresses: list[dict]) -> int:
        """Upsert the given {name, email} dicts; skips entries without an email and dedupes the batch."""

        unique = {}
        for address in addresses:
            if email := (address.get("email") or "").strip():
                unique[email.lower()] = address

        return self.index_documents(list(unique.values()))

    def search_email_addresses(self, query: str, limit: int = 10) -> list[dict]:
        """Return up to `limit` {name, email} addresses matching `query`, most relevant first.

        The query's tokens must appear as a consecutive, in-order phrase in the address's name or
        email, with the last token matched as a prefix. So "saga" matches "sagar", and "sagar.s"
        matches "sagar.s@…" / "Sagar Sharma" but not "sagar@…" or "sagar.v@…". Documents are unique
        per address, so the hits need no further deduping.
        """

        tokens = _TOKEN_PATTERN.findall(query.lower()) if query else []
        if not tokens:
            return []

        hits, _total_count = self.search_phrase_prefix(tokens, limit=limit)
        return [{"name": hit.get("name"), "email": hit.get("email")} for hit in hits]
