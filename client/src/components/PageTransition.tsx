import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  variant?: 'fade' | 'slide' | 'scale' | 'slideUp';
}

const transitionVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { 
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: 'easeOut' as const,
      },
    },
    exit: { 
      opacity: 0,
      transition: {
        duration: 0.2,
        ease: 'easeIn' as const,
      },
    },
  },
  slide: {
    initial: { opacity: 0, x: -20 },
    animate: { 
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
    exit: { 
      opacity: 0,
      x: 20,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
    exit: { 
      opacity: 0,
      y: -20,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { 
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
    exit: { 
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.2,
        ease: [0.25, 0.1, 0.25, 1] as any,
      },
    },
  },
};

export function PageTransition({ 
  children, 
  className = '', 
  variant = 'fade' 
}: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={transitionVariants[variant]}
      className={className}
    >
      {children}
    </motion.div>
  );
}
