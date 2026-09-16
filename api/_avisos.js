/* Que se avisa y que no.
   Esto es el contrato de Sharon, no una preferencia tecnica:

   - Solo existen tres avisos, y en este orden (D45):
       1. entrega de la universidad que se acerca
       2. pago o cuota por vencer
       3. hueco libre con un pendiente que cabe
   - Nunca se le avisa de recoger a Joel ni de entrar o salir de un turno (D49).
   - Ademas de los tres, las clases avisan justo antes de empezar y los
     examenes el mismo dia (decision nueva de Sharon; cambia D45 en ese punto).
   - El resumen de la semana avisa el domingo 9:30 pm (D83).
   - Silencio de 11 pm a 6 am, sin excepciones, ni en noches de turno (D46).
   - Los tres llegan el dia anterior (D85).
   - Tope de 8 al dia (D87).
   - El presupuesto no notifica (D88).
*/

export const TOPE_DIARIO = 8;
export const SILENCIO_DESDE = 23;   // 11 pm
export const SILENCIO_HASTA = 6;    // 6 am
const HUECO_MINIMO = 60;            // minutos: menos que eso no es un hueco util

/* La app guarda las fechas como YYYY-MM-DD en hora de Colombia. */
export function fechaEnColombia(ahora = new Date()) {
  const desplazado = new Date(ahora.getTime() - 5 * 3600 * 1000);
  return desplazado.toISOString().slice(0, 10);
}
export function horaEnColombia(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600 * 1000).getUTCHours();
}
export function enSilencio(ahora = new Date()) {
  const h = horaEnColombia(ahora);
  return h >= SILENCIO_DESDE || h < SILENCIO_HASTA;
}
function sumarDias(fecha, n) {
  const [a, m, d] = fecha.split('-').map(Number);
  const nueva = new Date(Date.UTC(a, m - 1, d + n));
  return nueva.toISOString().slice(0, 10);
}
function ultimoDiaDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}
function minutosDe(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
function finEnMinutos(entra, sale) {
  const a = minutosDe(entra);
  const b = minutosDe(sale);
  if (a === null || b === null) return null;
  return b <= a ? b + 1440 : b;
}
function duracion(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ' ' + m : ''}` : `${m} min`;
}
function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

/* ---- 1. la entrega que se acerca ---- */
function avisosDeEntregas(data, manana) {
  return (data.academicTasks || [])
    .filter((t) => !t.done && t.date === manana)
    .map((t) => ({
      tipo: 'entrega',
      titulo: 'Mañana entregas ' + t.name,
      cuerpo: [t.subject, t.type].filter(Boolean).join(' · ') || 'Universidad',
      ir: 'pendientes',
    }));
}

/* ---- 2. el pago o la cuota por vencer ---- */
function proximoCobro(sus, hoy) {
  const dia = Number(sus.dia);
  if (!dia) return null;
  const [a, m] = hoy.split('-').map(Number);
  const arma = (anio, mes) =>
    `${anio}-${String(mes + 1).padStart(2, '0')}-${String(
      Math.min(dia, ultimoDiaDelMes(anio, mes))
    ).padStart(2, '0')}`;
  let f = arma(a, m - 1);
  const pagado = (sus.pagados || []).includes(f.slice(0, 7));
  if (f < hoy || pagado) f = arma(a, m);
  return f;
}
function saldoDeuda(d) {
  const movs = (d.movs || []).reduce(
    (acc, mv) => acc + (mv.sentido === 'abono' ? -Number(mv.monto) : Number(mv.monto)),
    0
  );
  return Number(d.monto) + movs;
}
function avisosDePagos(data, hoy, manana) {
  const out = [];
  (data.suscripciones || []).forEach((s) => {
    if (proximoCobro(s, hoy) !== manana) return;
    const monto = s.moneda === 'USD' && Number(s.montoCOP) ? Number(s.montoCOP) : Number(s.monto);
    out.push({
      tipo: 'pago',
      titulo: 'Mañana te cobran ' + s.nombre,
      cuerpo: s.moneda === 'USD' ? `US$${s.monto}` : plata(monto),
      ir: 'plata',
    });
  });
  (data.deudas || []).forEach((d) => {
    if (d.saldada || d.fecha !== manana) return;
    out.push({
      tipo: 'pago',
      titulo: 'Mañana vence ' + d.nombre,
      cuerpo: (d.sentido === 'meDeben' ? 'Te deben ' : 'Debes ') + plata(saldoDeuda(d)),
      ir: 'plata',
    });
  });
  (data.events || []).forEach((e) => {
    if (e.cat !== 'finanzas' || e.type !== 'pago' || e.status === 'hecho') return;
    if (e.date !== manana) return;
    out.push({ tipo: 'pago', titulo: 'Mañana vence ' + e.title, cuerpo: plata(e.amount), ir: 'plata' });
  });
  return out;
}

/* ---- 3. el hueco libre con un pendiente que cabe ---- */
function bloquesDelDia(data, fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const out = [];
  (data.events || []).forEach((e) => {
    if (e.date !== fecha || !e.start || e.status === 'hecho') return;
    if (e.cat === 'nexxa' && e.noVoy) return;
    out.push({ desde: minutosDe(e.start), hasta: finEnMinutos(e.start, e.end || e.start) });
  });
  (data.routines || []).forEach((r) => {
    if (!r.days || !r.days.includes(dow) || !r.start) return;
    out.push({ desde: minutosDe(r.start), hasta: finEnMinutos(r.start, r.end || r.start) });
  });
  return out.filter((b) => b.desde !== null && b.hasta !== null).sort((x, y) => x.desde - y.desde);
}
function avisosDeHuecos(data, manana) {
  const pendiente = (data.pendientes || [])
    .filter((p) => !p.hecho)
    .sort((a, b) => (a.urgencia === 'urgente' ? 0 : 1) - (b.urgencia === 'urgente' ? 0 : 1))[0];
  if (!pendiente) return [];

  const bloques = bloquesDelDia(data, manana);
  if (!bloques.length) return [];

  let mejor = null;
  for (let i = 0; i < bloques.length - 1; i++) {
    const hueco = bloques[i + 1].desde - bloques[i].hasta;
    if (hueco >= HUECO_MINIMO && (!mejor || hueco > mejor.min)) {
      mejor = { min: hueco, desde: bloques[i].hasta };
    }
  }
  if (!mejor) return [];
  const hh = String(Math.floor((mejor.desde % 1440) / 60)).padStart(2, '0');
  const mm = String(mejor.desde % 60).padStart(2, '0');
  return [
    {
      tipo: 'hueco',
      titulo: `Mañana te quedan ${duracion(mejor.min)} libres`,
      cuerpo: `Desde las ${hh}:${mm}. Cabe: ${pendiente.titulo}`,
      ir: 'hoy',
    },
  ];
}

/* ---- 4. la clase que empieza ya (decision nueva de Sharon, C5) ----
   Cambia D45 y D49 en un punto: se avisa de clases y de examenes justo antes
   de que empiecen. Turnos y Joel siguen sin avisar, tal cual estaba.
   Solo cuentan como clase las materias de la universidad y las rutinas del
   area universidad (ingles del SENA, clase con Leslie). */
export const VENTANA_CLASE = 12;   // minutos: se avisa si empieza dentro de este rato

function minutosAhora(ahora = new Date()) {
  const d = new Date(ahora.getTime() - 5 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function clasesDelDia(data, fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const out = [];
  (data.subjects || []).forEach((s) => {
    if (s.day !== dow || !s.start) return;
    out.push({ id: 'materia:' + s.id, nombre: s.name, start: s.start });
  });
  (data.routines || []).forEach((r) => {
    if (r.cat !== 'universidad' || !r.days || !r.days.includes(dow) || !r.start) return;
    out.push({ id: 'rutina:' + r.id, nombre: r.title, start: r.start });
  });
  return out;
}

/* Lo que empieza dentro del rato que viene. Cada uno trae su clave para no
   mandarlo dos veces el mismo dia. */
export function avisosDeAhora(data, ahora = new Date()) {
  if (!data || enSilencio(ahora)) return [];
  const hoy = fechaEnColombia(ahora);
  const min = minutosAhora(ahora);
  const hechos = (data.diario && data.diario[hoy] && data.diario[hoy].repetidos) || {};
  const out = [];

  clasesDelDia(data, hoy).forEach((c) => {
    const empieza = minutosDe(c.start);
    if (empieza === null) return;
    const faltan = empieza - min;
    if (faltan < 0 || faltan > VENTANA_CLASE) return;
    if (hechos[c.id] === 'hecho') return;                 // ya la marco, no la moleste
    out.push({
      tipo: 'clase',
      clave: hoy + ':' + c.id,
      titulo: c.nombre,
      cuerpo: faltan <= 1 ? 'Empieza ya' : `Empieza en ${faltan} minutos`,
      ir: 'hoy',
    });
  });

  /* el resumen de la semana: domingo 9:30 pm, antes del silencio (D83) */
  const d = new Date(ahora.getTime() - 5 * 3600 * 1000);
  if (d.getUTCDay() === 0 && min >= 21 * 60 + 30 && min < 22 * 60 + 30) {
    out.push({
      tipo: 'resumen',
      clave: hoy + ':resumen-semana',
      titulo: 'Tu semana, Sharon',
      cuerpo: 'Ya está lista en Yo: horas, plata y el veredicto.',
      ir: 'yo',
    });
  }

  /* los examenes del dia: se avisan una vez, en la primera corrida del dia */
  (data.academicTasks || []).forEach((t) => {
    if (t.done || t.date !== hoy) return;
    if (!/parcial|quiz|examen|exposici/i.test(t.type || '')) return;
    out.push({
      tipo: 'entrega',
      clave: hoy + ':examen:' + t.id,
      titulo: 'Hoy tienes ' + t.name,
      cuerpo: [t.subject, t.type].filter(Boolean).join(' · ') || 'Universidad',
      ir: 'pendientes',
    });
  });

  return out.slice(0, TOPE_DIARIO);
}

/* El orden importa: si hay que recortar por el tope, se recorta por el final. */
export function avisosPara(data, ahora = new Date()) {
  if (!data || enSilencio(ahora)) return [];
  const hoy = fechaEnColombia(ahora);
  const manana = sumarDias(hoy, 1);
  return [
    ...avisosDeEntregas(data, manana),
    ...avisosDePagos(data, hoy, manana),
    ...avisosDeHuecos(data, manana),
  ].slice(0, TOPE_DIARIO);
}
