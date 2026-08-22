"""
gerar_imagem_monitor.py — Imagem do "Cenário de Integrações" (Monitor de Integrações).

Renderiza, a partir do payload JSON montado no portal (regra pura em
shared/monitorArquivosResumo.ts → ResumoImagemPayload), uma imagem-painel com as seções
Pedidos e Listas: KPIs por cor + uma linha por integração (nome + frase curta), colorida pelo
status. Enviada 1x/dia no WhatsApp pelo gateway (connector/monitor-wa-gateway/index.mjs).

USO:
  python3 gerar_imagem_monitor.py <payload.json> <output.png>

Mesma técnica do bot de Parcial (JSON → desenho procedural com Pillow → PNG). Sem dependência
do portal. Requer Pillow (pip install pillow).
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

from PIL import Image, ImageDraw, ImageFont

# ── Cores por status (StatusCor) ───────────────────────────────────────────────
COR_RGB = {
    "vermelho": (200, 0, 0),
    "amarelo": (200, 150, 0),
    "azul": (0, 110, 200),
    "verde": (0, 150, 50),
    "inativo": (120, 130, 145),
}
COR_LABEL = {
    "vermelho": "Crítico",
    "amarelo": "Atenção",
    "azul": "Aguardando",
    "verde": "OK",
    "inativo": "Inativo",
}
ORDEM_COR = ["vermelho", "amarelo", "azul", "verde", "inativo"]

BRANCO = (255, 255, 255)
TX_ESC = (25, 32, 45)
TX_CINZA = (90, 100, 115)
FUNDO = (247, 249, 252)
BARRA = (30, 41, 59)          # header das seções (slate-800)
LINHA = (226, 232, 240)
ZEBRA = (241, 245, 249)


# ── Fontes (Windows p/ dev; Liberation na VM Ubuntu; fallback default) ─────────
def _font(wn, ln, sz):
    for p in [f"C:/Windows/Fonts/{wn}", f"/usr/share/fonts/truetype/liberation/{ln}"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F_TITULO = _font("arialbd.ttf", "LiberationSans-Bold.ttf", 26)
F_SUB = _font("arial.ttf", "LiberationSans-Regular.ttf", 13)
F_SECAO = _font("arialbd.ttf", "LiberationSans-Bold.ttf", 16)
F_KPI = _font("arialbd.ttf", "LiberationSans-Bold.ttf", 13)
F_NOME = _font("arialbd.ttf", "LiberationSans-Bold.ttf", 14)
F_DET = _font("arial.ttf", "LiberationSans-Regular.ttf", 12)


# ── Dimensões ───────────────────────────────────────────────────────────────
W = 900
MARGEM = 24
HDR_H = 78
SEC_TITULO_H = 40
KPI_H = 40
ROW_H = 30
GAP_SECAO = 22
ROD_H = 30


def _texto_largura(draw, txt, font):
    try:
        return draw.textlength(txt, font=font)
    except Exception:
        return font.getbbox(txt)[2]


def _truncar(draw, txt, font, largura_max):
    if _texto_largura(draw, txt, font) <= largura_max:
        return txt
    reticencias = "…"
    s = txt
    while s and _texto_largura(draw, s + reticencias, font) > largura_max:
        s = s[:-1]
    return (s + reticencias) if s else reticencias


def _fmt_data(iso):
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        dt = dt.astimezone(timezone(timedelta(hours=-3)))  # America/Sao_Paulo (sem DST)
        return dt.strftime("%d/%m/%Y às %H:%M")
    except Exception:
        return datetime.now().strftime("%d/%m/%Y às %H:%M")


def _secoes_visiveis(payload):
    out = []
    for chave, rotulo in (("pedidos", "Pedidos"), ("listas", "Listas")):
        sec = payload.get(chave) or {}
        if sec.get("mostrar"):
            out.append((rotulo, sec))
    return out


def _altura(payload, secoes):
    h = MARGEM + HDR_H
    for _, sec in secoes:
        itens = sec.get("itens") or []
        h += SEC_TITULO_H + KPI_H + max(1, len(itens)) * ROW_H + GAP_SECAO
    return h + ROD_H + MARGEM


def _chips_kpi(draw, x, y, kpis):
    """Desenha os chips [•dot  N Rótulo] por cor (vermelho sempre; demais só se > 0)."""
    cx = x
    for cor in ORDEM_COR:
        n = int(kpis.get(cor, 0) or 0)
        if n == 0 and cor != "vermelho":
            continue
        rgb = COR_RGB[cor]
        rotulo = COR_LABEL[cor]
        texto = f"{n} {rotulo}"
        tw = _texto_largura(draw, texto, F_KPI)
        chip_w = 16 + 10 + tw + 12
        chip_h = 26
        draw.rounded_rectangle([cx, y, cx + chip_w, y + chip_h], radius=13, fill=BRANCO, outline=rgb, width=1)
        draw.ellipse([cx + 10, y + chip_h / 2 - 5, cx + 20, y + chip_h / 2 + 5], fill=rgb)
        draw.text((cx + 26, y + 5), texto, font=F_KPI, fill=TX_ESC)
        cx += chip_w + 8


def render(payload, output_path):
    secoes = _secoes_visiveis(payload)
    altura = _altura(payload, secoes)
    img = Image.new("RGB", (W, altura), FUNDO)
    d = ImageDraw.Draw(img)

    titulo = str(payload.get("titulo") or "Cenário de Integrações")
    y = MARGEM

    # ── Cabeçalho ──
    d.text((MARGEM, y), titulo, font=F_TITULO, fill=TX_ESC)
    d.text((MARGEM, y + 38), f"Gerado em {_fmt_data(payload.get('geradoEm'))}", font=F_SUB, fill=TX_CINZA)
    y += HDR_H
    d.line([MARGEM, y - 8, W - MARGEM, y - 8], fill=LINHA, width=1)

    if not secoes:
        d.text((MARGEM, y + 10), "Nenhuma integração a exibir.", font=F_NOME, fill=TX_CINZA)
        img.save(output_path)
        return

    for rotulo, sec in secoes:
        itens = sec.get("itens") or []
        kpis = sec.get("kpis") or {}

        # Barra da seção
        d.rounded_rectangle([MARGEM, y, W - MARGEM, y + SEC_TITULO_H - 6], radius=8, fill=BARRA)
        d.text((MARGEM + 14, y + 8), f"{rotulo}  ·  {len(itens)} integração(ões)", font=F_SECAO, fill=BRANCO)
        y += SEC_TITULO_H

        # KPIs por cor
        _chips_kpi(d, MARGEM, y, kpis)
        y += KPI_H

        # Linhas (uma por integração)
        for i, it in enumerate(itens):
            if i % 2 == 1:
                d.rectangle([MARGEM, y, W - MARGEM, y + ROW_H], fill=ZEBRA)
            cor = it.get("cor", "inativo")
            rgb = COR_RGB.get(cor, COR_RGB["inativo"])
            cy = y + ROW_H / 2
            d.ellipse([MARGEM + 6, cy - 5, MARGEM + 16, cy + 5], fill=rgb)
            nome = _truncar(d, str(it.get("nome") or ""), F_NOME, 300)
            d.text((MARGEM + 28, y + 7), nome, font=F_NOME, fill=TX_ESC)
            det = _truncar(d, str(it.get("detalhe") or ""), F_DET, W - MARGEM - (MARGEM + 28 + 320))
            d.text((MARGEM + 28 + 320, y + 8), det, font=F_DET, fill=TX_CINZA)
            y += ROW_H

        y += GAP_SECAO

    # Rodapé
    d.line([MARGEM, altura - ROD_H, W - MARGEM, altura - ROD_H], fill=LINHA, width=1)
    d.text((MARGEM, altura - ROD_H + 8), "Monitor de Integrações", font=F_SUB, fill=TX_CINZA)

    img.save(output_path, quality=95)


def main():
    if len(sys.argv) < 3:
        print("uso: python3 gerar_imagem_monitor.py <payload.json> <output.png>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        payload = json.load(f)
    render(payload, sys.argv[2])


if __name__ == "__main__":
    main()
