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
// listo para subir en RADAR.
//
// Este script no guarda ni transmite ninguna clave: solo llama al comando
// "sii" ya autenticado (via tu propio login previo) y lee su salida JSON.

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [, , periodoArg, tipoArg] = process.argv;

function usage() {
  console.error("Uso: node tools/sii-rcv-export.mjs <periodo YYYYMM> <compra|venta>");
  console.error("Ejemplo: node tools/sii-rcv-export.mjs 202605 compra");
  process.exit(1);
}

if (!periodoArg || !/^\d{6}$/.test(periodoArg)) usage();
if (tipoArg !== "compra" && tipoArg !== "venta") usage();

function runSiiCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("sii", args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error('No se encontro el comando "sii". Instalalo primero con: npm install -g @albertomarturelo/sii-cli'));
      } else reject(err);
    });
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(`sii ${args.join(" ")} termino con codigo ${code}`)); return; }
      resolve(out);
    });
  });
}

// "AAAA-MM-DD", "DD/MM/AAAA" u otro texto con fecha -> "AAAA-MM-DD". Si no
// reconoce el formato, deja el valor tal cual (RADAR lo tomara literal).
function normFecha(s) {
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return s;
}

// RADAR parsea con un split(";") simple (no un parser CSV completo), asi que
// no soporta comillas escapadas dentro de un campo — se quitan las comillas
// en vez de duplicarlas, para no dejar un artefacto raro en el valor leido.
const csvField = (v) => `"${String(v ?? "").replace(/[";]/g, "")}"`;

async function main() {
  const args = ["rcv", "all", periodoArg];
  if (tipoArg === "venta") args.push("--venta");

  console.error(`Consultando SII: ${args.join(" ")} ...`);
  const raw = await runSiiCli(args);
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("La salida de \"sii\" no fue JSON valido. Salida cruda:\n" + raw); }

  const docs = data.docs || [];
  if (data.incomplete) {
    console.error(`Aviso: el SII rechazo estos tipos de documento (revisalos a mano): ${(data.rejectedTypes || []).join(", ")}`);
  }

  // Mismo formato "corto" que ya acepta RADAR: fecha;rut;razon;folio;neto;iva;total
  const rows = [["fecha", "rut", "razon_social", "folio", "neto", "iva", "total"]];
  for (const d of docs) {
    rows.push([
      normFecha(d.fechaEmision),
      d.rutEmisor || "",
      d.razonSocial || "",
      d.folio ?? "",
      d.montoNeto ?? 0,
      d.montoIva ?? 0,
      d.montoTotal ?? 0,
    ]);
  }

  const csv = rows.map((r) => r.map(csvField).join(";")).join("\n") + "\n";
  const outFile = `${tipoArg === "compra" ? "compras" : "ventas"}_${periodoArg}.csv`;
  await writeFile(outFile, csv, "utf8");
  console.error(`Listo: ${docs.length} documentos -> ${outFile}`);
  console.error(`Subilo en RADAR: Contabilidad > Compras/Ventas SII > Cargar CSV (${tipoArg === "compra" ? "Libro de Compras" : "Libro de Ventas"}).`);
}

main().catch((err) => {
  console.error("Error: " + err.message);
  process.exit(1);
});
