import { useEffect } from "react";

/**
 * Enquanto `active` = true, chama a atenção na ABA do navegador: pisca o TÍTULO (alterna com
 * `message`) e o FAVICON (um ponto colorido com "!"). Restaura tudo ao desativar/desmontar.
 *
 * A cor do ponto é configurável (`faviconColor`) para diferenciar alertas — ex.: âmbar (CFV,
 * padrão) × vermelho (pedidos travados no Monitor). Obs.: navegadores não permitem colorir a aba
 * em si — piscar título + favicon é o padrão para "aba pulsante". Reutilizável por qualquer alerta.
 */
export interface FaviconColor {
  /** Cor de preenchimento do ponto. */
  fill: string;
  /** Cor da borda do ponto. */
  stroke: string;
}

const FAVICON_AMBAR: FaviconColor = { fill: "#f59e0b", stroke: "#b45309" }; // amber-500 / amber-700

function faviconPonto({ fill, stroke }: FaviconColor): string {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 16, 17);
  return c.toDataURL("image/png");
}

export function useTabAlert(active: boolean, message = "⚠ Alerta", faviconColor: FaviconColor = FAVICON_AMBAR): void {
  const { fill, stroke } = faviconColor;
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const tituloOriginal = document.title;
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const criouLink = !link;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    const hrefOriginal = link.getAttribute("href");
    const iconPonto = faviconPonto({ fill, stroke });

    let ligado = false;
    const id = window.setInterval(() => {
      ligado = !ligado;
      document.title = ligado ? message : tituloOriginal;
      if (link) link.href = ligado ? iconPonto : hrefOriginal ?? iconPonto;
    }, 900);

    return () => {
      window.clearInterval(id);
      document.title = tituloOriginal;
      if (criouLink) {
        link?.remove();
      } else if (link && hrefOriginal) {
        link.href = hrefOriginal;
      }
    };
  }, [active, message, fill, stroke]);
}
