/**
 * Anti-força-bruta do login (in-app, em memória).
 *
 * Conta tentativas malsucedidas POR E-MAIL e aplica bloqueio TEMPORÁRIO com backoff crescente após
 * `MAX_FAILS`. Sucesso zera o contador; sem atividade por `WINDOW_MS` também zera. Chaveado por e-mail
 * (não por IP) de propósito: atrás do Cloudflare/nginx o IP real nem sempre chega, mas a conta é o
 * alvo do ataque — então protege de forma confiável. Bloqueio é curto (1→15 min) pra não virar DoS
 * de conta; a mensagem é genérica (não revela se o e-mail existe).
 *
 * ⚠️ Estado em memória do processo. O portal roda como 1 processo (systemd) → ok. Se um dia escalar
 * para múltiplos processos/instâncias, migrar este estado para um store compartilhado (Redis/tabela).
 */

const WINDOW_MS = 15 * 60_000; // janela sem tentativas que zera o contador
const MAX_FAILS = 5; // falhas consecutivas antes do 1º bloqueio
// Backoff crescente (a partir da MAX_FAILS-ésima falha): 1, 2, 5, 10, 15 min.
const LOCK_STEPS_MS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000];

type Entry = { fails: number; lockedUntil: number; updatedAt: number };

const byEmail = new Map<string, Entry>();

const chave = (email: string) => email.trim().toLowerCase();

// Poda periódica leve para não crescer indefinidamente.
const sweep = setInterval(() => {
  const t = Date.now();
  byEmail.forEach((e, k) => {
    if (e.lockedUntil < t && t - e.updatedAt > WINDOW_MS) byEmail.delete(k);
  });
}, 5 * 60_000);
sweep.unref?.();

/** Segundos restantes de bloqueio para este e-mail (0 = liberado). */
export function lockRemainingSeconds(email: string): number {
  const e = byEmail.get(chave(email));
  if (!e) return 0;
  const restante = e.lockedUntil - Date.now();
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

/** Registra uma tentativa malsucedida (usuário inexistente OU senha errada). */
export function recordLoginFailure(email: string): void {
  const k = chave(email);
  const t = Date.now();
  let e = byEmail.get(k);
  if (!e || t - e.updatedAt > WINDOW_MS) e = { fails: 0, lockedUntil: 0, updatedAt: t };
  e.fails += 1;
  e.updatedAt = t;
  if (e.fails >= MAX_FAILS) {
    const passo = Math.min(e.fails - MAX_FAILS, LOCK_STEPS_MS.length - 1);
    e.lockedUntil = t + LOCK_STEPS_MS[passo];
  }
  byEmail.set(k, e);
}

/** Zera o contador após um login bem-sucedido. */
export function recordLoginSuccess(email: string): void {
  byEmail.delete(chave(email));
}
