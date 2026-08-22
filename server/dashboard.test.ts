import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';

describe('Dashboard Metrics', () => {
  beforeAll(async () => {
    // Ensure database is available
    const database = await db.getDb();
    expect(database).toBeDefined();
  });

  it('should return dashboard metrics object with required fields', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(metrics).toBeDefined();
    expect(metrics).toHaveProperty('statusCounts');
    expect(metrics).toHaveProperty('categoryCounts');
    expect(metrics).toHaveProperty('priorityCounts');
    expect(metrics).toHaveProperty('responseTime');
    expect(metrics).toHaveProperty('totalTickets');
    expect(metrics).toHaveProperty('recentTickets');
    expect(metrics).toHaveProperty('monthlyTickets');
    expect(metrics).toHaveProperty('dailyTrend');
    expect(metrics).toHaveProperty('avgResolutionByCategory');
    expect(metrics).toHaveProperty('departmentCounts');
  });

  it('should have valid status counts array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.statusCounts)).toBe(true);
    metrics.statusCounts.forEach(item => {
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('count');
      expect(typeof item.status).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have valid category counts array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.categoryCounts)).toBe(true);
    metrics.categoryCounts.forEach(item => {
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('count');
      expect(typeof item.category).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have valid priority counts array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.priorityCounts)).toBe(true);
    metrics.priorityCounts.forEach(item => {
      expect(item).toHaveProperty('priority');
      expect(item).toHaveProperty('count');
      expect(typeof item.priority).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have valid response time metrics', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(metrics.responseTime).toBeDefined();
    expect(metrics.responseTime).toHaveProperty('average');
    expect(metrics.responseTime).toHaveProperty('min');
    expect(metrics.responseTime).toHaveProperty('max');
    expect(metrics.responseTime).toHaveProperty('median');
    
    expect(typeof metrics.responseTime.average).toBe('number');
    expect(typeof metrics.responseTime.min).toBe('number');
    expect(typeof metrics.responseTime.max).toBe('number');
    expect(typeof metrics.responseTime.median).toBe('number');
    
    expect(metrics.responseTime.average).toBeGreaterThanOrEqual(0);
    expect(metrics.responseTime.min).toBeGreaterThanOrEqual(0);
    expect(metrics.responseTime.max).toBeGreaterThanOrEqual(0);
    expect(metrics.responseTime.median).toBeGreaterThanOrEqual(0);
  });

  it('should have valid ticket count metrics', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(typeof metrics.totalTickets).toBe('number');
    expect(typeof metrics.recentTickets).toBe('number');
    expect(typeof metrics.monthlyTickets).toBe('number');
    
    expect(metrics.totalTickets).toBeGreaterThanOrEqual(0);
    expect(metrics.recentTickets).toBeGreaterThanOrEqual(0);
    expect(metrics.monthlyTickets).toBeGreaterThanOrEqual(0);
    
    // Recent tickets should be less than or equal to monthly tickets
    expect(metrics.recentTickets).toBeLessThanOrEqual(metrics.monthlyTickets);
    // Monthly tickets should be less than or equal to total tickets
    expect(metrics.monthlyTickets).toBeLessThanOrEqual(metrics.totalTickets);
  });

  it('should have valid daily trend array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.dailyTrend)).toBe(true);
    expect(metrics.dailyTrend.length).toBe(30); // Last 30 days
    
    metrics.dailyTrend.forEach(item => {
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('opened');
      expect(item).toHaveProperty('closed');
      
      // Validate date format (YYYY-MM-DD)
      expect(/^\d{4}-\d{2}-\d{2}$/.test(item.date)).toBe(true);
      
      expect(typeof item.opened).toBe('number');
      expect(typeof item.closed).toBe('number');
      expect(item.opened).toBeGreaterThanOrEqual(0);
      expect(item.closed).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have valid resolution by category array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.avgResolutionByCategory)).toBe(true);
    
    metrics.avgResolutionByCategory.forEach(item => {
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('avgHours');
      expect(item).toHaveProperty('count');
      
      expect(typeof item.category).toBe('string');
      expect(typeof item.avgHours).toBe('number');
      expect(typeof item.count).toBe('number');
      
      expect(item.avgHours).toBeGreaterThanOrEqual(0);
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have valid department counts array', async () => {
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(Array.isArray(metrics.departmentCounts)).toBe(true);
    
    metrics.departmentCounts.forEach(item => {
      expect(item).toHaveProperty('departmentId');
      expect(item).toHaveProperty('departmentName');
      expect(item).toHaveProperty('count');
      
      expect(typeof item.departmentName).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle empty database gracefully', async () => {
    // This test just ensures the function doesn't crash
    const metrics = await db.getTicketDashboardMetrics();
    
    expect(metrics).toBeDefined();
    expect(Array.isArray(metrics.statusCounts)).toBe(true);
    expect(Array.isArray(metrics.categoryCounts)).toBe(true);
    expect(Array.isArray(metrics.priorityCounts)).toBe(true);
    expect(Array.isArray(metrics.dailyTrend)).toBe(true);
    expect(Array.isArray(metrics.avgResolutionByCategory)).toBe(true);
    expect(Array.isArray(metrics.departmentCounts)).toBe(true);
  });
});
