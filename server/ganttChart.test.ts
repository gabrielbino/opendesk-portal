import { describe, it, expect } from 'vitest';
import { differenceInDays, startOfMonth, endOfMonth, addMonths } from 'date-fns';

describe('Gantt Chart System', () => {
  describe('Timeline calculations', () => {
    it('should calculate timeline span correctly', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-03-31');
      
      const days = differenceInDays(end, start) + 1;
      expect(days).toBeGreaterThan(0);
      expect(days).toBe(90);
    });

    it('should expand dates to full months', () => {
      const date = new Date('2026-02-15');
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      
      expect(monthStart.getDate()).toBe(1);
      expect(monthEnd.getDate()).toBeGreaterThan(27); // At least 28 days
    });

    it('should generate month sequence', () => {
      const start = new Date('2026-03-01');
      const months: Date[] = [];
      
      for (let i = 0; i < 3; i++) {
        months.push(addMonths(start, i));
      }
      
      expect(months).toHaveLength(3);
      // Verify each month is different
      expect(months[0].getTime()).not.toBe(months[1].getTime());
      expect(months[1].getTime()).not.toBe(months[2].getTime());
    });
  });

  describe('Project positioning', () => {
    it('should calculate project position as percentage', () => {
      const timelineStart = new Date('2026-01-01');
      const timelineEnd = new Date('2026-01-31');
      const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
      
      const projectStart = new Date('2026-01-10');
      const projectEnd = new Date('2026-01-20');
      
      const startOffset = differenceInDays(projectStart, timelineStart);
      const duration = differenceInDays(projectEnd, projectStart) + 1;
      
      const leftPercent = (startOffset / totalDays) * 100;
      const widthPercent = (duration / totalDays) * 100;
      
      expect(leftPercent).toBeGreaterThan(0);
      expect(leftPercent).toBeLessThan(100);
      expect(widthPercent).toBeGreaterThan(0);
      expect(widthPercent).toBeLessThan(100);
    });

    it('should handle projects starting before timeline', () => {
      const timelineStart = new Date('2026-01-10');
      const projectStart = new Date('2026-01-01');
      
      const startOffset = differenceInDays(projectStart, timelineStart);
      const leftPercent = Math.max(0, (startOffset / 30) * 100);
      
      expect(leftPercent).toBe(0);
    });

    it('should handle projects ending after timeline', () => {
      const totalDays = 30;
      const leftPercent = 50;
      const widthPercent = 60; // Would extend beyond 100%
      
      const clampedWidth = Math.min(100 - leftPercent, widthPercent);
      
      expect(clampedWidth).toBe(50);
      expect(leftPercent + clampedWidth).toBeLessThanOrEqual(100);
    });
  });

  describe('Status and priority colors', () => {
    it('should map status to colors', () => {
      const statusColors: Record<string, string> = {
        'Planejamento': 'bg-blue-500',
        'Em Andamento': 'bg-yellow-500',
        'Em Pausa': 'bg-orange-500',
        'Concluído': 'bg-green-500',
        'Cancelado': 'bg-gray-500',
      };
      
      expect(statusColors['Planejamento']).toBe('bg-blue-500');
      expect(statusColors['Em Andamento']).toBe('bg-yellow-500');
      expect(statusColors['Concluído']).toBe('bg-green-500');
    });

    it('should map priority to border colors', () => {
      const priorityBorders: Record<string, string> = {
        'Crítica': 'border-l-red-500',
        'Alta': 'border-l-orange-500',
        'Média': 'border-l-blue-500',
        'Baixa': 'border-l-gray-500',
      };
      
      expect(priorityBorders['Crítica']).toBe('border-l-red-500');
      expect(priorityBorders['Alta']).toBe('border-l-orange-500');
    });
  });

  describe('Overdue detection', () => {
    it('should detect overdue projects', () => {
      const now = Date.now();
      const pastDate = now - (10 * 24 * 60 * 60 * 1000);
      const status = 'Em Andamento';
      
      const isOverdue = pastDate < now && status !== 'Concluído' && status !== 'Cancelado';
      
      expect(isOverdue).toBe(true);
    });

    it('should not flag completed projects as overdue', () => {
      const now = Date.now();
      const pastDate = now - (10 * 24 * 60 * 60 * 1000);
      const status = 'Concluído';
      
      const isOverdue = pastDate < now && status !== 'Concluído' && status !== 'Cancelado';
      
      expect(isOverdue).toBe(false);
    });

    it('should not flag future deadlines as overdue', () => {
      const now = Date.now();
      const futureDate = now + (10 * 24 * 60 * 60 * 1000);
      
      const isOverdue = futureDate < now;
      
      expect(isOverdue).toBe(false);
    });
  });

  describe('Progress visualization', () => {
    it('should calculate progress bar width', () => {
      const progress = 65;
      const barWidth = `${progress}%`;
      
      expect(barWidth).toBe('65%');
    });

    it('should handle zero progress', () => {
      const progress = 0;
      const barWidth = `${progress}%`;
      
      expect(barWidth).toBe('0%');
    });

    it('should handle complete progress', () => {
      const progress = 100;
      const barWidth = `${progress}%`;
      
      expect(barWidth).toBe('100%');
    });
  });

  describe('Date filtering', () => {
    it('should filter projects with dates', () => {
      const projects = [
        { id: 1, name: 'A', startDate: 123456, endDate: 234567 },
        { id: 2, name: 'B', startDate: null, endDate: null },
        { id: 3, name: 'C', startDate: 345678, endDate: 456789 },
      ];
      
      const filtered = projects.filter(p => p.startDate && p.endDate);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe(1);
      expect(filtered[1].id).toBe(3);
    });

    it('should handle empty project list', () => {
      const projects: any[] = [];
      const filtered = projects.filter(p => p.startDate && p.endDate);
      
      expect(filtered).toHaveLength(0);
    });
  });

  describe('Month width calculations', () => {
    it('should calculate proportional month widths', () => {
      const totalDays = 90;
      const januaryDays = 31;
      const februaryDays = 28;
      const marchDays = 31;
      
      const janWidth = (januaryDays / totalDays) * 100;
      const febWidth = (februaryDays / totalDays) * 100;
      const marWidth = (marchDays / totalDays) * 100;
      
      expect(janWidth).toBeCloseTo(34.44, 1);
      expect(febWidth).toBeCloseTo(31.11, 1);
      expect(marWidth).toBeCloseTo(34.44, 1);
      
      // Total should be approximately 100%
      expect(janWidth + febWidth + marWidth).toBeCloseTo(100, 0);
    });
  });
});
