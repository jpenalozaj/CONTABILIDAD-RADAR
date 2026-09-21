// Lector minimalista de .xlsx, sin dependencias externas.
//
// Por que no usar una libreria: la libreria "xlsx" de npm (SheetJS) tiene
// vulnerabilidades conocidas sin parche (Prototype Pollution, ReDoS) en la
// version publicada en el registro de npm. "exceljs" (la alternativa) no
// pudo leer una cartola bancaria real de prueba: algunos sistemas de
// reportes (comunes en bancos, ej. SSRS) generan .xlsx validos pero con
// prefijos de namespace XML (<x:workbook> en vez de <workbook>) que varias
// librerias no manejan bien. Esta implementacion usa DOMParser con
// busqueda de elementos por nombre local (ignora el prefijo) y las APIs
// nativas del navegador para descomprimir ZIP (DecompressionStream), asi
// que no depende de ninguna libreria externa ni de una convencion de
// namespace en particular.
//
// Solo implementa lo necesario para leer celdas: encontrar las hojas,
// leer sharedStrings, y devolver los valores de la primera hoja como una
// matriz de filas (1-based, con huecos como undefined donde no hay celda).

function readU16(view, off) { return view.getUint16(off, true); }
function readU32(view, off) { return view.getUint32(off, true); }

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxCommentLen = 65557; // 22 + max 65535 byte comment
  const start = Math.max(0, bytes.length - maxCommentLen);
  for (let i = bytes.length - 22; i >= start; i--) {
    if (readU32(view, i) === 0x06054b50) return i;
  }
  throw new Error("Archivo ZIP invalido: no se encontro el End Of Central Directory.");
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Devuelve un Map<nombreArchivo, Uint8Array> con el contenido ya
// descomprimido de cada entrada del ZIP.
async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOff = findEndOfCentralDirectory(bytes);
  const cdEntryCount = readU16(view, eocdOff + 10);
  let cdOff = readU32(view, eocdOff + 16);

  const files = new Map();
  const decoder = new TextDecoder("utf-8");

  for (let i = 0; i < cdEntryCount; i++) {
    if (readU32(view, cdOff) !== 0x02014b50) throw new Error("Directorio central de ZIP corrupto.");
    const method = readU16(view, cdOff + 10);
    const compSize = readU32(view, cdOff + 20);
    const nameLen = readU16(view, cdOff + 28);
    const extraLen = readU16(view, cdOff + 30);
    const commentLen = readU16(view, cdOff + 32);
    const localHeaderOff = readU32(view, cdOff + 42);
    const name = decoder.decode(bytes.subarray(cdOff + 46, cdOff + 46 + nameLen));

    // Cabecera local: puede tener nombre/extra de largo distinto al del
    // directorio central, hay que leerla para saber donde empiezan los
    // datos reales.
    const lFlags = readU16(view, localHeaderOff + 6);
    const lNameLen = readU16(view, localHeaderOff + 26);
    const lExtraLen = readU16(view, localHeaderOff + 28);
    const dataStart = localHeaderOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith("/")) {
      if (method === 0) files.set(name, raw);
      else if (method === 8) files.set(name, await inflateRaw(raw));
      else throw new Error(`Metodo de compresion ZIP no soportado (${method}) en ${name}.`);
    }
    void lFlags; // no se usan flags de data-descriptor: confiamos en el directorio central
    cdOff += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseXml(bytes) {
  const text = new TextDecoder("utf-8").decode(bytes);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("XML invalido dentro del .xlsx: " + err.textContent.slice(0, 200));
  return doc;
}

// Busca elementos hijos directos por nombre local, sin importar el
// prefijo de namespace (ej. sirve igual para <row> que para <x:row>).
function childrenByLocalName(el, localName) {
  return Array.from(el.children).filter((c) => c.localName === localName);
}
function childByLocalName(el, localName) {
  return childrenByLocalName(el, localName)[0] || null;
}

