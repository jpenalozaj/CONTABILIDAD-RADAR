// Lee los indicadores previsionales (UF, UTM, tope imponible, tasas AFP)
// desde la pagina publica de Previred -- a diferencia del SII, esto no
// necesita login ni clave, es una pagina abierta.
//
// Antes esto intentaba adivinar el nombre del PDF mensual (que cambia de
// formato seguido), pero Previred tiene una URL fija con el periodo
// vigente como pagina HTML, mucho mas estable:
//   https://www.previred.com/web/previred/indicadores-previsionales

const URL_INDICADORES = "https://www.previred.com/web/previred/indicadores-previsionales";
const AFPS = ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "Provida", "Uno"];

function htmlATexto(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// Busca "<etiqueta> ... <numero>,<numero>%" dentro de una ventana corta de
// texto despues de la etiqueta, para tolerar espacios/celdas de tabla raras.
function extraerPorcentajeCerca(texto, etiqueta, ventana = 80) {
  const idx = texto.indexOf(etiqueta);
  if (idx === -1) return null;
  const trozo = texto.slice(idx, idx + ventana);
  const m = trozo.match(/(\d{1,2}[.,]\d{1,2})\s*%/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}

function extraerMonto(texto, etiqueta, ventana = 100) {
  const idx = texto.indexOf(etiqueta);
  if (idx === -1) return null;
  const trozo = texto.slice(idx, idx + ventana);
  const m = trozo.match(/\$\s*([\d]{1,3}(?:[.,]\d{3})+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/[.,]/g, ""), 10);
}

function extraerUF(texto) {
  const m = texto.match(/UF[^\d]{0,30}\$?\s*([\d]{1,3}[.,]\d{3}[.,]\d{1,2})/);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/\./g, "").replace(",", ".")));
}

export async function fetchIndicadoresPrevired() {
  const res = await fetch(URL_INDICADORES, { headers: { "User-Agent": "Mozilla/5.0 (RADAR local tool)" } });
  if (!res.ok) throw new Error(`Previred respondio HTTP ${res.status} en ${URL_INDICADORES}`);
  const html = await res.text();
  const texto = htmlATexto(html);

  const afp = {};
  for (const nombre of AFPS) {
    const r = extraerPorcentajeCerca(texto, nombre);
    if (r != null) afp[nombre.toLowerCase()] = { r, sis: 1.85 };
  }
  const sisMatch = texto.match(/SIS[^\d]{0,30}(\d{1,2}[.,]\d{1,2})\s*%/);
  const sis = sisMatch ? parseFloat(sisMatch[1].replace(",", ".")) : null;
  if (sis != null) for (const k of Object.keys(afp)) afp[k].sis = sis;

  const utm = extraerMonto(texto, "UTM");
  const uf = extraerUF(texto);
  const topeMatch = texto.match(/(\d{2,3}[.,]\d{1,2})\s*UF/);
  const topeImponibleUF = topeMatch ? parseFloat(topeMatch[1].replace(",", ".")) : null;

  if (Object.keys(afp).length < 3) {
    throw new Error(
      "La pagina de Previred respondio pero no se reconocieron suficientes tasas AFP " +
      "(puede que haya cambiado el formato de la pagina). Actualiza las tasas a mano en " +
      "Remuneraciones > Parametros Previsionales."
    );
  }

  return { url: URL_INDICADORES, periodo: "vigente", afp, uf, utm, topeImponibleUF };
}
