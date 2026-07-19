import hashlib
import os
import shutil
from dataclasses import dataclass
from typing import ClassVar, Literal
from urllib.parse import quote

import frappe
import tantivy
from frappe import _

from suite.search import get_search_base_path
from suite.utils.lock import write_lock

SCHEMA_VERSION_FILE = "schema.version"


@dataclass(frozen=True)
class FieldSpec:
	"""Describes one field of a search index's schema."""

	name: str
	kind: Literal["text", "integer", "date", "boolean"] = "text"
	stored: bool = False
	fast: bool = False
	tokenizer: str = "default"


class BaseIndex:
	"""A Tantivy full-text index for one entity type, partitioned by `key`.

	Subclasses declare their schema via ENTITY and FIELDS, and may override `to_document`
	to shape a raw source dict into the flat field/value dict this index stores. Each `key`
	(e.g. a JMAP account) gets its own on-disk index under `get_search_base_path()`.
	"""

	# Entity name; forms part of the on-disk path and lock name. Required in subclasses.
	ENTITY: ClassVar[str] = ""
	# Field used as the unique document identifier for upserts and deletes.
	ID_FIELD: ClassVar[str] = "id"
	# Schema definition; changing it bumps the schema version and triggers a rebuild.
	FIELDS: ClassVar[tuple[FieldSpec, ...]] = ()
	# Fields queried when a search call doesn't specify its own field list.
	DEFAULT_SEARCH_FIELDS: ClassVar[tuple[str, ...]] = ()

	# Per-writer memory budget for indexing, in bytes.
	HEAP_SIZE: ClassVar[int] = 50 * 1024 * 1024

	def __init__(self, key: str) -> None:
		"""Resolve this index's on-disk path from key/ENTITY and reconcile its schema version."""

		if not self.ENTITY:
			frappe.throw("BaseIndex subclasses must define ENTITY")
		if not key:
			frappe.throw("BaseIndex subclasses must be instantiated with a key")

		self.key = key
		# Layout is <base>/<key>/<entity>, so every index for a key (e.g. an account) lives under
		# one directory — easy to browse and to clear all of a key's indexes in one shot.
		self.path = os.path.join(get_search_base_path(), quote(key, safe=""), self.ENTITY)
		os.makedirs(self.path, exist_ok=True)

		self._schema = self._build_schema()
		self._reconcile_schema_version()

	def index_documents(self, sources: list[dict]) -> int:
		"""Upsert the given source dicts into the index; returns the number processed.

		Each source is deleted-then-added by its ID_FIELD, so re-indexing an existing
		document replaces it. Sources without an ID are skipped.
		"""

		if not sources:
			return 0

		with write_lock(self._lockname, acquire_timeout=30, lock_timeout=300):
			index = self._open()
			writer = index.writer(heap_size=self.HEAP_SIZE, num_threads=1)

			try:
				for source in sources:
					document = self._to_tantivy_document(self.to_document(source))
					doc_id = document.get_first(self.ID_FIELD)
					if doc_id is None:
						continue

					# Delete any existing doc with this ID first so re-indexing is an upsert.
					writer.delete_documents(self.ID_FIELD, str(doc_id))
					writer.add_document(document)

				writer.commit()
				writer.wait_merging_threads()
			finally:
				# Release the writer's lock even if commit raised.
				del writer

		return len(sources)

	def delete_documents(self, ids: list[str]) -> int:
		"""Delete documents matching the given ID_FIELD values; returns the count requested."""

		if not ids:
			return 0

		with write_lock(self._lockname, acquire_timeout=30, lock_timeout=300):
			index = self._open()
			writer = index.writer(heap_size=self.HEAP_SIZE, num_threads=1)

			try:
				for doc_id in ids:
					writer.delete_documents(self.ID_FIELD, str(doc_id))

				writer.commit()
				writer.wait_merging_threads()
			finally:
				# Release the writer's lock even if commit raised.
				del writer

		return len(ids)

	def search(
		self,
		query: str,
		limit: int = 20,
		offset: int = 0,
		fields: list[str] | None = None,
		order_by: str | None = None,
	) -> tuple[list[dict], int]:
		"""Run a free-text query (parsed by Tantivy) and return `(hits, total_count)`.

		`hits` is a page (`limit`/`offset`) of stored-field dicts, each annotated with
		`_score` and `_id`; `total_count` is the full number of matches. `fields` overrides
		DEFAULT_SEARCH_FIELDS. Returns an empty result on a blank query, a missing index, or
		any query error (logged, never raised, so search failures don't break the caller).
		"""

		if not query or not query.strip():
			return ([], 0)

		fields = fields or list(self.DEFAULT_SEARCH_FIELDS) or None
		return self._run_search(lambda index: index.parse_query(query, fields), limit, offset, order_by)

	def search_phrase_prefix(
		self,
		terms: list[str],
		limit: int = 20,
		offset: int = 0,
		fields: list[str] | None = None,
		order_by: str | None = None,
	) -> tuple[list[dict], int]:
		"""Search for the given terms as a consecutive, in-order phrase whose last term is a prefix.

		Built for as-you-type autocomplete: the terms must appear adjacent and in order in one of
		`fields`, with the final term matched as a prefix — so "sagar s" matches "sagar.s@…" and
		"Sagar Sharma", but not "sagar@…" (nothing follows "sagar") nor an address that merely
		contains both words apart. A single term is a plain prefix match. Returns `(hits, count)`.
		"""

		terms = [term for term in terms if term]
		if not terms:
			return ([], 0)

		fields = fields or list(self.DEFAULT_SEARCH_FIELDS)
		return self._run_search(
			lambda _index: self._build_phrase_prefix_query(terms, fields), limit, offset, order_by
		)

	def _run_search(
		self, build_query, limit: int, offset: int, order_by: str | None
	) -> tuple[list[dict], int]:
		"""Open the index, build a query via `build_query(index)`, run it, and return `(hits, count)`.

		Shared plumbing for `search`/`search_phrase_prefix`; swallows query errors (logged) into an
		empty result so a malformed query never breaks the caller.
		"""

		# Nothing has been indexed yet for this key.
		if not tantivy.Index.exists(self.path):
			return ([], 0)

		try:
			index = self._open()

			# Pick up commits made by other workers since this index was opened.
			index.reload()

			searcher = index.searcher()
			result = searcher.search(
				build_query(index), limit=limit, offset=offset, count=True, order_by_field=order_by
			)
			hits = [self._to_hit(searcher.doc(address), score) for score, address in result.hits]
			return (hits, result.count)
		except Exception:
			frappe.logger("suite.search").warning(
				{"event": "search-failed", "entity": self.ENTITY, "key": self.key}
			)
			return ([], 0)

	def _build_phrase_prefix_query(self, terms: list[str], fields: list[str]) -> "tantivy.Query":
		"""Build a phrase-prefix query over `terms`, matching in any one of `fields`."""

		if len(fields) == 1:
			return tantivy.Query.phrase_prefix_query(self._schema, fields[0], terms)

		# Match the phrase in any of the fields.
		clauses = [
			(tantivy.Occur.Should, tantivy.Query.phrase_prefix_query(self._schema, field, terms))
			for field in fields
		]
		return tantivy.Query.boolean_query(clauses)

	def drop(self) -> None:
		"""Delete this index's entire on-disk directory."""

		with write_lock(self._lockname, acquire_timeout=30, lock_timeout=300):
			if os.path.exists(self.path):
				shutil.rmtree(self.path)

	def to_document(self, source: dict) -> dict:
		"""Map a raw source dict to a flat field/value dict. Override to reshape sources."""

		return source

	@property
	def _lockname(self) -> str:
		"""Lock name scoping writes to this entity/key, so concurrent workers serialize."""

		return f"search-index:{self.ENTITY}:{quote(self.key, safe='')}"

	@property
	def _stored_fields(self) -> list[str]:
		"""Names of fields marked `stored`, i.e. the ones returned in search hits."""

		return [field.name for field in self.FIELDS if field.stored]

	@staticmethod
	def _read_version(version_file: str) -> str | None:
		"""Read the schema version written on disk, or None if it hasn't been written yet."""

		try:
			with open(version_file) as f:
				return f.read().strip()
		except FileNotFoundError:
			return None

	@staticmethod
	def _write_version(version_file: str, version: str) -> None:
		"""Persist the current schema version alongside the index."""

		with open(version_file, "w") as f:
			f.write(version)

	def _build_schema(self) -> "tantivy.Schema":
		"""Build the Tantivy schema from FIELDS, mapping each FieldSpec kind to a field type."""

		builder = tantivy.SchemaBuilder()

		for field in self.FIELDS:
			if field.kind == "text":
				builder.add_text_field(
					field.name, stored=field.stored, fast=field.fast, tokenizer_name=field.tokenizer
				)

			elif field.kind == "integer":
				builder.add_integer_field(field.name, stored=field.stored, indexed=True, fast=field.fast)

			elif field.kind == "date":
				builder.add_date_field(field.name, stored=field.stored, indexed=True, fast=field.fast)

			elif field.kind == "boolean":
				builder.add_boolean_field(field.name, stored=field.stored, indexed=True, fast=field.fast)

			else:
				frappe.throw(_("Unknown field kind: {0}").format(field.kind))

		return builder.build()

	def _reconcile_schema_version(self) -> None:
		"""Rebuild the index from scratch if its stored schema version no longer matches.

		A first-time index just records the current version. A version mismatch means FIELDS
		changed, so the stale index directory is wiped and recreated (re-indexing happens
		lazily on the next write).
		"""

		version_file = os.path.join(self.path, SCHEMA_VERSION_FILE)
		current = self._schema_version()
		existing = self._read_version(version_file)

		if existing == current:
			return

		if existing is None:
			self._write_version(version_file, current)
			return

		with write_lock(self._lockname, acquire_timeout=30, lock_timeout=300):
			# Re-check inside the lock: another worker may have rebuilt it already.
			if self._read_version(version_file) == current:
				return

			shutil.rmtree(self.path, ignore_errors=True)
			os.makedirs(self.path, exist_ok=True)
			self._write_version(version_file, current)

	def _open(self) -> "tantivy.Index":
		"""Open (or reuse) the on-disk index for this key."""

		return tantivy.Index(self._schema, path=self.path, reuse=True)

	def _to_tantivy_document(self, flat: dict) -> "tantivy.Document":
		"""Convert a flat field/value dict into a Tantivy document, skipping None values."""

		document = tantivy.Document()
		for field in self.FIELDS:
			value = flat.get(field.name)
			if value is None:
				continue

			if field.kind == "text":
				document.add_text(field.name, str(value))
			elif field.kind == "integer":
				document.add_integer(field.name, int(value))
			elif field.kind == "date":
				document.add_date(field.name, value)
			elif field.kind == "boolean":
				document.add_boolean(field.name, bool(value))

		return document

	def _to_hit(self, document: "tantivy.Document", score: float) -> dict:
		"""Build a search hit dict from a stored document, adding `_score` and `_id`."""

		hit = {name: document.get_first(name) for name in self._stored_fields}
		hit["_score"] = score
		hit["_id"] = hit.get(self.ID_FIELD)
		return hit

	def _schema_version(self) -> str:
		"""Short hash of the schema; changes whenever ID_FIELD or any FieldSpec changes."""

		spec = repr([(f.name, f.kind, f.stored, f.fast, f.tokenizer) for f in self.FIELDS])
		return hashlib.sha1(f"{self.ID_FIELD}|{spec}".encode()).hexdigest()[:16]