function parseSharedStrings(doc) {
  if (!doc) return [];
  const root = doc.documentElement;
  return childrenByLocalName(root, "si").map((si) => {
    const direct = childByLocalName(si, "t");
    if (direct) return direct.textContent;
    return childrenByLocalName(si, "r")
      .map((r) => childByLocalName(r, "t")?.textContent || "")
      .join("");
  });
}

// "A1" -> {col: 1, row: 1} (col 1-based, letras base-26)
function decodeCellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  const [, letters, rowStr] = m;
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { col, row: parseInt(rowStr, 10) };
}

function parseSheetRows(doc, sharedStrings) {
  const sheetData = doc.getElementsByTagNameNS("*", "sheetData")[0] || doc.documentElement.querySelector("*|sheetData");
  const dataEl = sheetData || Array.from(doc.documentElement.children).find((c) => c.localName === "sheetData");
  if (!dataEl) return [];

  const rows = [];
  for (const rowEl of childrenByLocalName(dataEl, "row")) {
    const rowNum = parseInt(rowEl.getAttribute("r"), 10);
    const rowArr = rows[rowNum] || (rows[rowNum] = []);
    for (const cEl of childrenByLocalName(rowEl, "c")) {
      const ref = cEl.getAttribute("r");
      const pos = ref ? decodeCellRef(ref) : null;
      if (!pos) continue;
      const type = cEl.getAttribute("t");
      let value;
      if (type === "inlineStr") {
        const is = childByLocalName(cEl, "is");
        value = is ? (childByLocalName(is, "t")?.textContent ?? "") : "";
      } else {
        const vEl = childByLocalName(cEl, "v");
        const raw = vEl ? vEl.textContent : "";
        if (type === "s") value = sharedStrings[parseInt(raw, 10)] ?? "";
        else if (type === "str" || type === "b") value = raw;
        else value = raw === "" ? undefined : Number(raw);
      }
      rowArr[pos.col] = value;
    }
  }
  return rows;
}

// Devuelve { sheetNames: string[], rowsByName: Map<string, Array<Array>> }
// rowsByName[hoja] es 1-based tanto en fila como en columna (rows[1][1] es A1).
export async function readXlsxLite(arrayBuffer) {
  const files = await unzip(arrayBuffer);

  const workbookXml = files.get("xl/workbook.xml");
  if (!workbookXml) throw new Error("No parece un archivo .xlsx valido (falta xl/workbook.xml).");
  const workbookDoc = parseXml(workbookXml);

  const relsXml = files.get("xl/_rels/workbook.xml.rels");
  const relsDoc = relsXml ? parseXml(relsXml) : null;
  const relTargetById = {};
  if (relsDoc) {
    for (const rel of Array.from(relsDoc.documentElement.children)) {
      relTargetById[rel.getAttribute("Id")] = rel.getAttribute("Target");
    }
  }

  const sheetsEl = childByLocalName(workbookDoc.documentElement, "sheets");
  const sheetEls = sheetsEl ? childrenByLocalName(sheetsEl, "sheet") : [];
  const sheets = sheetEls.map((s) => {
    const name = s.getAttribute("name");
    const rId = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = rId ? relTargetById[rId] : null;
    if (!target) target = "worksheets/sheet1.xml"; // fallback razonable
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.?\//, "");
    return { name, path };
  });
  if (sheets.length === 0) throw new Error("El archivo no tiene hojas listadas en xl/workbook.xml.");

  const sstXml = files.get("xl/sharedStrings.xml");
  const sharedStrings = sstXml ? parseSharedStrings(parseXml(sstXml)) : [];

  const rowsByName = new Map();
  for (const sh of sheets) {
    const sheetXml = files.get(sh.path) || files.get("xl/worksheets/sheet.xml");
    if (!sheetXml) continue;
    rowsByName.set(sh.name, parseSheetRows(parseXml(sheetXml), sharedStrings));
  }
  return { sheetNames: sheets.map((s) => s.name), rowsByName };
}
