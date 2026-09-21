// Normaliza un RUT chileno a solo digitos + DV (sin puntos, guion, ni
// ceros a la izquierda), para poder comparar RUTs que vienen en formatos
// distintos (CSV del SII, glosa de cartola, etc.) con un simple ===.
export function normRut(s) {
  return (s || "").toString().toUpperCase().replace(/[^0-9K]/g, "").replace(/^0+(?=\d)/, "");
}
