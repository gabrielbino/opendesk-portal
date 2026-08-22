import { useCallback, useMemo, useState } from "react";

/**
 * Seleção em lote de linhas de tabela com **Shift+clique** para intervalos — PADRÃO do
 * projeto (origem: painel do Pescador). Use em qualquer tabela (atuais e futuras).
 *
 * Recebe a lista de ids **na ordem visível atual** (a mesma ordem renderizada, já
 * paginada/filtrada/ordenada) — o range do Shift respeita essa ordem.
 *
 * Uso típico:
 *   const sel = useRangeSelection(linhasVisiveis.map((r) => r.id));
 *   // header:  <Checkbox checked={sel.todasSelecionadas} indeterminate={sel.algumaSelecionada} onClick={sel.toggleAll} />
 *   // linha:   <button onClick={(e) => sel.toggle(row.id, e.shiftKey)}><Checkbox checked={sel.isSelected(row.id)} className="pointer-events-none" /></button>
 *   // ações:   sel.selecionados (Set), sel.selectedCount, sel.clear()
 *
 * Importante (Shift+clique): o checkbox interno deve ter `pointer-events-none` e o clique
 * é capturado por um wrapper (botão/label) que repassa `e.shiftKey` — assim conseguimos ler
 * a tecla Shift (o onCheckedChange do checkbox não expõe o evento).
 */
export interface RangeSelection<T> {
  /** Conjunto bruto de ids selecionados (para `.size`, `.has`, `Array.from`, `filter`). */
  selecionados: Set<T>;
  selectedCount: number;
  isSelected: (id: T) => boolean;
  /** Alterna 1 id; com `shiftKey` true, seleciona/desseleciona o intervalo desde o último clique. */
  toggle: (id: T, shiftKey?: boolean) => void;
  /** Marca/desmarca todos os ids visíveis. */
  toggleAll: () => void;
  /** Limpa toda a seleção. */
  clear: () => void;
  /** Todos os visíveis estão selecionados. */
  todasSelecionadas: boolean;
  /** Há seleção parcial entre os visíveis (para o estado "indeterminate"). */
  algumaSelecionada: boolean;
}

export function useRangeSelection<T>(visibleIds: T[]): RangeSelection<T> {
  const [selecionados, setSelecionados] = useState<Set<T>>(new Set());
  const [lastId, setLastId] = useState<T | null>(null);

  const todasSelecionadas = visibleIds.length > 0 && visibleIds.every((id) => selecionados.has(id));
  const algumaSelecionada = !todasSelecionadas && visibleIds.some((id) => selecionados.has(id));

  const isSelected = useCallback((id: T) => selecionados.has(id), [selecionados]);

  const toggle = useCallback(
    (id: T, shiftKey = false) => {
      setSelecionados((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastId != null && lastId !== id) {
          const a = visibleIds.indexOf(lastId);
          const b = visibleIds.indexOf(id);
          if (a >= 0 && b >= 0) {
            const [start, end] = a < b ? [a, b] : [b, a];
            // Adiciona ou remove o intervalo conforme o estado do alvo do Shift.
            const willSelect = !prev.has(id);
            for (let i = start; i <= end; i++) {
              if (willSelect) next.add(visibleIds[i]);
              else next.delete(visibleIds[i]);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastId(id);
    },
    [lastId, visibleIds],
  );

  const toggleAll = useCallback(() => {
    setSelecionados((prev) => {
      const todas = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (todas) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
    setLastId(null);
  }, [visibleIds]);

  const clear = useCallback(() => {
    setSelecionados(new Set());
    setLastId(null);
  }, []);

  return useMemo(
    () => ({
      selecionados,
      selectedCount: selecionados.size,
      isSelected,
      toggle,
      toggleAll,
      clear,
      todasSelecionadas,
      algumaSelecionada,
    }),
    [selecionados, isSelected, toggle, toggleAll, clear, todasSelecionadas, algumaSelecionada],
  );
}
