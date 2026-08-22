import { describe, it, expect } from "vitest";

// Test gamification point calculation
describe("Gamification Points System", () => {
  const POINTS_MAP: Record<string, number> = {
    "Facil": 5,
    "Normal": 10,
    "Dificil": 20,
    "Muito Dificil": 40,
  };

  it("should award correct points for easy tasks", () => {
    expect(POINTS_MAP["Facil"]).toBe(5);
  });

  it("should award correct points for normal tasks", () => {
    expect(POINTS_MAP["Normal"]).toBe(10);
  });

  it("should award correct points for hard tasks", () => {
    expect(POINTS_MAP["Dificil"]).toBe(20);
  });

  it("should award correct points for very hard tasks", () => {
    expect(POINTS_MAP["Muito Dificil"]).toBe(40);
  });

  it("should have 4 difficulty levels", () => {
    expect(Object.keys(POINTS_MAP)).toHaveLength(4);
  });
});

// Test level calculation
describe("Level Calculation", () => {
  function calculateLevel(totalPoints: number): number {
    if (totalPoints < 50) return 1;
    if (totalPoints < 150) return 2;
    if (totalPoints < 300) return 3;
    if (totalPoints < 500) return 4;
    if (totalPoints < 800) return 5;
    if (totalPoints < 1200) return 6;
    if (totalPoints < 1800) return 7;
    if (totalPoints < 2500) return 8;
    if (totalPoints < 3500) return 9;
    return 10;
  }

  it("should start at level 1 with 0 points", () => {
    expect(calculateLevel(0)).toBe(1);
  });

  it("should be level 2 at 50 points", () => {
    expect(calculateLevel(50)).toBe(2);
  });

  it("should be level 3 at 150 points", () => {
    expect(calculateLevel(150)).toBe(3);
  });

  it("should be level 5 at 500 points", () => {
    expect(calculateLevel(500)).toBe(5);
  });

  it("should be level 10 at 3500+ points", () => {
    expect(calculateLevel(3500)).toBe(10);
    expect(calculateLevel(10000)).toBe(10);
  });

  it("should not exceed level 10", () => {
    expect(calculateLevel(999999)).toBe(10);
  });
});

// Test streak calculation
describe("Streak System", () => {
  function isConsecutiveDay(lastDate: Date, currentDate: Date): boolean {
    const diffMs = currentDate.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays === 1;
  }

  function isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  it("should detect consecutive days", () => {
    const day1 = new Date("2026-02-22");
    const day2 = new Date("2026-02-23");
    expect(isConsecutiveDay(day1, day2)).toBe(true);
  });

  it("should not detect non-consecutive days", () => {
    const day1 = new Date("2026-02-20");
    const day2 = new Date("2026-02-23");
    expect(isConsecutiveDay(day1, day2)).toBe(false);
  });

  it("should detect same day", () => {
    const day1 = new Date("2026-02-23T10:00:00");
    const day2 = new Date("2026-02-23T15:00:00");
    expect(isSameDay(day1, day2)).toBe(true);
  });

  it("should not detect different days as same", () => {
    const day1 = new Date("2026-02-22");
    const day2 = new Date("2026-02-23");
    expect(isSameDay(day1, day2)).toBe(false);
  });
});

