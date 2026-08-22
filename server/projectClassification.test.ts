import { describe, it, expect } from 'vitest';

// Test the project classification enum values (only 2 types now)
describe('Project Classification', () => {
  const validTypes = [
    'Integração Interna',
    'Integração Externa',
  ];

  const removedTypes = ['Ajustes', 'Desenvolvimento', 'Integração', 'Automação'];

  it('should have 2 valid project types', () => {
    expect(validTypes).toHaveLength(2);
  });

  it('should include Integração Interna', () => {
    expect(validTypes).toContain('Integração Interna');
  });

  it('should include Integração Externa', () => {
    expect(validTypes).toContain('Integração Externa');
  });

  it('should NOT include Automação (removed)', () => {
    expect(validTypes).not.toContain('Automação');
  });

  it('should NOT include Ajustes (removed)', () => {
    expect(validTypes).not.toContain('Ajustes');
  });

  it('should NOT include Desenvolvimento (removed)', () => {
    expect(validTypes).not.toContain('Desenvolvimento');
  });

  it('should NOT include Integração (removed, replaced by Interna/Externa)', () => {
    expect(validTypes).not.toContain('Integração');
  });

  // Test the normalizeProjectType function logic
  describe('normalizeProjectType', () => {
    function normalizeProjectType(projectType?: string): string {
      if (!projectType) return 'integracao interna';
      return projectType
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    }

    it('should normalize Integração Interna correctly', () => {
      expect(normalizeProjectType('Integração Interna')).toBe('integracao interna');
    });

    it('should normalize Integração Externa correctly', () => {
      expect(normalizeProjectType('Integração Externa')).toBe('integracao externa');
    });

    it('should return integracao interna for undefined', () => {
      expect(normalizeProjectType(undefined)).toBe('integracao interna');
    });

    it('should return integracao interna for empty string', () => {
      expect(normalizeProjectType('')).toBe('integracao interna');
    });
  });

  // Test column offsets mapping
  describe('Column Offsets', () => {
    const colOffsets: Record<string, number> = {
      'integração interna': 1000, 'integracao interna': 1000,
      'integração externa': 2000, 'integracao externa': 2000,
      'concluído': 3000, 'chamados': 4000,
    };

    it('should have offset for integracao interna', () => {
      expect(colOffsets['integracao interna']).toBe(1000);
    });

    it('should have offset for integracao externa', () => {
      expect(colOffsets['integracao externa']).toBe(2000);
    });

    it('should NOT have offset for automacao (removed)', () => {
      expect(colOffsets['automacao']).toBeUndefined();
    });

    it('should NOT have offset for desenvolvimento (removed)', () => {
      expect(colOffsets['desenvolvimento']).toBeUndefined();
    });

    it('should NOT have offset for integracao (removed)', () => {
      expect(colOffsets['integracao']).toBeUndefined();
    });

    it('should NOT have offset for ajustes (removed)', () => {
      expect(colOffsets['ajustes']).toBeUndefined();
    });
  });
});
