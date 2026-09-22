import { decodeRutFromGlosa } from "./cartola.js";
import { normRut } from "./rut.js";

const CTA_PROVEEDORES = "2.1.01.001";
const CTA_CLIENTES = "1.1.02.001";

// Reglas de categorizacion automatica: "rut" (memoria por proveedor, se
// aprende sola cuando reclasificas un gasto) o "palabra" (definida a mano,
// para casos sin documento asociado, ej. comisiones bancarias).
export function buscarReglaPorRut(reglas, rut) {
  if (!rut) return null;
  const n = normRut(rut);
  if (!n) return null;
  return (reglas || []).find((r) => r.criterio === "rut" && normRut(r.valor) === n) || null;
}
export function buscarReglaPorPalabra(reglas, texto) {
  if (!texto) return null;
  const t = texto.toLowerCase();
  return (reglas || []).find((r) => r.criterio === "palabra" && r.valor && t.includes(r.valor.toLowerCase())) || null;
}

// ¿Este movimiento de cartola ya tiene un asiento contabilizado en la
// cuenta bancaria elegida? Busca por (cuenta, fecha ± ventanaDias, monto
// en el lado correcto segun Cargo/Abono) — mismo criterio que uso el
// modulo original (cwmovim en ese caso, aqui son los propios asientos).
export function yaContabilizado(mov, cuentaBanco, empEntries, ventanaDias = 5) {
  const fechaMov = new Date(mov.fecha + "T00:00:00");
  const esDebe = mov.cargoAbono === "A"; // abono = entra plata = Debe en cuenta de Activo
  for (const e of empEntries) {
    const fechaE = new Date(e.date + "T00:00:00");
    const dias = Math.abs((fechaE - fechaMov) / 86400000);
    if (dias > ventanaDias) continue;
    for (const l of e.lines) {
      if (l.ac !== cuentaBanco) continue;
      const monto = esDebe ? l.db : l.cr;
      if (Math.abs((monto || 0) - mov.monto) < 1) return e;
    }
  }
  return null;
}

// Candidatos de compra/venta para un movimiento no contabilizado: primero
// cruza por monto contra los asientos de compra/venta ya importados (via
// CSV SII), y si el RUT venia codificado en la glosa lo usa como
// desempate — igual orden que se valido en la conciliacion de referencia
// (monto primero, RUT desempata, nunca al reves).
export function sugerirContraparte(mov, empEntries, reglas) {
  const tipoBuscado = mov.cargoAbono === "C" ? "compra" : "venta";
  const ctaContraparte = mov.cargoAbono === "C" ? CTA_PROVEEDORES : CTA_CLIENTES;
  const rutGlosa = decodeRutFromGlosa(mov.descripcion);

  const candidatas = empEntries.filter((e) => {
    if (e.tipoDoc !== tipoBuscado) return false;
    const linea = e.lines.find((l) => l.ac === ctaContraparte);
    if (!linea) return false;
    const monto = mov.cargoAbono === "C" ? linea.cr : linea.db;
    return Math.abs((monto || 0) - mov.monto) < 1;
  });

  if (candidatas.length === 0) {
    // Sin documento que calce (ej. comision bancaria, sin RUT en la glosa):
    // ultimo recurso, revisar si hay una regla de categorizacion guardada.
    const regla = (rutGlosa && buscarReglaPorRut(reglas, rutGlosa)) || buscarReglaPorPalabra(reglas, mov.descripcion);
    if (regla) {
      return {
        estado: "regla",
        contracuenta: regla.contracuenta,
        motivo: `Coincide con tu regla de categorizacion (${regla.criterio === "rut" ? "RUT " + regla.valor : `palabra "${regla.valor}"`}).`,
      };
    }
    return { estado: "sin_match", motivo: rutGlosa ? "Ni el RUT ni el monto calzaron con compras/ventas." : "El monto no calza con ninguna compra/venta registrada." };
  }
  if (candidatas.length === 1) {
    const c = candidatas[0];
    const rutCoincide = !rutGlosa || normRut(c.rut) === rutGlosa;
    return {
      estado: "match",
      confianza: rutCoincide ? "alta" : "revisar",
      candidato: c,
      motivo: rutCoincide ? "RUT y monto coinciden." : `Monto coincide, pero el RUT de la glosa (${rutGlosa}) no calza con el de la factura (${normRut(c.rut)}) — revisar antes de confirmar.`,
    };
  }
  // 2+ candidatos: si el RUT de la glosa aisla a exactamente uno, lo tomamos
  // como alta confianza; si no, queda ambiguo para que el usuario elija.
  if (rutGlosa) {
    const porRut = candidatas.filter((c) => normRut(c.rut) === rutGlosa);
    if (porRut.length === 1) return { estado: "match", confianza: "alta", candidato: porRut[0], motivo: "RUT y monto coinciden." };
  }
  return { estado: "ambiguo", candidatos: candidatas, motivo: `${candidatas.length} ${tipoBuscado === "compra" ? "compras" : "ventas"} distintas coinciden en monto — elige cual corresponde.` };
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Arma el par Debe/Haber para un movimiento clasificado. Si viene de un
// match automatico contra una compra/venta, usa la contracuenta estandar
// (Proveedores/Clientes) para dejarla saldada; si es clasificacion manual,
// usa la contracuenta que eligio el usuario.
export function armarAsiento(mov, cuentaBanco, contracuenta, numero, empresaId, glosaExtra) {
  const monto = mov.monto;
  const desDebe = mov.cargoAbono === "A" ? cuentaBanco : contracuenta;
  const desHaber = mov.cargoAbono === "A" ? contracuenta : cuentaBanco;
  return {
    id: uid(),
    empresaId,
    num: String(numero).padStart(4, "0"),
    date: mov.fecha,
    desc: (glosaExtra ? glosaExtra + " — " : "") + mov.descripcion,
    lines: [
      { ac: desDebe, db: monto, cr: 0 },
      { ac: desHaber, db: 0, cr: monto },
    ],
  };
}
