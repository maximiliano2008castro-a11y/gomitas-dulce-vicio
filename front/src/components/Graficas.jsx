// Graficas del dashboard hechas con HTML + CSS (flexbox), sin librerias.
// Reglas: barras delgadas, un solo eje, colores de estado siempre con icono + texto,
// leyenda cuando hay 2+ series y tooltip al pasar el mouse (o con el teclado).
import { useTooltip } from "../hooks/useTooltip";

// ---------- Tarjeta de numero ----------
export function StatTile({ etiqueta, valor, nota, heroe = false }) {
  return (
    <div className={"stat" + (heroe ? " stat--heroe" : "")}>
      <span className="stat__etiqueta">{etiqueta}</span>
      <span className="stat__valor">{valor}</span>
      {nota && <span className="stat__nota">{nota}</span>}
    </div>
  );
}

// ---------- Leyenda ----------
export function Leyenda({ series }) {
  return (
    <ul className="leyenda">
      {series.map((s) => (
        <li key={s.id}>
          <span className={`leyenda__muestra ${s.clase}`} aria-hidden="true" />
          {s.icono && <span aria-hidden="true">{s.icono}</span>} {s.nombre}
        </li>
      ))}
    </ul>
  );
}

// ---------- Barras horizontales apiladas (filas x segmentos) ----------
// filas: [{ id, etiqueta, total, nota, valores: { serieId: n } }]
// series: [{ id, nombre, clase, icono }]
export function BarrasApiladas({ filas, series, formatoTooltip }) {
  const { props, elemento } = useTooltip();
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className="barras">
      <Leyenda series={series} />
      {filas.map((f) => (
        <div key={f.id} className="barras__fila">
          <span className="barras__etiqueta">{f.etiqueta}</span>
          <div className="barras__pista">
            <div className="barras__barra" style={{ width: anchoBarra(f.total, max) }}>
              {series
                .filter((s) => f.valores[s.id] > 0)
                .map((s) => (
                  <div
                    key={s.id}
                    className={`barras__segmento ${s.clase}`}
                    style={{ flexGrow: f.valores[s.id] }}
                    aria-label={`${f.etiqueta}, ${s.nombre}: ${f.valores[s.id]}`}
                    {...props(formatoTooltip(f, s))}
                  />
                ))}
            </div>
            <span className="barras__valor">{f.total}</span>
          </div>
          {f.nota && <span className="barras__nota">{f.nota}</span>}
        </div>
      ))}
      {elemento}
    </div>
  );
}

// ---------- Barras horizontales de una sola serie ----------
export function BarrasSimples({ datos, formato = (v) => v }) {
  const { props, elemento } = useTooltip();
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="barras">
      {datos.map((d) => (
        <div key={d.id} className="barras__fila barras__fila--simple">
          <span className="barras__etiqueta">{d.etiqueta}</span>
          <div className="barras__pista">
            <div
              className="barras__barra barras__barra--serie"
              style={{ width: anchoBarra(d.valor, max) }}
              aria-label={`${d.etiqueta}: ${formato(d.valor)}`}
              {...props(
                <>
                  <strong>{d.etiqueta}</strong>
                  <span>{formato(d.valor)}</span>
                  {d.extra && <span>{d.extra}</span>}
                </>
              )}
            />
            <span className="barras__valor">{formato(d.valor)}</span>
          </div>
        </div>
      ))}
      {elemento}
    </div>
  );
}

// ---------- Columnas (serie de tiempo) ----------
// datos: [{ id, etiqueta, etiquetaCorta, valor, extra }]
export function Columnas({ datos, formato = (v) => v, formatoEje = formato }) {
  const { props, elemento } = useTooltip();
  const maxDato = Math.max(0, ...datos.map((d) => d.valor));
  const max = ejeLimpio(maxDato);
  const ticks = [0, max / 2, max];
  const iMax = datos.findIndex((d) => d.valor === maxDato && maxDato > 0);
  // Etiquetas del eje X contadas desde el final: el ultimo dia siempre lleva etiqueta
  // y ninguna se encima con la anterior.
  const cadaCuanto = Math.ceil(datos.length / 8);

  return (
    <div className="columnas">
      <div className="columnas__eje">
        {[...ticks].reverse().map((t) => (
          <span key={t}>{formatoEje(t)}</span>
        ))}
      </div>
      <div className="columnas__area">
        {ticks.map((t) => (
          <div key={t} className="columnas__guia" style={{ bottom: `${(t / max) * 100}%` }} />
        ))}
        <div className="columnas__barras">
          {datos.map((d, i) => (
            <div key={d.id} className="columnas__slot" aria-label={`${d.etiqueta}: ${formato(d.valor)}`} {...props(
              <>
                <strong>{d.etiqueta}</strong>
                <span>{formato(d.valor)}</span>
                {d.extra && <span>{d.extra}</span>}
              </>
            )}>
              {i === iMax && <span className="columnas__etiqueta-max">{formato(d.valor)}</span>}
              <div className="columnas__barra" style={{ height: `${(d.valor / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="columnas__x">
          {datos.map((d, i) => (
            <span key={d.id}>{(datos.length - 1 - i) % cadaCuanto === 0 ? d.etiquetaCorta : ""}</span>
          ))}
        </div>
      </div>
      {elemento}
    </div>
  );
}

// La barra se escala sobre el espacio que queda despues del numero de la punta, asi la
// longitud siempre es proporcional al valor sin importar cuanto mida el texto.
function anchoBarra(valor, max) {
  return `calc((100% - ${ESPACIO_VALOR}px) * ${valor / max})`;
}

const ESPACIO_VALOR = 72;

// Redondea el maximo del eje a un numero limpio (100, 250, 500, 1000...).
function ejeLimpio(n) {
  if (n <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(n));
  const paso = [1, 2, 2.5, 5, 10].find((m) => m * base >= n);
  return paso * base;
}
