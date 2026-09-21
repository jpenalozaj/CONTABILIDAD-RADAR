// Logica compartida para hablar con la CLI open source del SII y armar el
// CSV que ya sabe leer RADAR. La usan tanto sii-rcv-export.mjs (descarga un
// archivo) como sii-local-server.mjs (se lo pasa a RADAR por HTTP local).

import { spawn } from "node:child_process";

export function runSiiCli(args) {
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
export function normFecha(s) {
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

// periodo: "AAAAMM", tipo: "compra"|"venta" -> CSV listo para RADAR + metadata.
export async function fetchRcvCsv(periodo, tipo) {
  if (!/^\d{6}$/.test(periodo || "")) throw new Error("Periodo invalido, usa formato AAAAMM (ej: 202605).");
  if (tipo !== "compra" && tipo !== "venta") throw new Error('Tipo invalido, usa "compra" o "venta".');

  const args = ["rcv", "all", periodo];
  if (tipo === "venta") args.push("--venta");

  const raw = await runSiiCli(args);
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("La salida de \"sii\" no fue JSON valido. Salida cruda:\n" + raw); }

  const docs = data.docs || [];
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
  return { csv, count: docs.length, incomplete: !!data.incomplete, rejectedTypes: data.rejectedTypes || [] };
}
