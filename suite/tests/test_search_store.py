# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""``SearchStore``'s two search contracts: an unbounded fetch returns every match, reading the index
once so its own count still describes what it fetched, and the deprecated ``search_phrase_prefix``
still searches for a phrase rather than quietly becoming the looser search that replaced it."""

import unittest
from unittest import mock

import tantivy

from suite.store.search_store import UNBOUNDED_FETCH_PAGE, SearchStore


class FakeResult:
    """Stands in for Tantivy's search result: a page of hits, and how many there are in total."""

    def __init__(self, hits, count):
        self.hits = hits
        self.count = count


class FakeSearcher:
    """A fixed set of matches, paged out the way Tantivy pages them, recording each limit asked for.

    Like a real searcher it is a snapshot: `matches` is whatever it was made with, so a test can
    change what the index holds without this seeing it.
    """

    def __init__(self, matches):
        self.matches = matches
        self.limits = []

    def search(self, _query, limit, offset=0, count=True, order_by_field=None):
        self.limits.append(limit)
        return FakeResult(self.matches[offset : offset + limit], len(self.matches))

    def doc(self, address):
        return address


class UnboundedFetch(unittest.TestCase):
    """``_run_search(limit=None)`` — every match, from one reading of the index."""

    def search(self, matches, limit=None, offset=0):
        """Run a search over `matches`; returns its hits and the searcher that served them."""

        searcher = FakeSearcher(matches)
        index = mock.Mock()
        index.searcher.return_value = searcher

        store = mock.Mock(spec=SearchStore)
        store.path = "/nonexistent/index"
        store._open.return_value = index
        store._to_hit.side_effect = lambda document, _score: document

        with mock.patch.object(tantivy, "Index") as tantivy_index:
            tantivy_index.exists.return_value = True
            hits, count = SearchStore._run_search(store, lambda _index: "query", limit, offset, None)

        self.assertEqual(count, len(matches))
        return hits, searcher, index

    def test_a_page_that_came_back_short_is_refetched_at_the_full_count(self):
        hits, searcher, _index = self.search([(1.0, n) for n in range(6000)])

        self.assertEqual(searcher.limits, [UNBOUNDED_FETCH_PAGE, 6000])
        self.assertEqual(len(hits), 6000)

    def test_the_refetch_reads_the_searcher_that_reported_the_count(self):
        # The whole point of doing this here rather than by calling search twice: a second reading
        # of the index could have grown, leaving the fetch short of its own count — the truncation
        # an unbounded fetch exists to avoid.
        _hits, _searcher, index = self.search([(1.0, n) for n in range(6000)])

        self.assertEqual(index.searcher.call_count, 1)
        self.assertEqual(index.reload.call_count, 1)

    def test_a_match_set_the_first_page_holds_is_fetched_once(self):
        hits, searcher, _index = self.search([(1.0, n) for n in range(10)])

        self.assertEqual(searcher.limits, [UNBOUNDED_FETCH_PAGE])
        self.assertEqual(len(hits), 10)

    def test_only_what_is_left_past_an_offset_has_to_fit_the_page(self):
        hits, searcher, _index = self.search([(1.0, n) for n in range(6000)], offset=5999)

        self.assertEqual(searcher.limits, [UNBOUNDED_FETCH_PAGE])
        self.assertEqual(len(hits), 1)

    def test_a_bounded_search_is_left_at_the_limit_it_was_given(self):
        hits, searcher, _index = self.search([(1.0, n) for n in range(6000)], limit=20)

        self.assertEqual(searcher.limits, [20])
        self.assertEqual(len(hits), 20)


class SearchPhrasePrefix(unittest.TestCase):
    """``search_phrase_prefix`` — the pre-rename name, still searching for a phrase, still deprecated."""

    def search(self, terms, **kwargs):
        """Return the Tantivy query the deprecated search would run."""

        schema_builder = tantivy.SchemaBuilder()
        schema_builder.add_text_field("text")

        store = mock.Mock(spec=SearchStore)
        store._schema = schema_builder.build()
        store.DEFAULT_SEARCH_FIELDS = ("text",)
        store._build_phrase_prefix_query.side_effect = lambda t, f: SearchStore._build_phrase_prefix_query(
            store, t, f
        )
        store._run_search.side_effect = lambda build_query, *_args: (build_query(None), 0)

        with self.assertWarns(Warning):
            query, _count = SearchStore.search_phrase_prefix(store, terms, **kwargs)

        return query

    def test_terms_are_searched_for_as_a_phrase_not_scattered(self):
        # The contract the name promises, and the reason this isn't a forward to search_prefix:
        # a phrase query matches "Jane Doe" but not "Jane Ann Doe" or "Doe Jane".
        self.assertIn("PhrasePrefixQuery", repr(self.search(["jane", "d"])))

    def test_blank_terms_search_for_nothing(self):
        store = mock.Mock(spec=SearchStore)

        with self.assertWarns(Warning):
            self.assertEqual(SearchStore.search_phrase_prefix(store, ["", None]), ([], 0))

        store._run_search.assert_not_called()


if __name__ == "__main__":
    unittest.main()
