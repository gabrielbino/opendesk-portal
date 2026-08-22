import { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';

interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Link de retry para tRPC client
 * Implementa retry automático com backoff exponencial para melhorar resiliência
 */
export function createRetryLink(config: RetryConfig = {}): TRPCLink<any> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Errors that should NOT be retried (auth errors, HTML responses, etc.)
  const isNonRetryableError = (error: any): boolean => {
    const message = error?.message || '';
    // Don't retry auth errors
    if (message.includes('Please login') || message.includes('10001') || message.includes('10002')) return true;
    // Don't retry HTML responses (server returned HTML instead of JSON - usually a proxy/CDN issue)
    if (message.includes('<!doctype') || message.includes('is not valid JSON') || message.includes('Unexpected token')) return true;
    // Don't retry FORBIDDEN errors
    if (error?.data?.code === 'FORBIDDEN' || error?.data?.code === 'UNAUTHORIZED') return true;
    return false;
  };

  return () => {
    return ({ next, op }) => {
      return observable((observer) => {
        let attempts = 0;

        const executeWithRetry = () => {
          attempts++;

          return next(op).subscribe({
            next: (result) => observer.next(result),
            error: (error) => {
              // Skip retry for non-retryable errors
              if (isNonRetryableError(error)) {
                observer.error(error);
                return;
              }

              if (attempts < (mergedConfig.maxRetries || 5)) {
                const delay = Math.min(
                  (mergedConfig.initialDelayMs || 1000) * Math.pow(mergedConfig.backoffMultiplier || 2, attempts - 1),
                  mergedConfig.maxDelayMs || 30000
                );

                console.warn(
                  `[tRPC Retry] Tentativa ${attempts}/${mergedConfig.maxRetries} em ${delay}ms para ${op.path}`,
                  error.message
                );

                setTimeout(executeWithRetry, delay);
              } else {
                console.error(`[tRPC Retry] Falha após ${attempts} tentativas para ${op.path}`, error);
                observer.error(error);
              }
            },
            complete: () => observer.complete(),
          });
        };

        return executeWithRetry();
      });
    };
  };
}