// Test badge definitions
describe("Badge Definitions", () => {
  const BADGE_DEFINITIONS = [
    { id: "first_task", name: "Primeira Tarefa", condition: (stats: any) => stats.tasksCompleted >= 1 },
    { id: "five_tasks", name: "Produtivo", condition: (stats: any) => stats.tasksCompleted >= 5 },
    { id: "ten_tasks", name: "Veterano", condition: (stats: any) => stats.tasksCompleted >= 10 },
    { id: "fifty_tasks", name: "Mestre", condition: (stats: any) => stats.tasksCompleted >= 50 },
    { id: "streak_3", name: "Consistente", condition: (stats: any) => stats.currentStreak >= 3 },
    { id: "streak_7", name: "Dedicado", condition: (stats: any) => stats.currentStreak >= 7 },
    { id: "streak_30", name: "Imparável", condition: (stats: any) => stats.currentStreak >= 30 },
    { id: "points_100", name: "Centurião", condition: (stats: any) => stats.totalPoints >= 100 },
    { id: "points_500", name: "Elite", condition: (stats: any) => stats.totalPoints >= 500 },
    { id: "points_1000", name: "Lendário", condition: (stats: any) => stats.totalPoints >= 1000 },
  ];

  it("should have 10 badge definitions", () => {
    expect(BADGE_DEFINITIONS).toHaveLength(10);
  });

  it("should award first_task badge after 1 task", () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === "first_task");
    expect(badge?.condition({ tasksCompleted: 1 })).toBe(true);
    expect(badge?.condition({ tasksCompleted: 0 })).toBe(false);
  });

  it("should award streak_7 badge after 7 day streak", () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === "streak_7");
    expect(badge?.condition({ currentStreak: 7 })).toBe(true);
    expect(badge?.condition({ currentStreak: 6 })).toBe(false);
  });

  it("should award points_1000 badge at 1000 points", () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === "points_1000");
    expect(badge?.condition({ totalPoints: 1000 })).toBe(true);
    expect(badge?.condition({ totalPoints: 999 })).toBe(false);
  });

  it("should have unique badge IDs", () => {
    const ids = BADGE_DEFINITIONS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Test task priority ordering
describe("Task Priority Ordering", () => {
  const PRIORITY_ORDER: Record<string, number> = {
    "Crítica": 4,
    "Alta": 3,
    "Média": 2,
    "Baixa": 1,
  };

  it("should order Crítica as highest priority", () => {
    expect(PRIORITY_ORDER["Crítica"]).toBeGreaterThan(PRIORITY_ORDER["Alta"]);
  });

  it("should order Baixa as lowest priority", () => {
    expect(PRIORITY_ORDER["Baixa"]).toBeLessThan(PRIORITY_ORDER["Média"]);
  });

  it("should sort tasks by priority correctly", () => {
    const tasks = [
      { title: "A", priority: "Baixa" },
      { title: "B", priority: "Crítica" },
      { title: "C", priority: "Média" },
      { title: "D", priority: "Alta" },
    ];
    const sorted = [...tasks].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    expect(sorted[0].priority).toBe("Crítica");
    expect(sorted[1].priority).toBe("Alta");
    expect(sorted[2].priority).toBe("Média");
    expect(sorted[3].priority).toBe("Baixa");
  });
});

// Test template creation validation
describe("Template Validation", () => {
  const VALID_PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
  const VALID_DIFFICULTIES = ["Facil", "Normal", "Dificil", "Muito Dificil"];

  it("should accept valid priorities", () => {
    VALID_PRIORITIES.forEach(p => {
      expect(VALID_PRIORITIES.includes(p)).toBe(true);
    });
  });

  it("should reject invalid priorities", () => {
    expect(VALID_PRIORITIES.includes("Urgente")).toBe(false);
    expect(VALID_PRIORITIES.includes("")).toBe(false);
  });

  it("should accept valid difficulties", () => {
    VALID_DIFFICULTIES.forEach(d => {
      expect(VALID_DIFFICULTIES.includes(d)).toBe(true);
    });
  });

  it("should reject invalid difficulties", () => {
    expect(VALID_DIFFICULTIES.includes("Impossível")).toBe(false);
  });

  it("should require positive points", () => {
    const isValidPoints = (points: number) => points > 0 && Number.isInteger(points);
    expect(isValidPoints(10)).toBe(true);
    expect(isValidPoints(0)).toBe(false);
    expect(isValidPoints(-5)).toBe(false);
  });
});

// Test analytics calculations
describe("Analytics Calculations", () => {
  const tasks = [
    { status: "Concluída", priority: "Alta" },
    { status: "Concluída", priority: "Média" },
    { status: "Em Andamento", priority: "Crítica" },
    { status: "Pendente", priority: "Baixa" },
    { status: "Pendente", priority: "Alta" },
  ];

  it("should calculate completion rate correctly", () => {
    const completed = tasks.filter(t => t.status === "Concluída").length;
    const total = tasks.length;
    const rate = Math.round((completed / total) * 100);
    expect(rate).toBe(40);
  });

  it("should count tasks by status correctly", () => {
    const byStatus = {
      completed: tasks.filter(t => t.status === "Concluída").length,
      inProgress: tasks.filter(t => t.status === "Em Andamento").length,
      pending: tasks.filter(t => t.status === "Pendente").length,
    };
    expect(byStatus.completed).toBe(2);
    expect(byStatus.inProgress).toBe(1);
    expect(byStatus.pending).toBe(2);
  });

  it("should count tasks by priority correctly", () => {
    const byPriority = {
      "Crítica": tasks.filter(t => t.priority === "Crítica").length,
      "Alta": tasks.filter(t => t.priority === "Alta").length,
      "Média": tasks.filter(t => t.priority === "Média").length,
      "Baixa": tasks.filter(t => t.priority === "Baixa").length,
    };
    expect(byPriority["Crítica"]).toBe(1);
    expect(byPriority["Alta"]).toBe(2);
    expect(byPriority["Média"]).toBe(1);
    expect(byPriority["Baixa"]).toBe(1);
  });

  it("should handle empty task list", () => {
    const emptyTasks: typeof tasks = [];
    const total = emptyTasks.length;
    const rate = total > 0 ? Math.round((0 / total) * 100) : 0;
    expect(rate).toBe(0);
  });
});
