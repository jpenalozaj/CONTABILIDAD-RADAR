#!/usr/bin/env node
// Baja el Registro de Compras y Ventas (RCV) del SII usando la CLI open source
// @albertomarturelo/sii-cli (login por navegador, tu Clave nunca pasa por este
// script ni por RADAR) y lo convierte al CSV que ya sabe leer RADAR
// (Contabilidad > Compras/Ventas SII).
//
// Uso:
//   1) Una sola vez:  npm install -g @albertomarturelo/sii-cli
//   2) Cada sesion:   sii auth login        (se abre un navegador, escribes tu Clave ahi)
//   3) Por periodo:   node tools/sii-rcv-export.mjs 202605 compra
//                     node tools/sii-rcv-export.mjs 202605 venta
//
// Genera un archivo compras_202605.csv (o ventas_202605.csv) en esta carpeta,
// listo para subir en RADAR. Si prefieres no subirlo a mano, usa en vez de
// esto sii-local-server.mjs (ver tools/README.md) y el boton "Importar
// automatico" dentro de RADAR.
//
// Este script no guarda ni transmite ninguna clave: solo llama al comando
// "sii" ya autenticado (via tu propio login previo) y lee su salida JSON.

import { writeFile } from "node:fs/promises";
import { fetchRcvCsv } from "./sii-rcv-core.mjs";

const [, , periodoArg, tipoArg] = process.argv;

function usage() {
  console.error("Uso: node tools/sii-rcv-export.mjs <periodo YYYYMM> <compra|venta>");
  console.error("Ejemplo: node tools/sii-rcv-export.mjs 202605 compra");
  process.exit(1);
}

if (!periodoArg || !/^\d{6}$/.test(periodoArg)) usage();
if (tipoArg !== "compra" && tipoArg !== "venta") usage();

async function main() {
  console.error(`Consultando SII: rcv all ${periodoArg}${tipoArg === "venta" ? " --venta" : ""} ...`);
  const { csv, count, incomplete, rejectedTypes } = await fetchRcvCsv(periodoArg, tipoArg);
  if (incomplete) {
    console.error(`Aviso: el SII rechazo estos tipos de documento (revisalos a mano): ${rejectedTypes.join(", ")}`);
  }

  const outFile = `${tipoArg === "compra" ? "compras" : "ventas"}_${periodoArg}.csv`;
  await writeFile(outFile, csv, "utf8");
  console.error(`Listo: ${count} documentos -> ${outFile}`);
  console.error(`Subilo en RADAR: Contabilidad > Compras/Ventas SII > Cargar CSV (${tipoArg === "compra" ? "Libro de Compras" : "Libro de Ventas"}).`);
}

main().catch((err) => {
  console.error("Error: " + err.message);
  process.exit(1);
});
