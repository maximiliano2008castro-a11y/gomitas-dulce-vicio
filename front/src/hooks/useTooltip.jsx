// Tooltip para las graficas: sigue al mouse y tambien aparece con el teclado (focus).
import { useState } from "react";

export function useTooltip() {
  const [tip, setTip] = useState(null);
  const mostrar = (e, contenido) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2;
    const y = e.clientY || r.top;
    setTip({ x, y, contenido });
  };
  const ocultar = () => setTip(null);
  const props = (contenido) => ({
    tabIndex: 0,
    onPointerMove: (e) => mostrar(e, contenido),
    onPointerLeave: ocultar,
    onFocus: (e) => mostrar(e, contenido),
    onBlur: ocultar,
  });
  const elemento = tip && (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.contenido}
    </div>
  );
  return { props, elemento };
}
