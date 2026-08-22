import { useEffect } from "react";

/**
 * Enquanto `active` = true, emite um bipe periódico (Web Audio — sem precisar de arquivo de áudio)
 * para reforçar um alerta em tela. Para ao desativar/desmontar. Reutilizável por qualquer alerta.
 *
 * A frequência é configurável (`frequency`) para diferenciar alertas pelo som — ex.: 880Hz (CFV,
 * padrão) × um tom mais grave para pedidos travados. Ressalva de navegador: o áudio só toca depois
 * de alguma interação do usuário na página (política de autoplay). Por isso destravamos o contexto
 * no 1º clique/toque, caso venha suspenso.
 */
export function useAlertSound(active: boolean, intervalMs = 3000, frequency = 880): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    let ctx: AudioContext | null = new AC();
    const destravar = () => {
      ctx?.resume().catch(() => {});
    };
    destravar();
    window.addEventListener("pointerdown", destravar);

    function bipe() {
      if (!ctx || ctx.state !== "running") return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    }

    bipe();
    const id = window.setInterval(bipe, intervalMs);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", destravar);
      ctx?.close().catch(() => {});
      ctx = null;
    };
  }, [active, intervalMs, frequency]);
}
