/**
 * OpenDesk Brand Colors - Standardized color palette
 * Corporate portal brand identity.
 */

export const BrandColors = {
  // Primary Brand Colors
  primary: {
    dark: '#003366',    // Deep corporate blue
    main: '#004080',    // Main brand blue
    light: '#0059b3',   // Light brand blue
    lighter: '#3399ff', // Accent light blue
  },
  
  // Status Colors (Healthcare themed)
  status: {
    planejamento: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    emAndamento: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    emPausa: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    concluido: {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      border: 'border-slate-200',
      badge: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    cancelado: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      badge: 'bg-red-100 text-red-800 border-red-300',
    },
  },
  
  // Priority Colors
  priority: {
    critica: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      badge: 'bg-red-100 text-red-800 border-red-300',
    },
    alta: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      badge: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    media: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
      badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    },
    baixa: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      badge: 'bg-green-100 text-green-800 border-green-300',
    },
  },
  
  // Deadline Alert Colors
  deadline: {
    atrasado: {
      bg: 'bg-red-600',
      text: 'text-white',
      border: 'border-red-500',
      badge: 'bg-red-600 text-white',
    },
    proximo: {
      bg: 'bg-yellow-600',
      text: 'text-white',
      border: 'border-yellow-500',
      badge: 'bg-yellow-600 text-white',
    },
  },
};

// Helper functions
export const getStatusColor = (status: string) => {
  const statusMap: Record<string, typeof BrandColors.status.planejamento> = {
    'Planejamento': BrandColors.status.planejamento,
    'Em Andamento': BrandColors.status.emAndamento,
    'Em Pausa': BrandColors.status.emPausa,
    'Concluído': BrandColors.status.concluido,
    'Cancelado': BrandColors.status.cancelado,
  };
  return statusMap[status] || BrandColors.status.planejamento;
};

export const getPriorityColor = (priority: string) => {
  const priorityMap: Record<string, typeof BrandColors.priority.critica> = {
    'Crítica': BrandColors.priority.critica,
    'Alta': BrandColors.priority.alta,
    'Média': BrandColors.priority.media,
    'Baixa': BrandColors.priority.baixa,
  };
  return priorityMap[priority] || BrandColors.priority.media;
};
