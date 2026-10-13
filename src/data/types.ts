/** Calendar date in YYYY-MM-DD form; validated at data boundaries. */
export type DateKey = string;

export interface Repository {
  id: string;
  name: string;
  url: string;
  color: string;
  /** Attributed commits within this city's date range. */
  commitCount: number;
}

export type DaySegment =
  | { kind: 'repository'; repoId: string; count: number }
  | { kind: 'other'; count: number };

export interface ContributionDay {
  date: DateKey;
  /** Authoritative daily total, independent of repository attribution. */
  contributionCount: number;
  /** Repository segments in overall commit order; Other activity is last. */
  segments: DaySegment[];
}

export interface CityWarning {
  code: 'demo-data' | 'incomplete-attribution' | 'rate-limited';
  message: string;
}

export interface CityMetadata {
  source: 'demo' | 'github';
  username: string | null;
  startDate: DateKey;
  endDate: DateKey;
  dayCount: 365;
  timezone: 'UTC';
  /** Null for real GitHub data. Never used for a credential. */
  seed: string | null;
  totalContributions: number;
  totalAttributedCommits: number;
  otherActivityCount: number;
}

export interface CityData {
  days: ContributionDay[];
  repositories: Repository[];
  warnings: CityWarning[];
  metadata: CityMetadata;
}
