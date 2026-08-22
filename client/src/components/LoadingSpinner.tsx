import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
  xl: 'w-32 h-32',
};

const textSizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

export default function LoadingSpinner({ 
  size = 'md', 
  text = 'Carregando...', 
  fullScreen = false 
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Animated logo container */}
      <div className="relative">
        {/* Outer rotating ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-400 border-r-cyan-400"
          animate={{ rotate: 360 }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            width: size === 'sm' ? '48px' : size === 'md' ? '80px' : size === 'lg' ? '112px' : '144px',
            height: size === 'sm' ? '48px' : size === 'md' ? '80px' : size === 'lg' ? '112px' : '144px',
          }}
        />
        
        {/* Middle rotating ring (opposite direction) */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-b-blue-400 border-l-blue-400"
          animate={{ rotate: -360 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            width: size === 'sm' ? '48px' : size === 'md' ? '80px' : size === 'lg' ? '112px' : '144px',
            height: size === 'sm' ? '48px' : size === 'md' ? '80px' : size === 'lg' ? '112px' : '144px',
          }}
        />
        
        {/* Pulse animation circle */}
        <motion.div
          className={`relative ${sizeClasses[size]} flex items-center justify-center bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full`}
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <div className="text-foreground font-bold text-center">OpenDesk</div>
        </motion.div>
      </div>

      {/* Loading text */}
      {text && (
        <motion.p
          className={`${textSizeClasses[size]} font-medium text-foreground/90`}
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {text}
        </motion.p>
      )}

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-cyan-400"
            animate={{
              y: [0, -8, 0],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        {content}
      </div>
    );
  }

  return content;
}
