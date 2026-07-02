import { RecallNote, Bucket, PickedNote } from './types';
import { daysSince } from './data';

function scoreInBucket(note: RecallNote, bucket: Bucket): number {
	const jitter = (Math.random() - 0.5) * 6;
	const d = daysSince(note.lastReviewed);

	if (bucket === 'recent') {
		return (6 - note.understandingRating) * 5 + jitter;
	}

	if (bucket === 'medium') {
		return d + jitter;
	}

	let s = d * 0.5;
	s += (6 - note.understandingRating) * 10;
	if (note.totalReviews === 0) s += 100;
	return s + jitter;
}

export function pickNotes(
	allNotes: RecallNote[],
	count: number,
	excludePaths: Set<string> = new Set(),
): PickedNote[] {
	const available = allNotes.filter((n) => !excludePaths.has(n.path));
	if (available.length === 0) return [];

	const sorted = [...available].sort(
		(a, b) => daysSince(a.lastReviewed) - daysSince(b.lastReviewed),
	);

	if (sorted.length <= count) {
		return sorted.map((note) => ({
			note,
			bucket: 'old' as const,
			score: scoreInBucket(note, 'old'),
		}));
	}

	const bucketSize = Math.max(
		1,
		Math.ceil(sorted.length / 3),
	);
	const buckets: { notes: RecallNote[]; bucket: Bucket }[] = [
		{ notes: sorted.slice(0, bucketSize), bucket: 'recent' },
		{ notes: sorted.slice(bucketSize, bucketSize * 2), bucket: 'medium' },
		{ notes: sorted.slice(bucketSize * 2), bucket: 'old' },
	];

	const result: PickedNote[] = [];

	for (const { notes, bucket } of buckets) {
		if (notes.length === 0) continue;

		const best = notes.reduce<{ note: RecallNote; score: number } | null>(
			(best, note) => {
				const noteScore = scoreInBucket(note, bucket);
				if (!best || noteScore > best.score) {
					return { note, score: noteScore };
				}
				return best;
			},
			null,
		);

		result.push({
			note: best!.note,
			bucket,
			score: best!.score,
		});
	}

	while (result.length < count && available.length > result.length) {
		const usedPaths = new Set(result.map((p) => p.note.path));
		const remaining = available.filter((n) => !usedPaths.has(n.path));
		if (remaining.length === 0) break;

		const pick = remaining.reduce<
			{ note: RecallNote; score: number } | null
		>(
			(best, note) => {
				const noteScore = scoreInBucket(note, 'old');
				if (!best || noteScore > best.score) {
					return { note, score: noteScore };
				}
				return best;
			},
			null,
		);

		result.push({
			note: pick!.note,
			bucket: 'old',
			score: pick!.score,
		});
	}

	return result;
}

export function refreshNote(
	allNotes: RecallNote[],
	currentPicked: PickedNote[],
	index: number,
): PickedNote | null {
	if (index < 0 || index >= currentPicked.length) return null;

	const bucket = currentPicked[index]!.bucket;
	const excludePaths = new Set(currentPicked.map((p) => p.note.path));

	const available = allNotes.filter(
		(n) =>
			!excludePaths.has(n.path) &&
			daysSince(n.lastReviewed) >= 0,
	);

	if (available.length === 0) return null;

	const sorted = [...available].sort(
		(a, b) => daysSince(a.lastReviewed) - daysSince(b.lastReviewed),
	);

	const bucketSize = Math.max(1, Math.ceil(sorted.length / 3));
	let bucketNotes: RecallNote[];

	if (bucket === 'recent') {
		bucketNotes = sorted.slice(0, bucketSize);
	} else if (bucket === 'medium') {
		bucketNotes = sorted.slice(bucketSize, bucketSize * 2);
	} else {
		bucketNotes = sorted.slice(bucketSize * 2);
	}

	if (bucketNotes.length === 0) {
		bucketNotes = sorted;
	}

	const best = bucketNotes.reduce<{ note: RecallNote; score: number } | null>(
		(best, note) => {
			const noteScore = scoreInBucket(note, bucket);
			if (!best || noteScore > best.score) {
				return { note, score: noteScore };
			}
			return best;
		},
		null,
	);

	return {
		note: best!.note,
		bucket,
		score: best!.score,
	};
}
