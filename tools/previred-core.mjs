// Descarga y lee el informe mensual "Indicadores Previsionales" que
// Previred publica en PDF, publico y sin login (a diferencia del SII, no
// hay ninguna clave de por medio aqui). Extrae UF, UTM, tasas de comision
// por AFP y el tope imponible, para que RADAR no dependa de valores fijos
// desactualizados.
//
// El nombre del PDF no es 100% consistente mes a mes (a veces trae "-V2"
// o "-1" al final, o el mes en mayuscula/minuscula distinto), asi que se
// prueban varias variantes de URL hasta encontrar una que exista.

import pdfParse from "pdf-parse";

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const AFPS = ["Capital","Cuprum","Habitat","Modelo","PlanVital","Provida","Uno"];

function candidateUrls(anio, mes) {
  const mesNombre = MESES[mes - 1];
  const mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
  const anio2 = String(anio).slice(-2);
  const mesNum = String(mes).padStart(2, "0");
  const base = `https://www.previred.com/wp-content/uploads/${anio}/${mesNum}`;
  const nombres = [
    `Indicadores-Previsionales-Previred-${mesCap}-${anio2}.pdf`,
    `Indicadores-Previsionales-Previred-${mesCap}-${anio2}-V2.pdf`,
    `Indicadores-Previsionales-Previred-${mesCap}-${anio2}-1.pdf`,
    `Indicadores-Previsionales-Previred-${mesNombre}-${anio}.pdf`,
    `Indicadores-Previsionales-Previred-${mesNombre}-${anio}-1.pdf`,
  ];
  return nombres.map((n) => `${base}/${n}`);
}

async function fetchPdfText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RADAR local tool)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("pdf")) throw new Error("La URL no devolvio un PDF (content-type: " + ct + ")");
  const buf = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buf);
  return data.text;
}

// Busca "<Nombre AFP> ... <numero>,<numero>%" dentro de una ventana corta
// de texto despues del nombre, para tolerar que la tabla del PDF se haya
// extraido con espacios o saltos de linea raros.
function extraerPorcentajeCerca(texto, etiqueta, ventana = 60) {
  const idx = texto.indexOf(etiqueta);
  if (idx === -1) return null;
  const trozo = texto.slice(idx, idx + ventana);
  const m = trozo.match(/(\d{1,2}[.,]\d{1,2})\s*%/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}

function extraerMonto(texto, etiqueta, ventana = 80) {
  const idx = texto.indexOf(etiqueta);
  if (idx === -1) return null;
  const trozo = texto.slice(idx, idx + ventana);
  const m = trozo.match(/\$?\s*([\d]{1,3}(?:[.,]\d{3})+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/[.,]/g, ""), 10);
}

function extraerUF(texto) {
  const m = texto.match(/UF[^\d]{0,20}\$?\s*([\d]{1,3}[.,]\d{3}[.,]\d{1,2})/);
  if (!m) return null;
  const limpio = m[1].replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(limpio));
}

export async function fetchIndicadoresPrevired(anio, mes) {
  const hoy = new Date();
  const intentos = [];
  // Prueba el mes pedido y, si no esta, el anterior (el informe de un mes
  // suele publicarse unos dias antes de que empiece).
  const combos = [
    [anio ?? hoy.getFullYear(), mes ?? hoy.getMonth() + 1],
    [hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear(), hoy.getMonth() === 0 ? 12 : hoy.getMonth()],
  ];
  for (const [a, m] of combos) {
    for (const url of candidateUrls(a, m)) {
      try {
        const texto = await fetchPdfText(url);
        const afp = {};
        for (const nombre of AFPS) {
          const r = extraerPorcentajeCerca(texto, nombre);
          if (r != null) afp[nombre.toLowerCase()] = { r, sis: 1.85 };
        }
        const sisMatch = texto.match(/SIS[^\d]{0,20}(\d{1,2}[.,]\d{1,2})\s*%/);
        const sis = sisMatch ? parseFloat(sisMatch[1].replace(",", ".")) : null;
        if (sis != null) for (const k of Object.keys(afp)) afp[k].sis = sis;
        const utm = extraerMonto(texto, "UTM");
        const uf = extraerUF(texto);
        const topeMatch = texto.match(/(\d{2,3}[.,]\d{1,2})\s*UF/);
        const topeImponibleUF = topeMatch ? parseFloat(topeMatch[1].replace(",", ".")) : null;
        if (Object.keys(afp).length < 3) throw new Error("PDF encontrado pero no se reconocieron suficientes tasas AFP (formato distinto al esperado)");
        return { url, periodo: `${MESES[m - 1]} ${a}`, afp, uf, utm, topeImponibleUF };
      } catch (err) {
        intentos.push(`${url} -> ${err.message}`);
      }
    }
  }
  throw new Error("No se encontro un informe de Previred legible. URLs probadas:\n" + intentos.join("\n"));
}
