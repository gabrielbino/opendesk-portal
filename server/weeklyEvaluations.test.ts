import { describe, it, expect } from 'vitest';

// ─── Helpers replicating the logic from TicketEvaluations.tsx ────────────────

type RawRow = {
  yearWeek: string;
  weekStart: string;
  sector: string | null;
  averageRating: number;
  totalEvaluations: number;
};

type SectorEntry = { sector: string | null; averageRating: number; totalEvaluations: number };

type WeekGroup = {
  yearWeek: string;
  weekStart: string;
  sectors: SectorEntry[];
  weekAverage: number;
  weekTotal: number;
};

function groupByWeek(rawData: RawRow[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();

  for (const row of rawData) {
    const key = row.yearWeek;
    if (!map.has(key)) {
      map.set(key, {
        yearWeek: row.yearWeek,
        weekStart: row.weekStart,
        sectors: [],
        weekAverage: 0,
        weekTotal: 0,
      });
    }
    const group = map.get(key)!;
    group.sectors.push({
      sector: row.sector,
      averageRating: Number(row.averageRating),
      totalEvaluations: Number(row.totalEvaluations),
    });
  }

  map.forEach((group) => {
    const totalEvals = group.sectors.reduce((s: number, r: SectorEntry) => s + r.totalEvaluations, 0);
    const weightedSum = group.sectors.reduce((s: number, r: SectorEntry) => s + r.averageRating * r.totalEvaluations, 0);
    group.weekTotal = totalEvals;
    group.weekAverage = totalEvals > 0 ? weightedSum / totalEvals : 0;
  });

  return Array.from(map.values()).sort((a, b) => b.yearWeek.localeCompare(a.yearWeek));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Weekly Evaluations Grouping', () => {
  describe('groupByWeek()', () => {
    it('returns empty array for empty input', () => {
      expect(groupByWeek([])).toEqual([]);
    });

    it('groups rows from the same week together', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 2 },
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'RH', averageRating: 4, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result).toHaveLength(1);
      expect(result[0].sectors).toHaveLength(2);
    });

    it('keeps rows from different weeks in separate groups', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 1 },
        { yearWeek: '202602', weekStart: '2026-01-12', sector: 'TI', averageRating: 4, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result).toHaveLength(2);
    });

    it('sorts weeks in descending order (most recent first)', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 1 },
        { yearWeek: '202603', weekStart: '2026-01-19', sector: 'TI', averageRating: 4, totalEvaluations: 1 },
        { yearWeek: '202602', weekStart: '2026-01-12', sector: 'TI', averageRating: 3, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].yearWeek).toBe('202603');
      expect(result[1].yearWeek).toBe('202602');
      expect(result[2].yearWeek).toBe('202601');
    });
  });

  describe('weekTotal calculation', () => {
    it('sums totalEvaluations across all sectors in a week', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 3 },
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'RH', averageRating: 4, totalEvaluations: 2 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekTotal).toBe(5);
    });

    it('handles single sector week', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 4, totalEvaluations: 7 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekTotal).toBe(7);
    });
  });

  describe('weekAverage calculation (weighted)', () => {
    it('computes weighted average across sectors', () => {
      // TI: avg=5, count=2 → contributes 10
      // RH: avg=3, count=2 → contributes 6
      // Total = 4 evals, weighted sum = 16, average = 4.0
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 2 },
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'RH', averageRating: 3, totalEvaluations: 2 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekAverage).toBeCloseTo(4.0);
    });

    it('returns 0 for week with no evaluations', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 0, totalEvaluations: 0 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekAverage).toBe(0);
    });

    it('handles single sector with single evaluation', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekAverage).toBe(5);
    });

    it('gives higher weight to sectors with more evaluations', () => {
      // TI: avg=5, count=9 → contributes 45
      // RH: avg=1, count=1 → contributes 1
      // Total = 10, weighted sum = 46, average = 4.6
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'TI', averageRating: 5, totalEvaluations: 9 },
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'RH', averageRating: 1, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].weekAverage).toBeCloseTo(4.6);
    });
  });

  describe('sector handling', () => {
    it('handles null sector gracefully', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: null, averageRating: 4, totalEvaluations: 1 },
      ];
      const result = groupByWeek(rows);
      expect(result[0].sectors[0].sector).toBeNull();
    });

    it('preserves sector names correctly', () => {
      const rows: RawRow[] = [
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'Financeiro', averageRating: 4, totalEvaluations: 1 },
        { yearWeek: '202601', weekStart: '2026-01-05', sector: 'Comercial', averageRating: 5, totalEvaluations: 2 },
      ];
      const result = groupByWeek(rows);
      const sectorNames = result[0].sectors.map(s => s.sector);
      expect(sectorNames).toContain('Financeiro');
      expect(sectorNames).toContain('Comercial');
    });
  });
});

describe('Rating Color Logic', () => {
  function getRatingColor(value: number): string {
    if (value >= 4) return 'emerald';
    if (value >= 3) return 'amber';
    return 'red';
  }

  it('returns emerald for ratings 4 and 5', () => {
    expect(getRatingColor(4)).toBe('emerald');
    expect(getRatingColor(5)).toBe('emerald');
    expect(getRatingColor(4.5)).toBe('emerald');
  });

  it('returns amber for rating 3', () => {
    expect(getRatingColor(3)).toBe('amber');
    expect(getRatingColor(3.9)).toBe('amber');
  });

  it('returns red for ratings 1 and 2', () => {
    expect(getRatingColor(1)).toBe('red');
    expect(getRatingColor(2)).toBe('red');
    expect(getRatingColor(2.9)).toBe('red');
  });
});
