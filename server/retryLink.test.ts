import { describe, it, expect } from 'vitest';

// Test the isNonRetryableError logic (extracted for testing)
function isNonRetryableError(error: any): boolean {
  const message = error?.message || '';
  if (message.includes('Please login') || message.includes('10001') || message.includes('10002')) return true;
  if (message.includes('<!doctype') || message.includes('is not valid JSON') || message.includes('Unexpected token')) return true;
  if (error?.data?.code === 'FORBIDDEN' || error?.data?.code === 'UNAUTHORIZED') return true;
  return false;
}

describe('retryLink - isNonRetryableError', () => {
  it('should not retry auth errors with "Please login (10001)"', () => {
    expect(isNonRetryableError({ message: 'Please login (10001)' })).toBe(true);
  });

  it('should not retry permission errors with "10002"', () => {
    expect(isNonRetryableError({ message: 'You do not have required permission (10002)' })).toBe(true);
  });

  it('should not retry HTML response errors', () => {
    expect(isNonRetryableError({ message: 'Unexpected token \'<\', "<!doctype "... is not valid JSON' })).toBe(true);
  });

  it('should not retry "is not valid JSON" errors', () => {
    expect(isNonRetryableError({ message: 'Something is not valid JSON' })).toBe(true);
  });

  it('should not retry "Unexpected token" errors', () => {
    expect(isNonRetryableError({ message: 'Unexpected token < in JSON' })).toBe(true);
  });

  it('should not retry UNAUTHORIZED errors by code', () => {
    expect(isNonRetryableError({ message: 'error', data: { code: 'UNAUTHORIZED' } })).toBe(true);
  });

  it('should not retry FORBIDDEN errors by code', () => {
    expect(isNonRetryableError({ message: 'error', data: { code: 'FORBIDDEN' } })).toBe(true);
  });

  it('should retry network errors', () => {
    expect(isNonRetryableError({ message: 'Failed to fetch' })).toBe(false);
  });

  it('should retry timeout errors', () => {
    expect(isNonRetryableError({ message: 'Request timeout' })).toBe(false);
  });

  it('should retry server errors', () => {
    expect(isNonRetryableError({ message: 'Internal server error' })).toBe(false);
  });

  it('should retry null/undefined errors', () => {
    expect(isNonRetryableError(null)).toBe(false);
    expect(isNonRetryableError(undefined)).toBe(false);
  });

  it('should retry empty error objects', () => {
    expect(isNonRetryableError({})).toBe(false);
  });
});
