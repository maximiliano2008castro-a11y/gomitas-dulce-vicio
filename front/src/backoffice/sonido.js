// Pitido corto para avisar de un pedido nuevo (WebAudio, sin archivos de audio).
// Los navegadores solo dejan sonar despues de que el usuario hizo clic en la pagina.
const LLAVE = "backoffice-sonido";

export function sonidoActivado() {
  try {
    return localStorage.getItem(LLAVE) !== "no";
  } catch {
    return true;
  }
}

export function guardarSonido(activado) {
  try {
    localStorage.setItem(LLAVE, activado ? "si" : "no");
  } catch {
    // sin localStorage: solo no se recuerda la preferencia
  }
}

export function pitido() {
  if (!sonidoActivado()) return;
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const notas = [880, 1175];
    notas.forEach((frecuencia, i) => {
      const oscilador = audio.createOscillator();
      const volumen = audio.createGain();
      oscilador.frequency.value = frecuencia;
      oscilador.type = "sine";
      volumen.gain.value = 0.08;
      oscilador.connect(volumen);
      volumen.connect(audio.destination);
      oscilador.start(audio.currentTime + i * 0.14);
      oscilador.stop(audio.currentTime + i * 0.14 + 0.12);
    });
  } catch {
    // si el navegador no deja, no pasa nada
  }
}
