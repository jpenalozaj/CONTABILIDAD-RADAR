#!/usr/bin/env node
// Puente local entre RADAR (que corre en tu navegador via `npm run dev`) y
// la CLI del SII: expone un endpoint en tu propio computador que RADAR
// llama para traer el CSV de Compras/Ventas, asi el boton "Importar
// automatico" no te obliga a descargar y subir el archivo a mano.
//
// Solo escucha en 127.0.0.1 (nunca en la red de tu wifi/oficina), asi que
// ningun otro computador puede llegar a este puerto — y tu Clave del SII
// nunca pasa por aqui: solo la escribes en el navegador real que abre
// "sii auth login".
//
// Uso:
//   1) npm install -g @albertomarturelo/sii-cli   (una sola vez)
//   2) sii auth login                              (cada sesion, ~100 min)
//   3) node tools/sii-local-server.mjs             (dejalo corriendo)
//   4) En RADAR: Contabilidad > Compras/Ventas SII > "Importar automatico"

import { createServer } from "node:http";
import { fetchRcvCsv, fetchRcvResumen } from "./sii-rcv-core.mjs";

const PORT = 4001;

const server = createServer(async (req, res) => {
  // Local-only: el bind a 127.0.0.1 ya evita acceso desde otras maquinas;
  // "*" aqui solo permite que el propio navegador (RADAR en localhost) lea
  // la respuesta.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const periodo = url.searchParams.get("periodo") || "";
  const tipo = url.searchParams.get("tipo") || "";

  if (url.pathname === "/export") {
    try {
      console.log(`Consultando SII: periodo=${periodo} tipo=${tipo} ...`);
      const { csv, count, incomplete, rejectedTypes } = await fetchRcvCsv(periodo, tipo);
      if (incomplete) console.log(`Aviso: el SII rechazo estos tipos de documento (revisalos a mano): ${rejectedTypes.join(", ")}`);
      console.log(`Listo: ${count} documentos enviados a RADAR.`);
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
      res.end(csv);
    } catch (err) {
      console.error("Error: " + err.message);
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.message);
    }
    return;
  }

  if (url.pathname === "/summary") {
    try {
      console.log(`Consultando resumen oficial SII: periodo=${periodo} tipo=${tipo} ...`);
      const resumen = await fetchRcvResumen(periodo, tipo);
      console.log(`Listo: ${resumen.rows.length} filas de resumen enviadas a RADAR.`);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(resumen));
    } catch (err) {
      console.error("Error: " + err.message);
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.message);
    }
    return;
  }

  res.writeHead(404); res.end("No encontrado");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Puente SII -> RADAR escuchando en http://localhost:${PORT} (solo tu computador puede usarlo).`);
  console.log('Dejalo corriendo en esta terminal mientras usas "Importar automatico" en RADAR. Ctrl+C para detenerlo.');
});
