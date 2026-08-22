import { useEffect, useRef, useState } from "react";

interface EnhancedProgressBarProps {
  progress: number;
}

export function EnhancedProgressBar({ progress }: EnhancedProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(progress);
  const prevProgressRef = useRef(progress);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // Na primeira montagem, anima de 0 ao valor alvo
    // Em atualizações subsequentes, anima do valor anterior ao novo
    const startValue = hasAnimatedRef.current ? prevProgressRef.current : 0;
    const targetValue = progress;
    
    // Se o valor não mudou e já animou, não re-animar
    if (hasAnimatedRef.current && startValue === targetValue) {
      return;
    }

    hasAnimatedRef.current = true;
    prevProgressRef.current = progress;

    // Se a diferença é muito pequena, pular animação
    if (Math.abs(targetValue - startValue) < 1) {
      setDisplayProgress(targetValue);
      return;
    }

    // Animate from startValue to target progress
    const duration = 800; // 0.8 second
    const steps = 48;
    const increment = (targetValue - startValue) / steps;
    const stepDuration = duration / steps;
    
    let currentStep = 0;
    setDisplayProgress(startValue);

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayProgress(targetValue);
        clearInterval(timer);
      } else {
        const newValue = startValue + increment * currentStep;
        setDisplayProgress(Math.round(Math.min(Math.max(newValue, 0), 100)));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [progress]);

  const getProgressColor = (value: number) => {
    if (value < 30) return { text: "#ef4444", gradient: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)" };
    if (value < 70) return { text: "#f59e0b", gradient: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)" };
    return { text: "#10b981", gradient: "linear-gradient(90deg, #10b981 0%, #059669 100%)" };
  };

  const colors = getProgressColor(progress);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">Progresso</span>
        <span 
          className="font-bold text-lg tabular-nums"
          style={{ color: colors.text }}
        >
          {displayProgress}%
        </span>
      </div>
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${progress}%`,
            background: colors.gradient
          }}
        />
      </div>
    </div>
  );
}
