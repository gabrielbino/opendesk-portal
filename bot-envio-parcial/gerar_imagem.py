"""
gerar_imagem.py — Panorama Pedidos Sem ST | OpenDesk
Visual fiel ao painel Excel original.

USO (v2 — multi-envio):
  python gerar_imagem.py <dados.json> <medias.json> <ordem.json> <output.png> [modo]

Argumentos:
  dados.json  — array de linhas [{Gerente, Rca, ValorST, ValorPedidos, ValorSemST, QtdPalm}]
  medias.json — modo "painel": {gerente: media5d} · modo "area": {rca: media5d}
  ordem.json  — modo "painel": ordem dos gerentes · modo "area": ordem das áreas (gerências)
  output.png  — caminho de saída da imagem
  modo        — "painel" (default, recolhido por gerente) | "area" (expandido por RCA)

Fallback (compatibilidade v1): sem argumentos, usa env vars PAINEL_DADOS/PAINEL_MEDIAS
e a ORDEM hard-coded SC, modo "painel".
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

# ── Cores exatas do painel ────────────────────────────────────────────────────
AZ_LOGO   = (0,   70, 160)
AZ_TITULO = (30,  30, 200)
AZ_ESC    = (0,   32,  96)
AZ_TXT    = (0,   32,  96)
AZ_LIN    = (140, 170, 210)
COL_VEZ   = (180, 200, 230)
BRANCO    = (255, 255, 255)
CZ_FND    = (228, 232, 240)
CZ_LINHA  = (200, 208, 220)
CZ_IMPAR  = (243, 245, 250)
TX_MON    = (90,  90,  90)
VM_BG     = (180,   0,   0)
LA_BG     = (200,  90,   0)
AM_BG     = (200, 160,   0)
AM_TX     = (80,   55,   0)
VD_POS    = (0,   130,  30)

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH   = os.path.join(SCRIPT_DIR, 'logo_opendesk_transp.png')

# ── Carrega dados (v2 via args, v1 via env) ──────────────────────────────────
if len(sys.argv) >= 5:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        rows = json.load(f)
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        MEDIAS = json.load(f)
    with open(sys.argv[3], 'r', encoding='utf-8') as f:
        ORDEM = json.load(f)
    OUTPUT_PATH = sys.argv[4]
    MODO = sys.argv[5].strip().lower() if len(sys.argv) >= 6 else 'painel'
else:
    rows   = json.loads(os.environ.get('PAINEL_DADOS',  '[]'))
    MEDIAS = json.loads(os.environ.get('PAINEL_MEDIAS', '{}'))
    ORDEM  = ['GV KA MICHEL', 'GVSC CAPITAL', 'GVSC OESTE', 'GVSC NORTE']
    OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'painel_output.png')
    MODO = 'painel'

# ── Fontes ────────────────────────────────────────────────────────────────────
def _font(wn, ln, sz):
    for p in [f'C:/Windows/Fonts/{wn}',
              f'/usr/share/fonts/truetype/liberation/{ln}']:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

f8    = _font('arial.ttf',   'LiberationSans-Regular.ttf', 11)
f9    = _font('arial.ttf',   'LiberationSans-Regular.ttf', 12)
f9b   = _font('arialbd.ttf', 'LiberationSans-Bold.ttf',    12)
f10   = _font('arial.ttf',   'LiberationSans-Regular.ttf', 13)
f10b  = _font('arialbd.ttf', 'LiberationSans-Bold.ttf',    13)
f11b  = _font('arialbd.ttf', 'LiberationSans-Bold.ttf',    14)
f12b  = _font('arialbd.ttf', 'LiberationSans-Bold.ttf',    16)
f18b  = _font('arialbd.ttf', 'LiberationSans-Bold.ttf',    24)

# ── Helpers ───────────────────────────────────────────────────────────────────
def brl(v):
    return f'{v:,.2f}'.replace(',','X').replace('.',',').replace('X','.')

def badge_color(p):
    if p >= 0:   return VD_POS, BRANCO
    if p >= -30: return AM_BG,  AM_TX
    if p >= -60: return LA_BG,  BRANCO
    return VM_BG, BRANCO

def pct_val(v, m):
    return round((v / m - 1) * 100) if m else 0

# ── Dimensões comuns ──────────────────────────────────────────────────────────
W      = 980
PAD    = 6
HDR_H  = 92
HOR_H  = 24
TH_H   = 28
ROW_H  = 28
ROD_H  = 28


def desenhar_cabecalho(d, img):
    """Logo + DATA + título + linha de horário. Retorna y abaixo do horário."""
    # LOGO
    LX1, LY1, LX2, LY2 = PAD, PAD, 162, PAD+HDR_H-2
    d.rectangle([LX1, LY1, LX2, LY2], fill=AZ_LOGO, outline=AZ_LOGO)
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert('RGBA')
        lw   = LX2 - LX1 - 12
        lh   = int(logo.height * lw / logo.width)
        if lh > HDR_H - 12:
            lh = HDR_H - 12
            lw = int(logo.width * lh / logo.height)
        logo = logo.resize((lw, lh), Image.LANCZOS)
        lx   = LX1 + (LX2 - LX1 - lw) // 2
        ly   = LY1 + (HDR_H - lh) // 2
        img.paste(logo, (lx, ly), logo)

    # DATA
    DX1, DY1, DX2 = 168, PAD, 308
    hoje = datetime.now().strftime('%d/%m/%Y')
    d.rectangle([DX1, DY1, DX2, DY1+18], fill=AZ_LOGO)
    d.text(((DX1+DX2)//2, DY1+9), 'DATA', font=f9b, fill=BRANCO, anchor='mm')
    d.rectangle([DX1, DY1+19, DX2, DY1+53], fill=BRANCO, outline=CZ_LINHA)
    d.text(((DX1+DX2)//2, DY1+36), hoje, font=f10b, fill=AZ_TXT, anchor='mm')
    d.rectangle([DX1, DY1+54, DX2, DY1+88], fill=BRANCO, outline=CZ_LINHA)
    d.text(((DX1+DX2)//2, DY1+71), hoje, font=f10b, fill=AZ_TXT, anchor='mm')

    # TÍTULO
    TX1, TY1, TX2, TY2 = 314, PAD, W-PAD, PAD+HDR_H-2
    d.rectangle([TX1, TY1, TX2, TY2], fill=AZ_TITULO)
    d.text(((TX1+TX2)//2, (TY1+TY2)//2),
           'PANORAMA DE PEDIDOS SEM ST',
           font=f18b, fill=BRANCO, anchor='mm')

    # HORÁRIO
    hy  = PAD + HDR_H + 2
    now = datetime.now()
    agora = now.strftime('%-d/%-m/%y %-I:%M %p') if os.name != 'nt' else now.strftime('%#d/%#m/%y %#I:%M %p')
    d.rectangle([PAD, hy, W-PAD, hy+HOR_H], fill=BRANCO, outline=CZ_LINHA)
    d.text((PAD+8,   hy+HOR_H//2), 'Horário:', font=f10b, fill=(0,0,0), anchor='lm')
    d.rectangle([PAD+72, hy+3, PAD+230, hy+HOR_H-3], fill=BRANCO, outline=CZ_LINHA)
    d.text((PAD+151, hy+HOR_H//2), agora,      font=f10b, fill=(0,0,0), anchor='mm')
    d.text((W-PAD-6, hy+HOR_H//2),
           'INFORMAÇÕES BASEADAS NOS ÚLTIMOS 5 DIAS ÚTEIS',
           font=f8, fill=(0,0,0), anchor='rm')
    return hy + HOR_H


def desenhar_linha_valores(d, x_cols, y, semst, media, palm, fonte, escuro=False):
    """Desenha as 4 colunas de valores (Sem ST, Média, % badge, Qtd) numa linha."""
    _, x_semst2, x_media1, x_media2, x_badge1, x_badge2, x_qtd_c = x_cols
    pv = pct_val(semst, media)
    cor_rs = (160,190,255) if escuro else TX_MON
    cor_tx = BRANCO if escuro else (0,0,0)
    d.text((x_media1-178, y), 'R$',       font=f9,   fill=cor_rs, anchor='lm')
    d.text((x_semst2,     y), brl(semst), font=fonte, fill=cor_tx, anchor='rm')
    d.text((x_media1,     y), 'R$',       font=f9,   fill=cor_rs, anchor='lm')
    d.text((x_media2,     y), brl(media), font=fonte, fill=cor_tx, anchor='rm')
    bg_b, fg_b = badge_color(pv)
    d.rectangle([x_badge1, y-ROW_H//2+4, x_badge2, y+ROW_H//2-4], fill=bg_b)
    d.text(((x_badge1+x_badge2)//2, y), f'{pv}%', font=fonte, fill=fg_b, anchor='mm')
    d.text((x_qtd_c, y), str(int(palm)), font=fonte, fill=cor_tx, anchor='mm')


# ════════════════════════════════════════════════════════════════════════════
# MODO "area" — recorte expandido por RCA + subtotal por área (blocos empilhados)
# ════════════════════════════════════════════════════════════════════════════
def render_area():
    # Colunas: Área/RCA | Valor Sem ST | Média | % | Qtd
    C_RCA1, C_RCA2   = PAD, 360
    C_ST2            = 558           # right-align do Sem ST
    C_MED1, C_MED2   = 562, 738      # 'R$' + right-align da Média
    C_BDG1, C_BDG2   = 744, 854      # badge %
    C_QTD_C          = (858 + (W-PAD)) // 2
    x_cols = (C_RCA2, C_ST2, C_MED1, C_MED2, C_BDG1, C_BDG2, C_QTD_C)
    COLS_X = [PAD, C_RCA2, 560, 740, 856, W-PAD]

    # Agrupa linhas por área (gerência), respeitando ORDEM.
    por_area = {}
    for r in rows:
        por_area.setdefault(r['Gerente'], []).append(r)
    areas = [a for a in ORDEM if a in por_area] or list(por_area.keys())

    # Altura: cabeçalho + header de colunas + por área (band + rcas + subtotal).
    n_rcas = sum(len(por_area[a]) for a in areas)
    BAND_H = 26
    H = (PAD + HDR_H + 2 + HOR_H + TH_H
         + len(areas) * (BAND_H + ROD_H)
         + n_rcas * ROW_H + PAD)

    img = Image.new('RGB', (W, H), CZ_FND)
    d   = ImageDraw.Draw(img)
    y = desenhar_cabecalho(d, img)

    # Header de colunas
    COLS = [(PAD, C_RCA2, 'RCA', 'l'),
            (C_RCA2, 560, 'Valor Pedidos Sem ST', 'c'),
            (560, 740, 'Média diária de Venda', 'c'),
            (740, 856, '% Desemp.', 'c'),
            (856, W-PAD, 'Qtd', 'c')]
    d.rectangle([PAD, y, W-PAD, y+TH_H], fill=AZ_ESC)
    for x1, x2, label, align in COLS:
        xp  = x1+10 if align == 'l' else (x1+x2)//2
        anc = 'lm' if align == 'l' else 'mm'
        d.text((xp, y+TH_H//2), label, font=f9b, fill=BRANCO, anchor=anc)
        if x1 > PAD:
            d.line([(x1, y+4),(x1, y+TH_H-4)], fill=AZ_LIN, width=1)
    y += TH_H

    for area in areas:
        linhas = por_area[area]
        # Band com o nome da área
        d.rectangle([PAD, y, W-PAD, y+BAND_H], fill=AZ_LOGO)
        d.text((PAD+10, y+BAND_H//2), area, font=f11b, fill=BRANCO, anchor='lm')
        y += BAND_H

        tot_semst = tot_media = tot_palm = 0.0
        for i, r in enumerate(linhas):
            rca   = r.get('Rca') or ''
            semst = float(r.get('ValorSemST', 0))
            media = float(MEDIAS.get(rca, 0))
            palm  = int(r.get('QtdPalm', 0))
            tot_semst += semst
            tot_media += media
            tot_palm  += palm

            bg = BRANCO if i % 2 == 0 else CZ_IMPAR
            d.rectangle([PAD, y, W-PAD, y+ROW_H], fill=bg)
            d.line([(PAD, y),(W-PAD, y)], fill=CZ_LINHA, width=1)
            d.text((PAD+12, y+ROW_H//2), rca, font=f10, fill=AZ_TXT, anchor='lm')
            desenhar_linha_valores(d, x_cols, y+ROW_H//2, semst, media, palm, f11b)
            for x1 in COLS_X:
                if x1 > PAD:
                    d.line([(x1, y),(x1, y+ROW_H)], fill=CZ_LINHA, width=1)
            y += ROW_H

        # Subtotal da área
        d.rectangle([PAD, y, W-PAD, y+ROD_H], fill=AZ_ESC)
        d.text((PAD+10, y+ROD_H//2), f'{area} Total', font=f12b, fill=BRANCO, anchor='lm')
        desenhar_linha_valores(d, x_cols, y+ROD_H//2, tot_semst, tot_media, tot_palm, f12b, escuro=True)
        for x1 in COLS_X:
            if x1 > PAD:
                d.line([(x1, y),(x1, y+ROD_H)], fill=AZ_LIN, width=1)
        y += ROD_H

    d.rectangle([PAD, PAD, W-PAD, y], outline=AZ_ESC, width=2)
    img.save(OUTPUT_PATH, quality=95)
    print(f'Imagem salva (area): {OUTPUT_PATH}')


# ════════════════════════════════════════════════════════════════════════════
# MODO "painel" — recolhido por gerente (layout original, para os grupos)
# ════════════════════════════════════════════════════════════════════════════
def render_painel():
    pg = {}
    for r in rows:
        g = r['Gerente']
        if g not in pg:
            pg[g] = {'semst': 0.0, 'pedidos': 0.0, 'st': 0.0, 'palm': 0}
        pg[g]['semst']   += float(r.get('ValorSemST',   0))
        pg[g]['pedidos'] += float(r.get('ValorPedidos', 0))
        pg[g]['st']      += float(r.get('ValorST',      0))
        pg[g]['palm']    += int(r.get('QtdPalm',         0))

    ORDEM_DIN = sorted(ORDEM, key=lambda g: pg.get(g, {}).get('semst', 0), reverse=True)

    N = len(ORDEM)
    H = PAD + HDR_H + 2 + HOR_H + TH_H + N*ROW_H + ROD_H + PAD
    img = Image.new('RGB', (W, H), CZ_FND)
    d   = ImageDraw.Draw(img)
    thy = desenhar_cabecalho(d, img)

    COLS = [
        (PAD,  210, 'gerente',               'l'),
        (210,  320, 'rca',                   'l'),
        (320,  500, 'Valor Pedidos Sem ST',  'c'),
        (500,  670, 'Média diária de Venda', 'c'),
        (670,  780, '% Desemp.',             'c'),
        (780, W-PAD,'Ped. Recebidos',        'c'),
    ]

    d.rectangle([PAD, thy, W-PAD, thy+TH_H], fill=AZ_ESC)
    for x1, x2, label, align in COLS:
        xp  = x1+10 if align == 'l' else (x1+x2)//2
        anc = 'lm' if align == 'l' else 'mm'
        d.text((xp, thy+TH_H//2), label, font=f9b, fill=BRANCO, anchor=anc)
        if x1 > PAD:
            d.line([(x1, thy+4),(x1, thy+TH_H-4)], fill=AZ_LIN, width=1)

    total_semst = total_media = total_palm = 0.0
    cy2 = thy + TH_H
    for i, ge in enumerate(ORDEM_DIN):
        rec   = pg.get(ge, {'semst':0.0,'pedidos':0.0,'st':0.0,'palm':0})
        semst = rec['semst']
        media = MEDIAS.get(ge, 0)
        total_semst += semst
        total_media += media
        total_palm  += rec['palm']
        pv = pct_val(semst, media)

        bg = BRANCO if i % 2 == 0 else CZ_IMPAR
        d.rectangle([PAD, cy2, W-PAD, cy2+ROW_H], fill=bg)
        d.line([(PAD, cy2),(W-PAD, cy2)], fill=CZ_LINHA, width=1)

        d.rectangle([PAD+8, cy2+ROW_H//2-6, PAD+20, cy2+ROW_H//2+6], outline=AZ_TXT, width=1)
        d.text((PAD+28, cy2+ROW_H//2), ge, font=f11b, fill=AZ_TXT, anchor='lm')

        d.text((322, cy2+ROW_H//2), 'R$',       font=f9,   fill=TX_MON, anchor='lm')
        d.text((498, cy2+ROW_H//2), brl(semst), font=f11b, fill=(0,0,0), anchor='rm')
        d.text((502, cy2+ROW_H//2), 'R$',       font=f9,   fill=TX_MON, anchor='lm')
        d.text((668, cy2+ROW_H//2), brl(media), font=f11b, fill=(0,0,0), anchor='rm')
        bg_b, fg_b = badge_color(pv)
        d.rectangle([676, cy2+4, 774, cy2+ROW_H-4], fill=bg_b)
        d.text((725, cy2+ROW_H//2), f'{pv}%', font=f11b, fill=fg_b, anchor='mm')
        d.text(((780+W-PAD)//2, cy2+ROW_H//2), str(rec['palm']), font=f11b, fill=(0,0,0), anchor='mm')

        for x1, x2, _, __ in COLS:
            if x1 > PAD:
                d.line([(x1, cy2),(x1, cy2+ROW_H)], fill=CZ_LINHA, width=1)
        cy2 += ROW_H

    pv_t = pct_val(total_semst, total_media)
    d.rectangle([PAD, cy2, W-PAD, cy2+ROD_H], fill=AZ_ESC)
    d.line([(PAD, cy2),(W-PAD, cy2)], fill=(30,60,140), width=2)
    d.text((PAD+10, cy2+ROD_H//2), 'Total Geral',   font=f12b, fill=BRANCO,        anchor='lm')
    d.text((322,    cy2+ROD_H//2), 'R$',             font=f10b, fill=(160,190,255), anchor='lm')
    d.text((498,    cy2+ROD_H//2), brl(total_semst), font=f12b, fill=BRANCO,        anchor='rm')
    d.text((502,    cy2+ROD_H//2), 'R$',             font=f10b, fill=(160,190,255), anchor='lm')
    d.text((668,    cy2+ROD_H//2), brl(total_media), font=f12b, fill=BRANCO,        anchor='rm')
    bg_b, fg_b = badge_color(pv_t)
    d.rectangle([676, cy2+4, 774, cy2+ROD_H-4], fill=bg_b)
    d.text((725, cy2+ROD_H//2), f'{pv_t}%', font=f12b, fill=fg_b, anchor='mm')
    d.text(((780+W-PAD)//2, cy2+ROD_H//2), str(int(total_palm)), font=f12b, fill=BRANCO, anchor='mm')
    for x1, x2, _, __ in COLS:
        if x1 > PAD:
            d.line([(x1, cy2),(x1, cy2+ROD_H)], fill=AZ_LIN, width=1)

    d.rectangle([PAD, PAD, W-PAD, cy2+ROD_H], outline=AZ_ESC, width=2)
    img.save(OUTPUT_PATH, quality=95)
    print(f'Imagem salva: {OUTPUT_PATH}')


if MODO == 'area':
    render_area()
else:
    render_painel()
