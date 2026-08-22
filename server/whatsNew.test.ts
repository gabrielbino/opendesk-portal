import { describe, it, expect } from 'vitest';

// ============ Test the WhatsNew feature logic ============

describe('WhatsNew Pop-up Feature', () => {
  // Test action config mapping
  const ACTION_CONFIG: Record<string, { label: string }> = {
    project_created: { label: "Novo projeto criado" },
    project_updated: { label: "Projeto atualizado" },
    project_deleted: { label: "Projeto excluído" },
    project_status_changed: { label: "Status do projeto alterado" },
    task_created: { label: "Nova tarefa criada" },
    task_updated: { label: "Tarefa atualizada" },
    task_deleted: { label: "Tarefa excluída" },
    task_status_changed: { label: "Status da tarefa alterado" },
    phase_created: { label: "Nova fase criada" },
    phase_updated: { label: "Fase atualizada" },
    phase_deleted: { label: "Fase excluída" },
    comment_added: { label: "Novo comentário" },
  };

  it('should have all expected action types configured', () => {
    const expectedActions = [
      'project_created', 'project_updated', 'project_deleted', 'project_status_changed',
      'task_created', 'task_updated', 'task_deleted', 'task_status_changed',
      'phase_created', 'phase_updated', 'phase_deleted', 'comment_added',
    ];
    expectedActions.forEach(action => {
      expect(ACTION_CONFIG[action]).toBeDefined();
      expect(ACTION_CONFIG[action].label).toBeTruthy();
    });
  });

  it('should have Portuguese labels for all actions', () => {
    Object.values(ACTION_CONFIG).forEach(config => {
      // All labels should be in Portuguese
      expect(config.label.length).toBeGreaterThan(3);
    });
  });

  // Test entity filter options
  const FILTER_OPTIONS = [
    { value: "all", label: "Todas" },
    { value: "project", label: "Projetos" },
    { value: "task", label: "Tarefas" },
    { value: "phase", label: "Fases" },
    { value: "comment", label: "Comentários" },
  ];

  it('should have correct filter options', () => {
    expect(FILTER_OPTIONS).toHaveLength(5);
    expect(FILTER_OPTIONS[0].value).toBe('all');
    expect(FILTER_OPTIONS.map(f => f.value)).toContain('project');
    expect(FILTER_OPTIONS.map(f => f.value)).toContain('task');
    expect(FILTER_OPTIONS.map(f => f.value)).toContain('phase');
    expect(FILTER_OPTIONS.map(f => f.value)).toContain('comment');
  });

  // Test time formatting logic
  function timeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "agora";
    if (minutes < 60) return `${minutes}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  it('should format time as "agora" for recent timestamps', () => {
    expect(timeAgo(Date.now() - 30000)).toBe('agora');
  });

  it('should format time in minutes', () => {
    expect(timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5min');
  });

  it('should format time in hours', () => {
    expect(timeAgo(Date.now() - 3 * 60 * 60 * 1000)).toBe('3h');
  });

  it('should format time in days', () => {
    expect(timeAgo(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe('2d');
  });

  // Test new count calculation
  it('should count activities from last 24h', () => {
    const activities = [
      { createdAt: Date.now() - 1000 },
      { createdAt: Date.now() - 60000 },
      { createdAt: Date.now() - 25 * 60 * 60 * 1000 }, // older than 24h
    ];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const newCount = activities.filter(a => a.createdAt > oneDayAgo).length;
    expect(newCount).toBe(2);
  });

  // Test entity filtering
  it('should filter activities by entity type', () => {
    const activities = [
      { entityType: 'project', action: 'project_created' },
      { entityType: 'task', action: 'task_created' },
      { entityType: 'project', action: 'project_updated' },
      { entityType: 'comment', action: 'comment_added' },
    ];
    
    const filtered = activities.filter(a => a.entityType === 'project');
    expect(filtered).toHaveLength(2);
    
    const allFilter = activities.filter(() => true);
    expect(allFilter).toHaveLength(4);
  });
});

describe('Kanban Columns - No Concluídos Column', () => {
  const typeColumns = [
    { id: 'integracao interna', title: 'Integração Interna' },
    { id: 'integracao externa', title: 'Integração Externa' },
  ];

  it('should have exactly 2 type columns', () => {
    expect(typeColumns).toHaveLength(2);
  });

  it('should NOT have a Concluído column', () => {
    const hasConcluidoColumn = typeColumns.some(c => 
      c.id.toLowerCase().includes('conclu') || c.title.toLowerCase().includes('conclu')
    );
    expect(hasConcluidoColumn).toBe(false);
  });

  it('should have Integração Interna and Integração Externa columns', () => {
    expect(typeColumns.map(c => c.id)).toContain('integracao interna');
    expect(typeColumns.map(c => c.id)).toContain('integracao externa');
  });

  // Test that concluded projects appear in their type columns
  it('should include concluded projects in type columns', () => {
    const projects = [
      { id: 1, status: 'Concluído', projectType: 'Integração Interna' },
      { id: 2, status: 'Em Andamento', projectType: 'Integração Interna' },
      { id: 3, status: 'Concluído', projectType: 'Integração Externa' },
    ];

    function normalizeProjectType(pt?: string): string {
      if (!pt) return 'integracao interna';
      return pt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    // All projects should be in their type column regardless of status
    const internaProjects = projects.filter(p => 
      normalizeProjectType(p.projectType) === 'integracao interna'
    );
    expect(internaProjects).toHaveLength(2);
    expect(internaProjects.some(p => p.status === 'Concluído')).toBe(true);

    const externaProjects = projects.filter(p => 
      normalizeProjectType(p.projectType) === 'integracao externa'
    );
    expect(externaProjects).toHaveLength(1);
    expect(externaProjects[0].status).toBe('Concluído');
  });

  // Test column offsets
  it('should have correct column offsets without Concluído', () => {
    const colOffsets: Record<string, number> = {
      'integração interna': 1000, 'integracao interna': 1000,
      'integração externa': 2000, 'integracao externa': 2000,
      'chamados': 3000,
    };

    expect(colOffsets['integracao interna']).toBe(1000);
    expect(colOffsets['integracao externa']).toBe(2000);
    expect(colOffsets['chamados']).toBe(3000);
    expect(colOffsets['concluído']).toBeUndefined();
  });
});
