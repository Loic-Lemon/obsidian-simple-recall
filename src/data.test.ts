import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({
	normalizePath: (p: string) => p,
	Notice: class {
		constructor(_msg: string) { /* noop */ }
	},
	App: class {},
}));

import { historyRow } from './data';
import type { RecallNote } from './types';

function makeNote(overrides: Partial<RecallNote> = {}): RecallNote {
	return {
		path: 'Notes/test.md',
		title: 'Test',
		tags: ['test'],
		noteType: 'note',
		createdAt: '2026-01-01',
		lastReviewed: '2026-07-01T10:00:00.000Z',
		totalReviews: 3,
		understandingRating: 4,
		...overrides,
	};
}

describe('historyRow', () => {
	it('produces an ISO 8601 datetime string as the first column', () => {
		const row = historyRow(makeNote(), 4);
		expect(row[0]).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		);
	});

	it('includes seconds-level precision in the timestamp', () => {
		const row = historyRow(makeNote(), 4);
		const iso = row[0]!;
		const date = new Date(iso);
		expect(date.getTime()).not.toBeNaN();
	});

	it('preserves path, title, rating, daysSinceReview, totalReviews', () => {
		const note = makeNote({
			path: 'Notes/foo.md',
			title: 'Foo Note',
			totalReviews: 5,
		});
		const row = historyRow(note, 3);
		expect(row[1]).toBe('Notes/foo.md');
		expect(row[2]).toBe('Foo Note');
		expect(row[3]).toBe('3');
		expect(row[5]).toBe('5');
	});
});

describe('CSV sort — descending by date column', () => {
	function buildRows(dates: string[]) {
		return dates.map((date) => ({
			date,
			path: '',
			title: '',
			rating: 3,
			daysSinceReview: null,
			totalReviews: 1,
		}));
	}

	it('sorts ISO datetime rows newest-first', () => {
		const rows = buildRows([
			'2026-07-02T09:00:00.000Z',
			'2026-07-02T15:00:00.000Z',
			'2026-07-01T12:00:00.000Z',
		]);
		rows.sort((a, b) => b.date.localeCompare(a.date));
		expect(rows[0]!.date).toBe('2026-07-02T15:00:00.000Z');
		expect(rows[1]!.date).toBe('2026-07-02T09:00:00.000Z');
		expect(rows[2]!.date).toBe('2026-07-01T12:00:00.000Z');
	});

	it('sorts old YYYY-MM-DD before ISO entries from the same day (shorter string sorts first in descending order)', () => {
		const rows = buildRows([
			'2026-07-02',
			'2026-07-02T15:30:00.000Z',
		]);
		rows.sort((a, b) => b.date.localeCompare(a.date));
		expect(rows[0]!.date).toBe('2026-07-02T15:30:00.000Z');
		expect(rows[1]!.date).toBe('2026-07-02');
	});

	it('handles mixed old/new formats across multiple days', () => {
		const rows = buildRows([
			'2026-07-01',
			'2026-07-02T15:30:00.000Z',
			'2026-06-30T10:00:00.000Z',
			'2026-07-02T09:00:00.000Z',
		]);
		rows.sort((a, b) => b.date.localeCompare(a.date));
		expect(rows[0]!.date).toBe('2026-07-02T15:30:00.000Z');
		expect(rows[1]!.date).toBe('2026-07-02T09:00:00.000Z');
		expect(rows[2]!.date).toBe('2026-07-01');
		expect(rows[3]!.date).toBe('2026-06-30T10:00:00.000Z');
	});
});
