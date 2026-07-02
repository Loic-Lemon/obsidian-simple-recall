export interface RecallNote {
	path: string;
	title: string;
	tags: string[];
	noteType: string;
	createdAt: string;
	lastReviewed: string;
	totalReviews: number;
	understandingRating: number;
}

export type Bucket = 'recent' | 'medium' | 'old';

export interface PickedNote {
	note: RecallNote;
	bucket: Bucket;
	score: number;
}

export interface ReviewSession {
	picked: PickedNote[];
	reviewed: Set<string>;
	startedAt: number;
}

export interface HistoryRow {
	date: string;
	path: string;
	title: string;
	rating: number;
	daysSinceReview: number | null;
	totalReviews: number;
}

export interface SimpleRecallSettings {
	targetFolders: string[];
	notesPerSession: number;
	includeSubfolders: boolean;
	trackingCsvPath: string;
	historyCsvPath: string;
	autoScanOnStartup: boolean;
}

export const DEFAULT_SETTINGS: SimpleRecallSettings = {
	targetFolders: ['Notes/'],
	notesPerSession: 3,
	includeSubfolders: true,
	trackingCsvPath: 'simple-recall.csv',
	historyCsvPath: 'simple-recall-history.csv',
	autoScanOnStartup: true,
};
