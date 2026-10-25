// Tema: Formularios controlados (radio buttons) + listas.
import { METODOS } from "../pagos";

export default function MetodoSelector({ valor, onCambiar }) {
  return (
    <fieldset className="metodos">
      <legend>Metodo de pago</legend>
      {METODOS.map((m) => (
        <label key={m.id} className={"metodo" + (valor === m.id ? " metodo--activo" : "")}>
          <input
            type="radio"
            name="metodo_pago"
            value={m.id}
            checked={valor === m.id}
            onChange={() => onCambiar(m.id)}
          />
          <span className="metodo__icono" aria-hidden="true">{m.icono}</span>
          <span>
            <strong>{m.nombre}</strong>
            <small>{m.descripcion}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
