import { readXlsxLite } from "./xlsxLite.js";

function cellText(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function cellNumber(v) {
  if (typeof v === "number") return v;
  const t = cellText(v).replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

// "DD/MM/AAAA" o "DD/MM/AA" -> "AAAA-MM-DD"
function parseFechaDDMMAAAA(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec((s || "").trim());
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
  return `${y}-${mo}-${d}`;
}

// Detecta y extrae los movimientos de una cartola Santander (Historica o
// Provisoria, mismo layout): busca la fila de encabezado "MONTO", y toma
// las filas siguientes mientras calcen con el patron de un movimiento real
// (monto numerico, fecha DD/MM/AAAA, Cargo/Abono = "C"/"A" literal).
// Esto excluye automaticamente tanto "Resumen comisiones" (repite algunos
// movimientos con montos mal formateados, ej. "-11.028" en vez de -11028)
// como "Saldos diarios" al final, porque ninguna de esas filas pasa las
// tres validaciones a la vez.
export async function parseCartolaSantander(arrayBuffer) {
  const { sheetNames, rowsByName } = await readXlsxLite(arrayBuffer);
  const rows = rowsByName.get(sheetNames[0]);
  if (!rows) throw new Error("El archivo no tiene hojas.");

  let headerRow = null;
  for (let r = 1; r < rows.length; r++) {
    if (cellText(rows[r]?.[1]).toUpperCase() === "MONTO") { headerRow = r; break; }
  }
  if (!headerRow) throw new Error("No se encontro la fila de encabezado 'MONTO'. ¿Es una cartola Santander?");

  const movimientos = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const monto = cellNumber(row[1]);
    const descripcion = cellText(row[2]);
    const fecha = parseFechaDDMMAAAA(cellText(row[4]));
    const nroDocumento = cellText(row[5]);
    const sucursal = cellText(row[6]);
    const cargoAbono = cellText(row[8]).toUpperCase();

    if (!Number.isFinite(monto) || !fecha || (cargoAbono !== "C" && cargoAbono !== "A")) break;

    movimientos.push({
      id: `cart-${r}`,
      monto: Math.abs(monto),
      descripcion,
      fecha,
      nroDocumento,
      sucursal,
      cargoAbono, // "C" = cargo (sale dinero), "A" = abono (entra dinero)
    });
  }
  return movimientos;
}

// Las transferencias de Santander codifican el RUT del beneficiario/origen
// al inicio de la glosa: "0" + 8 digitos + DV, seguido de un espacio
// (ej. "0151116841 Transf a PABLA NUÑEZ GA" -> RUT 15111684-1).
// Confirmado contra una cartola real: aplica tanto a cargos ("Transf a",
// "PAGO PROVEEDOR") como a abonos ("Transf.", "Transf de").
export function decodeRutFromGlosa(descripcion) {
  const token = (descripcion || "").trim().split(/\s+/)[0] || "";
  if (!/^0\d{8}[0-9Kk]$/.test(token)) return null;
  const body = token.slice(1, 9);
  const dv = token.slice(9).toUpperCase();
  return body + dv;
}
