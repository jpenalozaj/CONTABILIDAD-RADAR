import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./lib/supabaseClient";
import { loadCollection, saveCollection } from "./lib/sync";
import { normRut } from "./lib/rut";
import { parseCartolaSantander, decodeRutFromGlosa } from "./lib/cartola";
import { yaContabilizado, sugerirContraparte, armarAsiento } from "./lib/conciliacion";

const ST = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#050A18;--sf:#0C1425;--sf2:#111D35;--bd:#1A2744;--bd2:#243352;--tx:#E2E8F0;--tx2:#94A3B8;--tx3:#64748B;--cy:#06B6D4;--cy2:#0E7490;--cyg:rgba(6,182,212,.15);--gn:#10B981;--am:#F59E0B;--rd:#EF4444;--pu:#8B5CF6;--r:12px;--rs:8px}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--tx)}
input,select,textarea{font-family:inherit;background:var(--sf);border:1px solid var(--bd);color:var(--tx);border-radius:var(--rs);padding:10px 14px;font-size:13px;outline:none;width:100%;transition:border-color .2s}
input:focus,select:focus,textarea:focus{border-color:var(--cy);box-shadow:0 0 0 3px var(--cyg)}
input::placeholder,textarea::placeholder{color:var(--tx3)}
select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:16px;padding-right:36px}
textarea{resize:vertical;min-height:80px}button{font-family:inherit;cursor:pointer}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
@keyframes rpulse{0%,100%{opacity:1}50%{opacity:.4}}
.rpt-print-head{display:none}
/* El look formal (papel blanco, encabezado tipo carta) solo se ve al
   exportar a PDF -- en pantalla los reportes se quedan con el tema
   oscuro normal de RADAR, sin tocar nada. */
@media print{
  @page{size:landscape;margin:12mm}
  body *{visibility:hidden}
  .report,.report *{visibility:visible}
  .report{position:absolute;left:0;top:0;width:100%;padding:0;box-shadow:none}
  .no-print{display:none!important}
  .report,.report *{background:#fff!important;color:#000!important;border-color:#ccc!important;box-shadow:none!important}
  .rpt-print-head{display:block!important;text-align:center;padding:0 0 16px;border-bottom:2px solid #333;margin-bottom:18px}
  .rpt-print-head .rpt-co{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700}
  .rpt-print-head .rpt-rut{font-size:11px;margin-top:3px}
  .rpt-print-head .rpt-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:12px}
  .rpt-print-head .rpt-sub{font-size:11px;margin-top:4px}
  table{page-break-inside:avoid;font-size:11px!important}
  th,td{padding:5px 8px!important}
  .rpt-stats{display:flex!important;border-top:1px solid #333;border-bottom:1px solid #333;padding:10px 0!important;margin-bottom:18px!important;gap:0!important}
  .rpt-stat{flex:1;background:transparent!important;border:none!important;border-radius:0!important;padding:0 12px!important;border-right:1px solid #ccc!important;text-align:center}
  .rpt-stat:last-child{border-right:none!important}
}`;

function ld(k,fb){try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb}catch{return fb}}
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.error(e)}}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const SVCS=[{id:"contabilidad",label:"Contabilidad",icon:"\u{1F4CA}",color:"#06B6D4"},{id:"tributario",label:"Tributario",icon:"\u{1F4CB}",color:"#8B5CF6"},{id:"auditoria",label:"Auditor\u00eda",icon:"\u{1F50D}",color:"#F59E0B"},{id:"remuneraciones",label:"Remuneraciones",icon:"\u{1F465}",color:"#10B981"},{id:"consultoria",label:"Consultor\u00eda",icon:"\u{1F4A1}",color:"#EC4899"},{id:"compliance",label:"Compliance",icon:"\u{1F6E1}",color:"#6366F1"}];
const REGS=["Pro Pyme General (14 D N\u00b03)","Pro Pyme Transparente (14 D N\u00b08)","Semi Integrado (14 A)","Renta Presunta (34)","Otro"];
const ETYPES=[{id:"renta",label:"RADAR Renta (F22)",icon:"\u{1F4CB}",color:"#8B5CF6",desc:"Revision integral del F22 - ultimos 5 anos tributarios"},{id:"tributario",label:"RADAR Tributario",icon:"\u2696\uFE0F",color:"#06B6D4",desc:"Cumplimiento F29, DJ, situacion tributaria"},{id:"financiero",label:"RADAR Financiero",icon:"\u{1F4CA}",color:"#10B981",desc:"Liquidez, endeudamiento, rentabilidad, capital de trabajo"},{id:"auditoria",label:"RADAR Auditoria",icon:"\u{1F50D}",color:"#F59E0B",desc:"Planificacion, riesgos, COSO",soon:true},{id:"360",label:"RADAR 360",icon:"\u{1F3AF}",color:"#EF4444",desc:"Diagnostico completo - todas las areas"}];
const CY=new Date().getFullYear();
const ATY=[CY,CY-1,CY-2,CY-3,CY-4];
const IC={
  radar:<svg viewBox="0 0 32 32" style={{width:32,height:32}}><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".3"/><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".5"/><circle cx="16" cy="16" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".7"/><line x1="16" y1="16" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>,
  home:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>,
  emp:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-16 0H3"/></svg>,
  eval:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" opacity=".5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>,
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:20,height:20}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>,
  arrow:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><polyline points="9 18 15 12 9 6"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:16,height:16}}><polyline points="20 6 9 17 4 12"/></svg>,
  search:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:16,height:16}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  menu:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:24,height:24}}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  edit:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:16,height:16}}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  contab:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>,
};

// Default Chart of Accounts (Chilean NIIF - 4 Niveles: Clase / Grupo / Clasificacion / Cuenta)
const DFLT_ACCTS=[
  {cd:"1",nm:"ACTIVOS",tp:"asset",lv:1},
  {cd:"1.1",nm:"Activo Corriente",tp:"asset",lv:2},
  {cd:"1.1.01",nm:"Disponible",tp:"asset",lv:3},
  {cd:"1.1.01.001",nm:"Caja General",tp:"asset",lv:4},
  {cd:"1.1.01.002",nm:"Caja Chica",tp:"asset",lv:4},
  {cd:"1.1.01.003",nm:"Banco Estado Cta Cte",tp:"asset",lv:4},
  {cd:"1.1.01.004",nm:"Banco Chile Cta Cte",tp:"asset",lv:4},
  {cd:"1.1.02",nm:"Deudores",tp:"asset",lv:3},
  {cd:"1.1.02.001",nm:"Clientes (Ctas x Cobrar)",tp:"asset",lv:4},
  {cd:"1.1.02.002",nm:"Documentos por Cobrar",tp:"asset",lv:4},
  {cd:"1.1.02.003",nm:"Deudores Varios",tp:"asset",lv:4},
  {cd:"1.1.03",nm:"Impuestos por Recuperar",tp:"asset",lv:3},
  {cd:"1.1.03.001",nm:"IVA Credito Fiscal",tp:"asset",lv:4},
  {cd:"1.1.03.002",nm:"PPM por Recuperar",tp:"asset",lv:4},
  {cd:"1.1.04",nm:"Existencias",tp:"asset",lv:3},
  {cd:"1.1.04.001",nm:"Materias Primas",tp:"asset",lv:4},
  {cd:"1.1.04.002",nm:"Productos Terminados",tp:"asset",lv:4},
  {cd:"1.1.04.003",nm:"Productos en Proceso",tp:"asset",lv:4},
  {cd:"1.1.05",nm:"Gastos Anticipados",tp:"asset",lv:3},
  {cd:"1.1.05.001",nm:"Gastos por Clasificar",tp:"asset",lv:4},
  {cd:"1.2",nm:"Activo No Corriente",tp:"asset",lv:2},
  {cd:"1.2.01",nm:"Activo Fijo",tp:"asset",lv:3},
  {cd:"1.2.01.001",nm:"Terrenos",tp:"asset",lv:4},
  {cd:"1.2.01.002",nm:"Edificios",tp:"asset",lv:4},
  {cd:"1.2.01.003",nm:"Maquinaria y Equipos",tp:"asset",lv:4},
  {cd:"1.2.01.004",nm:"Vehiculos",tp:"asset",lv:4},
  {cd:"1.2.01.005",nm:"Muebles y Utiles",tp:"asset",lv:4},
  {cd:"1.2.01.006",nm:"Equipos Computacionales",tp:"asset",lv:4},
  {cd:"1.2.02",nm:"Depreciacion Acumulada",tp:"asset",lv:3},
  {cd:"1.2.02.001",nm:"Dep Acum Edificios",tp:"asset",lv:4},
  {cd:"1.2.02.002",nm:"Dep Acum Maquinaria",tp:"asset",lv:4},
  {cd:"1.2.02.003",nm:"Dep Acum Vehiculos",tp:"asset",lv:4},
  {cd:"1.2.02.004",nm:"Dep Acum Muebles",tp:"asset",lv:4},
  {cd:"1.2.02.005",nm:"Dep Acum Eq Comp",tp:"asset",lv:4},
  {cd:"1.2.03",nm:"Intangibles",tp:"asset",lv:3},
  {cd:"1.2.03.001",nm:"Software y Licencias",tp:"asset",lv:4},
  {cd:"1.2.03.002",nm:"Marcas y Patentes",tp:"asset",lv:4},
  {cd:"1.2.04",nm:"Inversiones",tp:"asset",lv:3},
  {cd:"1.2.04.001",nm:"Inversiones en Empresas Relacionadas",tp:"asset",lv:4},
  {cd:"1.2.04.002",nm:"Otras Inversiones Financieras",tp:"asset",lv:4},
  {cd:"2",nm:"PASIVOS",tp:"liability",lv:1},
  {cd:"2.1",nm:"Pasivo Corriente",tp:"liability",lv:2},
  {cd:"2.1.01",nm:"Cuentas por Pagar",tp:"liability",lv:3},
  {cd:"2.1.01.001",nm:"Proveedores",tp:"liability",lv:4},
  {cd:"2.1.01.002",nm:"Documentos por Pagar",tp:"liability",lv:4},
  {cd:"2.1.01.003",nm:"Acreedores Varios",tp:"liability",lv:4},
  {cd:"2.1.02",nm:"Impuestos por Pagar",tp:"liability",lv:3},
  {cd:"2.1.02.001",nm:"IVA Debito Fiscal",tp:"liability",lv:4},
  {cd:"2.1.02.002",nm:"Retencion Honorarios",tp:"liability",lv:4},
  {cd:"2.1.02.003",nm:"Retencion Imp Unico",tp:"liability",lv:4},
  {cd:"2.1.02.004",nm:"Impuesto Renta por Pagar",tp:"liability",lv:4},
  {cd:"2.1.02.005",nm:"PPM por Pagar",tp:"liability",lv:4},
  {cd:"2.1.03",nm:"Remuneraciones y Cotizaciones por Pagar",tp:"liability",lv:3},
  {cd:"2.1.03.001",nm:"Remuneraciones por Pagar",tp:"liability",lv:4},
  {cd:"2.1.03.002",nm:"AFP por Pagar",tp:"liability",lv:4},
  {cd:"2.1.03.003",nm:"Salud por Pagar",tp:"liability",lv:4},
  {cd:"2.1.03.004",nm:"Seg Cesantia por Pagar",tp:"liability",lv:4},
  {cd:"2.1.03.005",nm:"Mutual por Pagar",tp:"liability",lv:4},
  {cd:"2.2",nm:"Pasivo No Corriente",tp:"liability",lv:2},
  {cd:"2.2.01",nm:"Obligaciones Financieras L/P",tp:"liability",lv:3},
  {cd:"2.2.01.001",nm:"Prestamos Bancarios L/P",tp:"liability",lv:4},
  {cd:"3",nm:"PATRIMONIO",tp:"equity",lv:1},
  {cd:"3.1",nm:"Capital",tp:"equity",lv:2},
  {cd:"3.1.01",nm:"Capital Social",tp:"equity",lv:3},
  {cd:"3.1.01.001",nm:"Capital Pagado",tp:"equity",lv:4},
  {cd:"3.1.02",nm:"Resultados",tp:"equity",lv:3},
  {cd:"3.1.02.001",nm:"Reservas",tp:"equity",lv:4},
  {cd:"3.1.02.002",nm:"Resultados Acumulados",tp:"equity",lv:4},
  {cd:"3.1.02.003",nm:"Resultado del Ejercicio",tp:"equity",lv:4},
  {cd:"3.1.02.004",nm:"Retiros / Dividendos",tp:"equity",lv:4},
  {cd:"4",nm:"INGRESOS",tp:"income",lv:1},
  {cd:"4.1",nm:"Ingresos de Explotacion",tp:"income",lv:2},
  {cd:"4.1.01",nm:"Ventas",tp:"income",lv:3},
  {cd:"4.1.01.001",nm:"Ventas de Bienes",tp:"income",lv:4},
  {cd:"4.1.01.002",nm:"Ingresos por Servicios",tp:"income",lv:4},
  {cd:"4.1.01.003",nm:"Descuentos sobre Ventas",tp:"income",lv:4},
  {cd:"4.2",nm:"Otros Ingresos",tp:"income",lv:2},
  {cd:"4.2.01",nm:"No Operacionales",tp:"income",lv:3},
  {cd:"4.2.01.001",nm:"Ingresos Financieros",tp:"income",lv:4},
  {cd:"4.2.01.002",nm:"Otros Ingresos No Operacionales",tp:"income",lv:4},
  {cd:"5",nm:"GASTOS Y COSTOS",tp:"expense",lv:1},
  {cd:"5.1",nm:"Costos de Explotacion",tp:"expense",lv:2},
  {cd:"5.1.01",nm:"Costo de Ventas",tp:"expense",lv:3},
  {cd:"5.1.01.001",nm:"Costo de Mercaderia Vendida",tp:"expense",lv:4},
  {cd:"5.2",nm:"Gastos de Administracion",tp:"expense",lv:2},
  {cd:"5.2.01",nm:"Remuneraciones",tp:"expense",lv:3},
  {cd:"5.2.01.001",nm:"Sueldos y Salarios",tp:"expense",lv:4},
  {cd:"5.2.01.002",nm:"Gratificaciones",tp:"expense",lv:4},
  {cd:"5.2.01.003",nm:"Horas Extraordinarias",tp:"expense",lv:4},
  {cd:"5.2.01.004",nm:"Colacion y Movilizacion",tp:"expense",lv:4},
  {cd:"5.2.01.005",nm:"Costo Previsional Empleador",tp:"expense",lv:4},
  {cd:"5.2.02",nm:"Honorarios y Servicios Profesionales",tp:"expense",lv:3},
  {cd:"5.2.02.001",nm:"Honorarios",tp:"expense",lv:4},
  {cd:"5.2.03",nm:"Gastos Generales",tp:"expense",lv:3},
  {cd:"5.2.03.001",nm:"Arriendo de Oficina",tp:"expense",lv:4},
  {cd:"5.2.03.002",nm:"Materiales de Oficina",tp:"expense",lv:4},
  {cd:"5.2.03.003",nm:"Gastos de Representacion",tp:"expense",lv:4},
  {cd:"5.2.03.004",nm:"Seguros",tp:"expense",lv:4},
  {cd:"5.2.04",nm:"Servicios Basicos",tp:"expense",lv:3},
  {cd:"5.2.04.001",nm:"Electricidad",tp:"expense",lv:4},
  {cd:"5.2.04.002",nm:"Agua",tp:"expense",lv:4},
  {cd:"5.2.04.003",nm:"Internet / Telefono",tp:"expense",lv:4},
  {cd:"5.2.05",nm:"Depreciacion",tp:"expense",lv:3},
  {cd:"5.2.05.001",nm:"Depreciacion del Ejercicio",tp:"expense",lv:4},
  {cd:"5.3",nm:"Gastos Financieros",tp:"expense",lv:2},
  {cd:"5.3.01",nm:"Gastos Financieros",tp:"expense",lv:3},
  {cd:"5.3.01.001",nm:"Intereses Pagados",tp:"expense",lv:4},
  {cd:"5.3.01.002",nm:"Comisiones Bancarias",tp:"expense",lv:4},
];

// F22 engine
function mkQ(y){return[
  {id:"e_"+y,text:"AT "+y+" - Estado del F22?",type:"select",opts:[{v:"aceptada",l:"Aceptada"},{v:"observada",l:"Observada"},{v:"no_presentada",l:"No presentada"}],nx:v=>v==="aceptada"?null:v==="no_presentada"?"npm_"+y:"dv_"+y},
  {id:"npm_"+y,text:"AT "+y+" - Por que no fue presentada?",type:"text",nx:()=>"npa_"+y},
  {id:"npa_"+y,text:"AT "+y+" - Accion recomendada?",type:"select",opts:[{v:"presentar",l:"Presentar"},{v:"rectificar",l:"Rectificar"},{v:"evaluar",l:"Evaluar con cliente"},{v:"no_aplica",l:"No aplica"}],nx:()=>null},
  {id:"dv_"+y,text:"AT "+y+" - Hubo solicitud de devolucion?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"}],nx:v=>v==="si"?"edv_"+y:"liq_"+y},
  {id:"edv_"+y,text:"AT "+y+" - Estado de la devolucion?",type:"select",opts:[{v:"dev_total",l:"Devuelta total"},{v:"dev_parcial",l:"Devuelta parcial"},{v:"ret_total",l:"Retenida total"},{v:"ret_parcial",l:"Retenida parcial"},{v:"pendiente",l:"Pendiente"}],nx:v=>v==="dev_total"?"rdp_"+y:v==="dev_parcial"?"md_"+y:(v==="ret_total"||v==="ret_parcial")?"res_"+y:"dvo_"+y},
  {id:"rdp_"+y,text:"AT "+y+" - Fue retenida posteriormente?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"}],nx:v=>v==="si"?"res_"+y:"liq_"+y},
  {id:"md_"+y,text:"AT "+y+" - Monto devuelto ($)",type:"number",nx:()=>"mr_"+y},
  {id:"mr_"+y,text:"AT "+y+" - Monto retenido ($)",type:"number",nx:()=>"mtr_"+y},
  {id:"mtr_"+y,text:"AT "+y+" - Motivo de la retencion",type:"text",nx:()=>"res_"+y},
  {id:"dvo_"+y,text:"AT "+y+" - Observaciones estado pendiente",type:"text",nx:()=>"liq_"+y},
  {id:"res_"+y,text:"AT "+y+" - Existe resolucion del SII?",type:"select",opts:[{v:"fav",l:"Si - Favorable"},{v:"desf",l:"Si - Desfavorable"},{v:"parc",l:"Si - Parcialmente favorable"},{v:"no",l:"No - Sin resolucion"}],nx:v=>v==="no"?"plz_"+y:v==="fav"?"liq_"+y:"rec_"+y},
  {id:"plz_"+y,text:"AT "+y+" - Plazo estimado o acciones pendientes?",type:"text",nx:()=>"liq_"+y},
  {id:"rec_"+y,text:"AT "+y+" - Se presento reclamo (RAV/RAF)?",type:"select",opts:[{v:"rav",l:"Si - RAV"},{v:"raf",l:"Si - RAF"},{v:"tta",l:"Si - Reclamo TTA"},{v:"no",l:"No"},{v:"evaluar",l:"Pendiente de evaluar"}],nx:v=>(v==="no"||v==="evaluar")?"liq_"+y:"erc_"+y},
  {id:"erc_"+y,text:"AT "+y+" - Estado del recurso/reclamo?",type:"select",opts:[{v:"proceso",l:"En proceso"},{v:"favor",l:"Resuelto a favor"},{v:"contra",l:"Resuelto en contra"},{v:"desist",l:"Desistido"}],nx:()=>"liq_"+y},
  {id:"liq_"+y,text:"AT "+y+" - Existe liquidacion o giro asociado?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"}],nx:v=>v==="si"?"mliq_"+y:"cont_"+y},
  {id:"mliq_"+y,text:"AT "+y+" - Monto liquidacion/giro ($)",type:"number",nx:()=>"lraf_"+y},
  {id:"lraf_"+y,text:"AT "+y+" - Se presento RAF/RAV contra la liquidacion?",type:"select",opts:[{v:"raf",l:"Si - RAF"},{v:"rav",l:"Si - RAV"},{v:"no",l:"No"},{v:"evaluar",l:"Pendiente"}],nx:()=>"cont_"+y},
  {id:"cont_"+y,text:"AT "+y+" - Contingencia estimada ($)",type:"number",nx:()=>"obs_"+y},
  {id:"obs_"+y,text:"AT "+y+" - Observaciones del profesional",type:"textarea",ph:"Analisis, conclusiones, recomendaciones...",nx:()=>null},
]}
function visQ(qs,r){const v=[];if(!qs.length)return v;v.push(qs[0]);let c=qs[0];while(c){const rv=r[c.id];if(rv===undefined||rv===""||rv===null)break;const ni=c.nx?c.nx(rv):null;if(!ni)break;const nq=qs.find(q=>q.id===ni);if(!nq)break;v.push(nq);c=nq}return v}
function ySt(y,r){const e=r["e_"+y];if(!e)return{s:"pend",l:"Sin evaluar",c:"#64748B"};if(e==="aceptada")return{s:"ok",l:"Aceptada",c:"#10B981"};if(e==="no_presentada")return{s:"alert",l:"No presentada",c:"#EF4444"};if(r["obs_"+y])return{s:"rev",l:"Observada - Revisada",c:"#F59E0B"};return{s:"proc",l:"Observada - En revision",c:"#F59E0B"}}

function Dashboard({session}){
  const userId=session.user.id;
  const [rdy,setRdy]=useState(false);
  const [pg,setPg]=useState("inicio");
  const [emps,setEmps]=useState([]);
  const [evs,setEvs]=useState([]);
  const [aEmp,setAEmp]=useState(null);
  const [log,setLog]=useState([]);
  const [accts,setAccts]=useState([]);
  const [entries,setEntries]=useState([]);
  const [rems,setRems]=useState([]);
  const [docs,setDocs]=useState([]);
  const [tareas,setTareas]=useState([]);
  const [sb,setSb]=useState(false);
  const prevIds=useRef({e:new Set(),v:new Set(),l:new Set(),a:new Set(),en:new Set(),rm:new Set(),dc:new Set(),ta:new Set()});
  useEffect(()=>{let cancelled=false;(async()=>{
    const[e,v,l,a,en,rm,dc,ta]=await Promise.all([
      loadCollection(userId,"empresas",[]),
      loadCollection(userId,"evaluaciones",[]),
      loadCollection(userId,"log",[]),
      loadCollection(userId,"plan_cuentas",DFLT_ACCTS),
      loadCollection(userId,"entries",[]),
      loadCollection(userId,"remuneraciones",[]),
      loadCollection(userId,"documentos",[]),
      loadCollection(userId,"tareas",[]),
    ]);
    if(cancelled)return;
    prevIds.current={
      e:new Set(e.map(x=>String(x.id))),v:new Set(v.map(x=>String(x.id))),l:new Set(l.map(x=>String(x.id))),
      a:new Set(a.map(x=>String(x.cd))),en:new Set(en.map(x=>String(x.id))),rm:new Set(rm.map(x=>String(x.id))),
      dc:new Set(dc.map(x=>String(x.id))),ta:new Set(ta.map(x=>String(x.id))),
    };
    setEmps(e);setEvs(v);setLog(l);setAccts(a);setEntries(en);setRems(rm);setDocs(dc);setTareas(ta);
    if(e.length>0)setAEmp(e[0].id);setRdy(true);
  })();return()=>{cancelled=true}},[userId]);
  useEffect(()=>{if(rdy)saveCollection(userId,"empresas",emps,prevIds.current.e).then(s=>prevIds.current.e=s)},[emps,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"evaluaciones",evs,prevIds.current.v).then(s=>prevIds.current.v=s)},[evs,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"log",log,prevIds.current.l).then(s=>prevIds.current.l=s)},[log,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"plan_cuentas",accts,prevIds.current.a,"cd").then(s=>prevIds.current.a=s)},[accts,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"entries",entries,prevIds.current.en).then(s=>prevIds.current.en=s)},[entries,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"remuneraciones",rems,prevIds.current.rm).then(s=>prevIds.current.rm=s)},[rems,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"documentos",docs,prevIds.current.dc).then(s=>prevIds.current.dc=s)},[docs,rdy]);
  useEffect(()=>{if(rdy)saveCollection(userId,"tareas",tareas,prevIds.current.ta).then(s=>prevIds.current.ta=s)},[tareas,rdy]);
  const aLog=(a,d)=>setLog(p=>[{id:uid(),time:new Date().toISOString(),action:a,detail:d},...p].slice(0,50));
  const eObj=useMemo(()=>emps.find(e=>e.id===aEmp),[emps,aEmp]);
  const eEvs=useMemo(()=>evs.filter(e=>e.empresaId===aEmp),[evs,aEmp]);
  const empEntries=useMemo(()=>entries.filter(e=>e.empresaId===aEmp),[entries,aEmp]);
  const empRems=useMemo(()=>rems.filter(r=>r.empresaId===aEmp),[rems,aEmp]);
  const empDocs=useMemo(()=>docs.filter(d=>d.empresaId===aEmp),[docs,aEmp]);
  const empTareas=useMemo(()=>tareas.filter(t=>t.empresaId===aEmp),[tareas,aEmp]);
  const leafAccts=useMemo(()=>accts.filter(a=>!accts.some(b=>b.cd!==a.cd&&b.cd.startsWith(a.cd+"."))),[accts]);
  const remIcon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
  const docIcon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  const planIcon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
  const portalIcon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>;
  const nav=[{id:"inicio",label:"Inicio",icon:IC.home},{id:"empresas",label:"Empresas",icon:IC.emp},{id:"radar",label:"RADAR",icon:IC.eval},{id:"contabilidad",label:"Contabilidad",icon:IC.contab},{id:"remuneraciones",label:"Remuneraciones",icon:remIcon},{id:"documentos",label:"Documentos",icon:docIcon},{id:"planificacion",label:"Planificacion",icon:planIcon},{id:"portal",label:"Portal Cliente",icon:portalIcon}];
  const go=p=>{if(!nav.find(n=>n.id===p)?.soon){setPg(p);setSb(false)}};
  if(!rdy)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#050A18"}}><div style={{textAlign:"center",color:"#06B6D4"}}><div style={{fontSize:24,fontWeight:800,letterSpacing:6}}>RADAR</div><div style={{fontSize:12,color:"#64748B",marginTop:8}}>Cargando...</div></div></div>;
  return(<><style>{ST}</style><div style={{display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg)"}}>
    {sb&&<div onClick={()=>setSb(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:40}}/>}
    <aside className="rsb" style={{position:"fixed",zIndex:50,top:0,bottom:0,left:0,width:260,background:"var(--sf)",borderRight:"1px solid var(--bd)",display:"flex",flexDirection:"column",transform:sb?"translateX(0)":"translateX(-100%)",transition:"transform .25s"}}>
      <div style={{padding:"24px 20px 20px",borderBottom:"1px solid var(--bd)"}}><div style={{display:"flex",alignItems:"center",gap:12}}><div style={{color:"var(--cy)"}}>{IC.radar}</div><div><div style={{fontSize:18,fontWeight:800,letterSpacing:4,color:"var(--cy)"}}>RADAR</div><div style={{fontSize:10,color:"var(--tx3)",letterSpacing:1}}>INTELIGENCIA EMPRESARIAL</div></div></div></div>
      {emps.length>0&&<div style={{padding:"16px 16px 8px"}}><div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:"var(--tx3)",marginBottom:8,paddingLeft:4}}>Empresa Activa</div><select value={aEmp||""} onChange={e=>setAEmp(e.target.value)} style={{fontSize:12,padding:"8px 12px",background:"var(--sf2)"}}>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>}
      <nav style={{flex:1,padding:12,overflowY:"auto"}}><div style={{display:"flex",flexDirection:"column",gap:2}}>{nav.map(n=><button key={n.id} onClick={()=>go(n.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:"var(--rs)",border:"none",width:"100%",textAlign:"left",fontSize:13,fontWeight:pg===n.id?600:400,background:pg===n.id?"var(--cyg)":"transparent",color:pg===n.id?"var(--cy)":n.soon?"var(--tx3)":"var(--tx2)",opacity:n.soon?.5:1,cursor:n.soon?"default":"pointer"}}>{n.icon}<span>{n.label}</span>{n.soon&&<span style={{marginLeft:"auto",fontSize:9,background:"var(--bd)",padding:"2px 6px",borderRadius:4,color:"var(--tx3)"}}>Pronto</span>}</button>)}</div></nav>
      <div style={{padding:"14px 20px",borderTop:"1px solid var(--bd)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{fontSize:10,color:"var(--tx3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={session.user.email}>{session.user.email}</div>
        <button onClick={()=>supabase.auth.signOut()} style={{background:"none",border:"none",color:"var(--tx3)",fontSize:10,cursor:"pointer",flexShrink:0,padding:0}}>Salir</button>
      </div>
    </aside>
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
      <header style={{display:"flex",alignItems:"center",gap:12,padding:"0 20px",height:56,minHeight:56,background:"var(--sf)",borderBottom:"1px solid var(--bd)"}}><button onClick={()=>setSb(true)} style={{background:"none",border:"none",color:"var(--tx2)",padding:4}}>{IC.menu}</button><h1 style={{fontSize:15,fontWeight:600}}>{nav.find(n=>n.id===pg)?.label||"RADAR"}</h1>{eObj&&pg!=="empresas"&&pg!=="inicio"&&<span style={{marginLeft:"auto",fontSize:11,padding:"4px 14px",borderRadius:20,background:"var(--cyg)",color:"var(--cy)",border:"1px solid var(--cy2)",fontWeight:500}}>{eObj.name}</span>}</header>
      <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
        {pg==="inicio"&&<HomeP emps={emps} eObj={eObj} evs={evs} log={log}/>}
        {pg==="empresas"&&<EmpP emps={emps} setEmps={setEmps} aEmp={aEmp} setAEmp={setAEmp} aLog={aLog}/>}
        {pg==="radar"&&<RadP eObj={eObj} evs={evs} setEvs={setEvs} eEvs={eEvs} aLog={aLog} go={go}/>}
        {pg==="contabilidad"&&<ContabP eObj={eObj} accts={accts} setAccts={setAccts} entries={entries} setEntries={setEntries} empEntries={empEntries} leafAccts={leafAccts} aLog={aLog} go={go}/>}
        {pg==="remuneraciones"&&<RemP eObj={eObj} rems={rems} setRems={setRems} empRems={empRems} entries={entries} setEntries={setEntries} empEntries={empEntries} leafAccts={leafAccts} aLog={aLog} go={go}/>}
        {pg==="documentos"&&<DocsP eObj={eObj} docs={docs} setDocs={setDocs} empDocs={empDocs} aLog={aLog} go={go}/>}
        {pg==="planificacion"&&<PlanP eObj={eObj} tareas={tareas} setTareas={setTareas} empTareas={empTareas} aLog={aLog} go={go}/>}
        {pg==="portal"&&<PortalP eObj={eObj} empEntries={empEntries} empDocs={empDocs} empRems={empRems} eEvs={eEvs} accts={accts} leafAccts={leafAccts} go={go}/>}
      </div>
    </div>
  </div><style>{`@media(min-width:768px){.rsb{transform:translateX(0)!important;position:static!important}}`}</style></>);
}

function AuthScreen(){
  const[mode,setMode]=useState("login");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState(null);
  const submit=async(ev)=>{
    ev.preventDefault();setBusy(true);setMsg(null);
    const{error}=mode==="login"
      ?await supabase.auth.signInWithPassword({email,password})
      :await supabase.auth.signUp({email,password});
    setBusy(false);
    if(error)setMsg({t:"err",m:error.message});
    else if(mode==="signup")setMsg({t:"ok",m:"Cuenta creada. Si tu proyecto pide confirmacion por correo, revisa tu bandeja antes de iniciar sesion."});
  };
  return(<><style>{ST}</style>
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)"}}>
      <form onSubmit={submit} style={{width:340,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24,color:"var(--cy)"}}>{IC.radar}<div style={{fontSize:18,fontWeight:800,letterSpacing:4}}>RADAR</div></div>
        <div style={{display:"flex",gap:6,marginBottom:20,background:"var(--sf2)",borderRadius:"var(--rs)",padding:4}}>
          <button type="button" onClick={()=>{setMode("login");setMsg(null)}} style={{flex:1,padding:"8px 0",borderRadius:6,border:"none",fontSize:12,fontWeight:600,background:mode==="login"?"var(--cy)":"transparent",color:mode==="login"?"#fff":"var(--tx2)"}}>Iniciar sesion</button>
          <button type="button" onClick={()=>{setMode("signup");setMsg(null)}} style={{flex:1,padding:"8px 0",borderRadius:6,border:"none",fontSize:12,fontWeight:600,background:mode==="signup"?"var(--cy)":"transparent",color:mode==="signup"?"#fff":"var(--tx2)"}}>Crear cuenta</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Correo</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@estudio.cl"/></div>
          <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Contrasena</label><input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimo 6 caracteres"/></div>
        </div>
        {msg&&<div style={{marginTop:14,fontSize:12,padding:"10px 12px",borderRadius:"var(--rs)",background:msg.t==="err"?"rgba(239,68,68,.1)":"rgba(16,185,129,.1)",color:msg.t==="err"?"var(--rd)":"var(--gn)",border:"1px solid "+(msg.t==="err"?"rgba(239,68,68,.2)":"rgba(16,185,129,.2)")}}>{msg.m}</div>}
        <button type="submit" disabled={busy} style={{marginTop:18,width:"100%",padding:"12px 0",borderRadius:"var(--rs)",border:"none",background:"var(--cy)",color:"#fff",fontWeight:600,fontSize:13,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>{busy?"Un momento...":mode==="login"?"Iniciar sesion":"Crear cuenta"}</button>
      </form>
    </div>
  </>);
}

function ConfigMissing(){
  return(<><style>{ST}</style>
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)",padding:20}}>
      <div style={{maxWidth:480,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,color:"var(--cy)"}}>{IC.radar}<div style={{fontSize:18,fontWeight:800,letterSpacing:4}}>RADAR</div></div>
        <div style={{fontSize:14,fontWeight:600,marginBottom:10}}>Falta configurar Supabase</div>
        <div style={{fontSize:13,color:"var(--tx2)",lineHeight:1.6,marginBottom:14}}>
          Crea un proyecto gratuito en supabase.com, corre <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>supabase/schema.sql</code> en su SQL Editor,
          y define <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>VITE_SUPABASE_URL</code> y <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>VITE_SUPABASE_ANON_KEY</code> en
          un archivo <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>.env</code> (mira <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>.env.example</code>).
        </div>
        <div style={{fontSize:12,color:"var(--tx3)"}}>Reinicia <code style={{background:"var(--sf2)",padding:"1px 6px",borderRadius:4}}>npm run dev</code> despues de crear el .env.</div>
      </div>
    </div>
  </>);
}

export default function App(){
  const[session,setSession]=useState(undefined);
  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const{data:sub}=supabase.auth.onAuthStateChange((_ev,s)=>setSession(s));
    return()=>sub.subscription.unsubscribe();
  },[]);
  if(!supabase)return<ConfigMissing/>;
  if(session===undefined)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#050A18"}}><div style={{textAlign:"center",color:"#06B6D4"}}><div style={{fontSize:24,fontWeight:800,letterSpacing:6}}>RADAR</div><div style={{fontSize:12,color:"#64748B",marginTop:8}}>Cargando...</div></div></div>;
  if(!session)return<AuthScreen/>;
  return<Dashboard key={session.user.id} session={session}/>;
}

function HomeP({emps,eObj,evs,log}){
  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{background:"linear-gradient(135deg,var(--sf2),var(--sf))",borderRadius:"var(--r)",border:"1px solid var(--bd)",padding:"32px 28px",marginBottom:24,position:"relative",overflow:"hidden"}}><div style={{fontSize:12,color:"var(--tx3)",marginBottom:4}}>Bienvenido a</div><div style={{fontSize:28,fontWeight:800,letterSpacing:3,color:"var(--cy)",marginBottom:8}}>RADAR</div><div style={{fontSize:13,color:"var(--tx2)",maxWidth:500}}>Plataforma de Inteligencia Empresarial</div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}}>
      {[{l:"Empresas",v:emps.length,c:"var(--cy)"},{l:"Evaluaciones",v:evs.length,c:"var(--pu)"},{l:"Contabilidad",v:emps.filter(e=>e.services?.includes("contabilidad")).length,c:"var(--gn)"}].map((s,i)=><div key={i} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 18px"}}><div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:8}}>{s.l}</div><div style={{fontSize:28,fontWeight:700,color:s.c}}>{s.v}</div></div>)}
    </div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24}}><div style={{fontSize:13,fontWeight:600,marginBottom:16}}>Actividad reciente</div>
      {log.length===0?<div style={{textAlign:"center",padding:"32px 0",color:"var(--tx3)",fontSize:13}}>Sin actividad.</div>
      :<div>{log.slice(0,8).map((l,i)=><div key={l.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",borderBottom:i<7?"1px solid var(--bd)":"none"}}><div style={{width:6,height:6,borderRadius:"50%",background:"var(--cy)",marginTop:6,flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:500}}>{l.action}</div><div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{l.detail}</div></div><div style={{fontSize:10,color:"var(--tx3)"}}>{new Date(l.time).toLocaleDateString("es-CL")}</div></div>)}</div>}
    </div>
  </div>);
}

function EmpP({emps,setEmps,aEmp,setAEmp,aLog}){
  const [vw,setVw]=useState("list");const [eid,setEid]=useState(null);const [sr,setSr]=useState("");const [fm,setFm]=useState({});
  const mt=()=>({name:"",rut:"",fantasyName:"",giro:"",regimen:"",fechaInicioAct:"",address:"",region:"",comuna:"",phone:"",email:"",services:[],repLegalName:"",repLegalRut:""});
  const tSvc=s=>setFm(p=>({...p,services:p.services.includes(s)?p.services.filter(x=>x!==s):[...p.services,s]}));
  const doSave=()=>{if(!fm.rut||!fm.name)return;if(eid){setEmps(p=>p.map(e=>e.id===eid?{...e,...fm}:e));aLog("Empresa actualizada",fm.name)}else{const n={id:uid(),...fm};setEmps(p=>[...p,n]);if(!aEmp)setAEmp(n.id);aLog("Empresa creada",fm.name)}setVw("list")};
  const doDel=id=>{const e=emps.find(x=>x.id===id);setEmps(p=>p.filter(x=>x.id!==id));if(aEmp===id)setAEmp(emps.find(x=>x.id!==id)?.id||null);aLog("Empresa eliminada",e?.name||"");setVw("list")};
  const fl=emps.filter(e=>!sr||e.name.toLowerCase().includes(sr.toLowerCase())||e.rut.includes(sr));
  const det=eid?emps.find(e=>e.id===eid):null;
  if(vw==="list")return(<div style={{maxWidth:900,margin:"0 auto"}}><div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"center"}}><div style={{flex:1,minWidth:200,position:"relative"}}><div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--tx3)"}}>{IC.search}</div><input placeholder="Buscar..." value={sr} onChange={e=>setSr(e.target.value)} style={{paddingLeft:36}}/></div><Bt onClick={()=>{setFm(mt());setEid(null);setVw("form")}} p={true}>{IC.plus} Nueva Empresa</Bt></div>
    {fl.length===0?<Ey i="🏢" t="Sin empresas" d="Crea tu primera empresa."/>
    :<div style={{display:"flex",flexDirection:"column",gap:8}}>{fl.map(e=><div key={e.id} onClick={()=>{setEid(e.id);setVw("detail")}} style={{background:"var(--sf)",border:"1px solid "+(e.id===aEmp?"var(--cy2)":"var(--bd)"),borderRadius:"var(--r)",padding:"16px 20px",display:"flex",alignItems:"center",gap:16,cursor:"pointer"}}><div style={{width:44,height:44,borderRadius:10,background:e.id===aEmp?"var(--cyg)":"var(--sf2)",border:"1px solid "+(e.id===aEmp?"var(--cy2)":"var(--bd)"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:e.id===aEmp?"var(--cy)":"var(--tx2)",flexShrink:0}}>{e.name.slice(0,2).toUpperCase()}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div><div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{e.rut}</div></div><div style={{display:"flex",gap:4}}>{(e.services||[]).slice(0,3).map(s=>{const sv=SVCS.find(x=>x.id===s);return sv?<span key={s} style={{fontSize:14}} title={sv.label}>{sv.icon}</span>:null})}</div>{IC.arrow}</div>)}</div>}
  </div>);
  if(vw==="detail"&&det)return(<div style={{maxWidth:900,margin:"0 auto"}}><Bk onClick={()=>setVw("list")}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28,marginBottom:16}}><div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}><div><div style={{fontSize:22,fontWeight:700}}>{det.name}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:4}}>{det.rut}</div></div><div style={{display:"flex",gap:8}}><Bt onClick={()=>{setFm({...mt(),...det});setEid(det.id);setVw("form")}}>{IC.edit} Editar</Bt><Bt onClick={()=>{setAEmp(det.id);aLog("Empresa activada",det.name)}} p={det.id!==aEmp}>{det.id===aEmp?"Activa":"Activar"}</Bt></div></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:20}}>{(det.services||[]).map(s=>{const sv=SVCS.find(x=>x.id===s);return sv?<Tg key={s} c={sv.color}>{sv.icon} {sv.label}</Tg>:null})}</div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}><IC2 t="General" items={[{l:"Giro",v:det.giro},{l:"Regimen",v:det.regimen},{l:"Inicio Act.",v:det.fechaInicioAct}]}/><IC2 t="Contacto" items={[{l:"Direccion",v:det.address},{l:"Region/Comuna",v:[det.region,det.comuna].filter(Boolean).join(", ")},{l:"Telefono",v:det.phone},{l:"Email",v:det.email}]}/><IC2 t="Rep. Legal" items={[{l:"Nombre",v:det.repLegalName},{l:"RUT",v:det.repLegalRut}]}/></div>
    <div style={{marginTop:24,padding:"16px 20px",borderRadius:"var(--rs)",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:600,color:"var(--rd)"}}>Eliminar empresa</div><button onClick={()=>{if(confirm("Eliminar?"))doDel(det.id)}} style={{background:"transparent",border:"1px solid var(--rd)",color:"var(--rd)",borderRadius:"var(--rs)",padding:"6px 16px",fontSize:12}}>Eliminar</button></div>
  </div>);
  return(<div style={{maxWidth:700,margin:"0 auto"}}><Bk onClick={()=>setVw("list")}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28}}><h2 style={{fontSize:18,fontWeight:700,marginBottom:24}}>{eid?"Editar":"Nueva"} Empresa</h2>
      <Sc t="Identificacion"><FG><Fi l="Razon Social *" v={fm.name} s={v=>setFm(p=>({...p,name:v}))}/><Fi l="RUT *" v={fm.rut} s={v=>setFm(p=>({...p,rut:v}))}/><Fi l="Fantasía" v={fm.fantasyName} s={v=>setFm(p=>({...p,fantasyName:v}))}/><Fi l="Giro" v={fm.giro} s={v=>setFm(p=>({...p,giro:v}))}/></FG></Sc>
      <Sc t="Tributario"><FG><div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Regimen</label><select value={fm.regimen||""} onChange={e=>setFm(p=>({...p,regimen:e.target.value}))}><option value="">Seleccionar...</option>{REGS.map(r=><option key={r} value={r}>{r}</option>)}</select></div><Fi l="Inicio Act." v={fm.fechaInicioAct} s={v=>setFm(p=>({...p,fechaInicioAct:v}))} t="date"/></FG></Sc>
      <Sc t="Contacto"><FG><Fi l="Direccion" v={fm.address} s={v=>setFm(p=>({...p,address:v}))}/><Fi l="Region" v={fm.region} s={v=>setFm(p=>({...p,region:v}))}/><Fi l="Comuna" v={fm.comuna} s={v=>setFm(p=>({...p,comuna:v}))}/><Fi l="Telefono" v={fm.phone} s={v=>setFm(p=>({...p,phone:v}))}/><Fi l="Email" v={fm.email} s={v=>setFm(p=>({...p,email:v}))}/></FG></Sc>
      <Sc t="Rep. Legal"><FG><Fi l="Nombre" v={fm.repLegalName} s={v=>setFm(p=>({...p,repLegalName:v}))}/><Fi l="RUT" v={fm.repLegalRut} s={v=>setFm(p=>({...p,repLegalRut:v}))}/></FG></Sc>
      <Sc t="Servicios"><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>{SVCS.map(sv=>{const on=fm.services?.includes(sv.id);return<button key={sv.id} onClick={()=>tSvc(sv.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:"var(--rs)",border:"1px solid "+(on?sv.color+"60":"var(--bd)"),background:on?sv.color+"10":"var(--sf2)",color:on?sv.color:"var(--tx2)",fontSize:12,fontWeight:on?600:400,textAlign:"left"}}><span style={{fontSize:18}}>{sv.icon}</span><span>{sv.label}</span>{on&&<span style={{marginLeft:"auto"}}>{IC.check}</span>}</button>})}</div></Sc>
      <div style={{display:"flex",gap:12,marginTop:28}}><Bt onClick={doSave} p={true}>{eid?"Guardar":"Crear Empresa"}</Bt><Bt onClick={()=>setVw("list")}>Cancelar</Bt></div>
    </div></div>);
}

function RadP({eObj,evs,setEvs,eEvs,aLog,go}){
  const [vw,setVw]=useState("list");const [eid,setEid]=useState(null);
  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa primero."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;
  const ae=eid?evs.find(e=>e.id===eid):null;
  const create=t=>{const et=ETYPES.find(x=>x.id===t);const n={id:uid(),empresaId:eObj.id,type:t,label:et.label,createdAt:new Date().toISOString(),status:"en_proceso",responses:{},conclusionGeneral:"",aiReport:""};setEvs(p=>[...p,n]);aLog("Evaluacion creada",et.label+" - "+eObj.name);setEid(n.id);setVw("eval")};
  const del=id=>{setEvs(p=>p.filter(e=>e.id!==id));aLog("Evaluacion eliminada","");setVw("list")};
  const upd=(id,u)=>setEvs(p=>p.map(e=>e.id===id?{...e,...u}:e));
  if(vw==="list")return(<div style={{maxWidth:900,margin:"0 auto"}}><div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"center",justifyContent:"space-between"}}><div><div style={{fontSize:15,fontWeight:600}}>Evaluaciones - {eObj.name}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{eEvs.length} evaluacion{eEvs.length!==1?"es":""}</div></div><Bt onClick={()=>setVw("new")} p={true}>{IC.plus} Nueva Evaluacion</Bt></div>
    {eEvs.length===0?<Ey i="🎯" t="Sin evaluaciones" d="Crea tu primera evaluacion RADAR."><Bt onClick={()=>setVw("new")} p={true}>Crear</Bt></Ey>
    :<div style={{display:"flex",flexDirection:"column",gap:8}}>{eEvs.map(ev=>{const et=ETYPES.find(t=>t.id===ev.type);const ans=Object.keys(ev.responses||{}).length;return<div key={ev.id} onClick={()=>{setEid(ev.id);setVw("eval")}} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}><div style={{fontSize:28}}>{et?.icon||"📋"}</div><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{ev.label}</div><div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{new Date(ev.createdAt).toLocaleDateString("es-CL")} - {ans} respuestas</div></div><span style={{fontSize:10,padding:"4px 12px",borderRadius:20,fontWeight:600,background:ev.status==="completada"?"rgba(16,185,129,.15)":"rgba(245,158,11,.15)",color:ev.status==="completada"?"var(--gn)":"var(--am)"}}>{ev.status==="completada"?"Completada":"En proceso"}</span>{IC.arrow}</div>})}</div>}
  </div>);
  if(vw==="new")return(<div style={{maxWidth:700,margin:"0 auto"}}><Bk onClick={()=>setVw("list")}>Volver</Bk><h2 style={{fontSize:18,fontWeight:700,marginBottom:24}}>Nueva Evaluacion - {eObj.name}</h2>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>{ETYPES.map(et=><button key={et.id} onClick={()=>!et.soon&&create(et.id)} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",textAlign:"left",display:"flex",alignItems:"center",gap:16,opacity:et.soon?.4:1,cursor:et.soon?"default":"pointer"}}><span style={{fontSize:32}}>{et.icon}</span><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:et.color}}>{et.label}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:4}}>{et.desc}</div></div>{et.soon?<span style={{fontSize:9,background:"var(--bd)",padding:"3px 8px",borderRadius:4,color:"var(--tx3)"}}>Pronto</span>:IC.arrow}</button>)}</div></div>);
  if(vw==="eval"&&ae){
    if(ae.type==="tributario")return<TribV ev={ae} upd={u=>upd(ae.id,u)} del={()=>del(ae.id)} emp={eObj} back={()=>setVw("list")}/>;
    if(ae.type==="financiero")return<FinV ev={ae} upd={u=>upd(ae.id,u)} del={()=>del(ae.id)} emp={eObj} back={()=>setVw("list")}/>;
    if(ae.type==="360")return<R360V ev={ae} upd={u=>upd(ae.id,u)} del={()=>del(ae.id)} emp={eObj} back={()=>setVw("list")}/>;
    return<F22V ev={ae} upd={u=>upd(ae.id,u)} del={()=>del(ae.id)} emp={eObj} back={()=>setVw("list")}/>;
  }
  return null;
}

function F22V({ev,upd,del,emp,back}){
  const [ay,setAy]=useState(ATY[0]);
  const [showS,setShowS]=useState(false);
  const [aiL,setAiL]=useState(false);
  const [aiR,setAiR]=useState(ev.aiReport||"");
  const r=ev.responses||{};
  const setR=(q,v)=>upd({responses:{...r,[q]:v}});
  const yqs=useMemo(()=>mkQ(ay),[ay]);
  const vqs=useMemo(()=>visQ(yqs,r),[yqs,r]);
  const ysts=useMemo(()=>ATY.map(y=>({year:y,...ySt(y,r)})),[r]);
  const tCont=ATY.reduce((s,y)=>s+(parseInt(r["cont_"+y])||0),0);
  const cY=ysts.filter(y=>y.s!=="pend").length;
  const oY=ysts.filter(y=>y.s==="rev"||y.s==="proc").length;

  const genLocal=()=>{const L=[];const f=n=>n.toLocaleString("es-CL");
    L.push("INFORME EJECUTIVO RADAR RENTA (F22)\n=========================================");
    L.push("Empresa: "+emp.name+"\nRUT: "+(emp.rut||"N/I")+"\nRegimen: "+(emp.regimen||"N/I")+"\nFecha: "+new Date().toLocaleDateString("es-CL"));
    L.push("\n1. RESUMEN EJECUTIVO\n-----------------------------------------");
    L.push("Se realizo la revision de las declaraciones de renta (F22) correspondientes a los ultimos 5 anos tributarios (AT "+ATY[ATY.length-1]+" a AT "+ATY[0]+").");
    L.push("De los "+cY+" anos evaluados, "+oY+" presentan observaciones que requieren atencion.");
    L.push(tCont>0?"La contingencia tributaria total estimada asciende a $"+f(tCont)+".":"No se identificaron contingencias tributarias significativas.");
    L.push("\n2. HALLAZGOS POR ANO TRIBUTARIO\n-----------------------------------------");
    ATY.forEach(y=>{const est=r["e_"+y];if(!est)return;const obs=r["obs_"+y]||"";const ct=parseInt(r["cont_"+y])||0;
      L.push("\nAT "+y+": "+(est==="aceptada"?"ACEPTADA":est==="observada"?"OBSERVADA":"NO PRESENTADA"));
      if(est==="aceptada"){L.push("  Sin observaciones.");return}
      if(est==="no_presentada"){L.push("  ALERTA: Declaracion no presentada. "+(r["npm_"+y]||""));return}
      const dv=r["dv_"+y];if(dv==="si"){const edv=r["edv_"+y]||"";const lbl={dev_total:"devuelta en totalidad",dev_parcial:"devuelta parcialmente",ret_total:"retenida en totalidad",ret_parcial:"retenida parcialmente",pendiente:"pendiente"};L.push("  Devolucion: "+(lbl[edv]||edv));
        const md=r["md_"+y];if(md)L.push("  Monto devuelto: $"+f(parseInt(md)));const mr=r["mr_"+y];if(mr)L.push("  Monto retenido: $"+f(parseInt(mr)));const mtr=r["mtr_"+y];if(mtr)L.push("  Motivo: "+mtr)}
      const res=r["res_"+y];if(res){const rl={fav:"Favorable",desf:"Desfavorable",parc:"Parcialmente favorable",no:"Sin resolucion aun"};L.push("  Resolucion SII: "+(rl[res]||res))}
      const plz=r["plz_"+y];if(plz)L.push("  Plazo/acciones: "+plz);
      const rec=r["rec_"+y];if(rec&&rec!=="no"&&rec!=="evaluar"){const erc=r["erc_"+y]||"";L.push("  Recurso: "+rec.toUpperCase()+(erc?" ("+erc+")":""))}
      const liq=r["liq_"+y];if(liq==="si"){const ml=parseInt(r["mliq_"+y])||0;L.push("  Liquidacion/giro: $"+f(ml));const lr=r["lraf_"+y];if(lr&&lr!=="no")L.push("  Recurso contra liquidacion: "+lr)}
      if(ct>0)L.push("  Contingencia: $"+f(ct));if(obs)L.push("  Observaciones: "+obs)});
    L.push("\n3. ANALISIS DE CONTINGENCIAS\n-----------------------------------------");
    L.push(tCont>0?"Contingencia total: $"+f(tCont)+". Se recomienda evaluar acciones administrativas o judiciales.":"No se identificaron contingencias materiales.");
    L.push("\n4. NIVEL DE RIESGO TRIBUTARIO\n-----------------------------------------");
    const riesgo=tCont>5000000?"ALTO":tCont>0||oY>2?"MEDIO":"BAJO";
    L.push("Nivel: "+riesgo);L.push(riesgo==="ALTO"?"Requiere atencion inmediata.":riesgo==="MEDIO"?"Requiere monitoreo y gestion.":"Situacion tributaria favorable.");
    L.push("\n5. RECOMENDACIONES\n-----------------------------------------");
    if(oY>0)L.push("- Gestionar observaciones pendientes ante el SII.");
    if(tCont>0)L.push("- Evaluar presentar RAF/RAV o reclamo ante TTA.");
    L.push("- Mantener respaldo documental completo.");L.push("- Revision preventiva antes de cada declaracion.");
    if(ev.conclusionGeneral)L.push("- "+ev.conclusionGeneral);
    L.push("\n6. CONCLUSION\n-----------------------------------------");
    L.push(emp.name+" presenta riesgo tributario "+riesgo+" en declaraciones de renta. "+cY+" anos revisados, "+oY+" con observaciones.");
    L.push("\n-----------------------------------------\nInforme generado por RADAR - Plataforma de Inteligencia Empresarial");
    return L.join("\n")};

  const genAI=async()=>{
    setAiL(true);
    try{
      const yd=ATY.map(y=>{const est=r["e_"+y]||"sin evaluar";const obs=r["obs_"+y]||"";const ct=parseInt(r["cont_"+y])||0;
        const dv=r["dv_"+y]||"";const edv=r["edv_"+y]||"";const res=r["res_"+y]||"";const rec=r["rec_"+y]||"";const erc=r["erc_"+y]||"";const liq=r["liq_"+y]||"";const ml=parseInt(r["mliq_"+y])||0;const lr=r["lraf_"+y]||"";
        let txt="AT "+y+": "+est;if(est==="observada"){txt+=", Dev="+dv+"/"+edv+", Res="+res+", Rec="+rec+(erc?"/"+erc:"")+", Liq="+liq+(liq==="si"?"/$"+ml:"")+", Cont=$"+ct}if(obs)txt+=", Obs: "+obs;return txt}).join("\n");
      const prompt="Eres contador auditor chileno. Informe ejecutivo RADAR Renta F22.\nEmpresa: "+emp.name+" RUT: "+(emp.rut||"N/I")+" Regimen: "+(emp.regimen||"N/I")+"\nResultados:\n"+yd+"\nContingencia total: $"+tCont+"\nConclusion profesional: "+(ev.conclusionGeneral||"N/R")+"\nEstructura: 1)RESUMEN 2)HALLAZGOS 3)CONTINGENCIAS 4)RIESGO 5)RECOMENDACIONES 6)CONCLUSION. Texto plano, titulos MAYUSCULAS.";
      const rp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      if(!rp.ok)throw new Error("API "+rp.status);const data=await rp.json();
      const txt=(data.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n");
      if(txt){setAiR(txt);upd({aiReport:txt})}else throw new Error("empty");
    }catch(e){const loc=genLocal();setAiR(loc);upd({aiReport:loc})}
    finally{setAiL(false)}
  };

  if(showS)return(<div style={{maxWidth:800,margin:"0 auto"}}><Bk onClick={()=>setShowS(false)}>Volver a evaluacion</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:32}}>
      <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:2}}>Evaluacion RADAR</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{emp.name}</div><div style={{fontSize:13,color:"var(--pu)",fontWeight:600,marginTop:4}}>Programa de Revision de Renta (F22)</div><div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>Ultimos 5 anos - {new Date().toLocaleDateString("es-CL")}</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:28}}>{ysts.map(ys=>{const ct=parseInt(r["cont_"+ys.year])||0;const ob=r["obs_"+ys.year]||"";return<div key={ys.year} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:16}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:10,height:10,borderRadius:"50%",background:ys.c}}/><span style={{fontSize:14,fontWeight:600}}>AT {ys.year}</span></div><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:12,color:ys.c,fontWeight:500}}>{ys.l}</span>{ct>0&&<span style={{fontSize:11,color:"var(--rd)",fontWeight:600}}>Cont: ${ct.toLocaleString("es-CL")}</span>}</div></div>{ob&&<div style={{fontSize:12,color:"var(--tx2)",marginTop:8,paddingLeft:20,borderLeft:"2px solid var(--bd2)",fontStyle:"italic"}}>{ob}</div>}</div>})}</div>
      <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:20,marginBottom:24}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16}}>
        <div><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",marginBottom:4}}>Revisados</div><div style={{fontSize:20,fontWeight:700}}>{cY}/5</div></div>
        <div><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",marginBottom:4}}>Observados</div><div style={{fontSize:20,fontWeight:700,color:"var(--am)"}}>{oY}</div></div>
        <div><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",marginBottom:4}}>Contingencia</div><div style={{fontSize:20,fontWeight:700,color:tCont>0?"var(--rd)":"var(--gn)"}}>${tCont.toLocaleString("es-CL")}</div></div>
      </div></div>
      <Sc t="Conclusion del Profesional"><textarea value={ev.conclusionGeneral||""} onChange={e=>upd({conclusionGeneral:e.target.value})} placeholder="Analisis, conclusiones y recomendaciones..." style={{minHeight:120}}/></Sc>
      <div style={{borderTop:"1px solid var(--bd)",paddingTop:24,marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:13,fontWeight:700,color:"var(--cy)"}}>Informe Ejecutivo con IA</div><div style={{fontSize:11,color:"var(--tx3)"}}>Generado a partir de los datos de la evaluacion</div></div>
          <button onClick={genAI} disabled={aiL} style={{display:"flex",alignItems:"center",gap:8,background:aiL?"var(--sf2)":"linear-gradient(135deg, #06B6D4, #8B5CF6)",color:"#fff",border:"none",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,fontWeight:600,cursor:aiL?"wait":"pointer",opacity:aiL?.7:1}}>{aiL?"Generando...":aiR?"Regenerar Informe":"Generar Informe"}</button>
        </div>
        {aiL&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:32,textAlign:"center"}}><div style={{fontSize:28,marginBottom:12,animation:"rpulse 1.5s infinite"}}>🤖</div><div style={{fontSize:14,fontWeight:600,color:"var(--cy)"}}>Analizando evaluacion...</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:4}}>Revisando datos, contingencias y observaciones profesionales.</div></div>}
        {!aiL&&aiR&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:24}}><div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7,color:"var(--tx)"}}>{aiR}</div><div style={{display:"flex",gap:8,marginTop:20,paddingTop:16,borderTop:"1px solid var(--bd)"}}><button onClick={()=>{navigator.clipboard.writeText(aiR);alert("Copiado!")}} style={{display:"flex",alignItems:"center",gap:6,background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--tx2)",padding:"8px 16px",borderRadius:"var(--rs)",fontSize:12}}>Copiar informe</button><button onClick={genAI} style={{display:"flex",alignItems:"center",gap:6,background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--tx2)",padding:"8px 16px",borderRadius:"var(--rs)",fontSize:12}}>Regenerar</button></div></div>}
      </div>
    </div></div>);

  return(<div style={{maxWidth:900,margin:"0 auto"}}><Bk onClick={back}>Volver a evaluaciones</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:28}}>📋</span><div><div style={{fontSize:15,fontWeight:600}}>RADAR Renta (F22)</div><div style={{fontSize:12,color:"var(--tx3)"}}>{emp.name}</div></div></div><div style={{display:"flex",gap:8}}><Bt onClick={()=>setShowS(true)}>Resumen</Bt><Bt onClick={()=>upd({status:ev.status==="completada"?"en_proceso":"completada"})} p={ev.status!=="completada"}>{ev.status==="completada"?"Completada":"Completar"}</Bt></div></div>
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{ysts.map(ys=><button key={ys.year} onClick={()=>setAy(ys.year)} style={{padding:"10px 18px",borderRadius:"var(--rs)",border:"none",fontSize:13,fontWeight:ay===ys.year?700:500,background:ay===ys.year?"var(--cyg)":"var(--sf)",color:ay===ys.year?"var(--cy)":"var(--tx2)",position:"relative"}}>AT {ys.year}<div style={{position:"absolute",top:4,right:4,width:8,height:8,borderRadius:"50%",background:ys.c}}/></button>)}</div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 16px",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--rs)"}}><div style={{width:10,height:10,borderRadius:"50%",background:ysts.find(y=>y.year===ay)?.c||"var(--tx3)"}}/><span style={{fontSize:13,fontWeight:500}}>{ysts.find(y=>y.year===ay)?.l}</span><span style={{fontSize:11,color:"var(--tx3)",marginLeft:"auto"}}>{vqs.length} preguntas</span></div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>{vqs.map((q,i)=><div key={q.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",borderLeft:"3px solid "+(r[q.id]!==undefined&&r[q.id]!==""?"var(--cy)":"var(--bd2)")}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:10,color:"var(--tx3)",background:"var(--sf2)",padding:"2px 8px",borderRadius:4,fontWeight:600}}>P{i+1}</span><span style={{fontSize:13,fontWeight:600}}>{q.text}</span></div>
      {q.type==="select"&&<div style={{display:"flex",flexDirection:"column",gap:6}}>{q.opts.map(o=><button key={o.v} onClick={()=>setR(q.id,o.v)} style={{padding:"10px 16px",borderRadius:"var(--rs)",border:"1px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd)"),background:r[q.id]===o.v?"var(--cyg)":"var(--sf2)",color:r[q.id]===o.v?"var(--cy)":"var(--tx2)",fontSize:13,textAlign:"left",fontWeight:r[q.id]===o.v?600:400,display:"flex",alignItems:"center",gap:8}}><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd2)"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r[q.id]===o.v&&<div style={{width:10,height:10,borderRadius:"50%",background:"var(--cy)"}}/>}</div>{o.l}</button>)}</div>}
      {q.type==="text"&&<input value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="Escriba aqui..." style={{background:"var(--sf2)"}}/>}
      {q.type==="number"&&<input type="number" value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="0" style={{background:"var(--sf2)",maxWidth:250}}/>}
      {q.type==="textarea"&&<textarea value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder={q.ph||"Escriba aqui..."} style={{background:"var(--sf2)"}}/>}
    </div>)}</div>
    <div style={{marginTop:32,padding:"16px 20px",borderRadius:"var(--rs)",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:600,color:"var(--rd)"}}>Eliminar evaluacion</div><button onClick={()=>{if(confirm("Eliminar?"))del()}} style={{background:"transparent",border:"1px solid var(--rd)",color:"var(--rd)",borderRadius:"var(--rs)",padding:"6px 16px",fontSize:12}}>Eliminar</button></div>
  </div>);
}

// ═══ CONTABILIDAD ═══
const fmt=n=>n.toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:0});
const fD=d=>{try{return new Date(d+"T12:00:00").toLocaleDateString("es-CL")}catch{return d}};

// Encabezado formal tipo carta -- solo aparece al exportar a PDF
// (".rpt-print-head" esta oculto en pantalla); en pantalla los reportes
// se quedan con su header normal de siempre, sin tocar nada.
function ReportHeader({eObj,title,subtitle}){
  return(<div className="rpt-print-head">
    <div className="rpt-co">{eObj?.name||"Empresa"}</div>
    {eObj?.rut&&<div className="rpt-rut">RUT {eObj.rut}{eObj?.giro?" — "+eObj.giro:""}</div>}
    <div className="rpt-title">{title}</div>
    {subtitle&&<div className="rpt-sub">{subtitle}</div>}
  </div>);
}
const tpL={asset:"Activo",liability:"Pasivo",equity:"Patrimonio",income:"Ingreso",expense:"Gasto"};
const tpC={asset:"#06B6D4",liability:"#EF4444",equity:"#8B5CF6",income:"#10B981",expense:"#F59E0B"};

function ContabP({eObj,accts,setAccts,entries,setEntries,empEntries,leafAccts,aLog,go}){
  const [tab,setTab]=useState("plan");
  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa primero."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;
  const tabs=[{id:"plan",l:"Plan de Cuentas"},{id:"asientos",l:"Asientos"},{id:"csv",l:"Compras/Ventas SII"},{id:"lcompras",l:"Libro de Compras"},{id:"lventas",l:"Libro de Ventas"},{id:"conciliacion",l:"Conciliacion Bancaria"},{id:"diario",l:"Libro Diario"},{id:"mayor",l:"Libro Mayor"},{id:"balance",l:"Balance"},{id:"eerr",l:"Estado Resultados"},{id:"b8",l:"8 Columnas"}];
  return(<div style={{maxWidth:960,margin:"0 auto"}}>
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 18px",borderRadius:"var(--rs)",border:"none",fontSize:13,fontWeight:tab===t.id?700:500,background:tab===t.id?"var(--cyg)":"var(--sf)",color:tab===t.id?"var(--cy)":"var(--tx2)"}}>{t.l}</button>)}</div>
    {tab==="plan"&&<PlanCtas accts={accts} setAccts={setAccts} aLog={aLog}/>}
    {tab==="asientos"&&<Asientos entries={entries} setEntries={setEntries} empEntries={empEntries} leafAccts={leafAccts} eObj={eObj} aLog={aLog}/>}
    {tab==="csv"&&<CSVSII entries={entries} setEntries={setEntries} leafAccts={leafAccts} eObj={eObj} empEntries={empEntries} aLog={aLog}/>}
    {tab==="lcompras"&&<LibroCV empEntries={empEntries} tipo="compra" eObj={eObj}/>}
    {tab==="lventas"&&<LibroCV empEntries={empEntries} tipo="venta" eObj={eObj}/>}
    {tab==="conciliacion"&&<ConciliacionP entries={entries} setEntries={setEntries} leafAccts={leafAccts} eObj={eObj} empEntries={empEntries} aLog={aLog}/>}
    {tab==="diario"&&<LDiario empEntries={empEntries} accts={accts} eObj={eObj}/>}
    {tab==="mayor"&&<LMayor empEntries={empEntries} accts={accts} leafAccts={leafAccts} eObj={eObj}/>}
    {tab==="balance"&&<Balance empEntries={empEntries} accts={accts} leafAccts={leafAccts} eObj={eObj}/>}
    {tab==="eerr"&&<EERR empEntries={empEntries} accts={accts} leafAccts={leafAccts} eObj={eObj}/>}
    {tab==="b8"&&<B8Col empEntries={empEntries} accts={accts} leafAccts={leafAccts} eObj={eObj}/>}
  </div>);
}

function PlanCtas({accts,setAccts,aLog}){
  const [showAdd,setShowAdd]=useState(false);
  const [editCd,setEditCd]=useState(null);
  const [na,setNa]=useState({cd:"",nm:"",tp:"asset",lv:4});
  const [editNm,setEditNm]=useState("");
  const isLeaf=cd=>!accts.some(b=>b.cd!==cd&&b.cd.startsWith(cd+"."));
  const addA=()=>{if(!na.cd||!na.nm)return;if(accts.find(a=>a.cd===na.cd)){alert("Codigo ya existe");return}setAccts(p=>[...p,{...na}].sort((a,b)=>a.cd.localeCompare(b.cd)));setNa({cd:"",nm:"",tp:"asset",lv:4});setShowAdd(false);aLog("Cuenta agregada",na.cd+" - "+na.nm)};
  const delA=cd=>{if(!isLeaf(cd)){alert("No se puede eliminar: tiene subcuentas");return}setAccts(p=>p.filter(a=>a.cd!==cd));aLog("Cuenta eliminada",cd)};
  const saveEdit=()=>{if(!editNm.trim())return;setAccts(p=>p.map(a=>a.cd===editCd?{...a,nm:editNm}:a));aLog("Cuenta editada",editCd);setEditCd(null)};
  const reset=()=>{if(confirm("Restaurar plan por defecto? Se perderan las cuentas personalizadas."))setAccts(DFLT_ACCTS)};
  const lvPad={1:8,2:24,3:40,4:56};
  const lvWeight={1:700,2:600,3:500,4:400};
  const lvSize={1:13,2:12,3:12,4:11};
  return(<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:"var(--tx3)"}}>{accts.length} cuentas · 4 niveles (Clase / Grupo / Clasificacion / Cuenta)</span><div style={{display:"flex",gap:8}}><Bt onClick={reset}>Restaurar</Bt><Bt onClick={()=>setShowAdd(!showAdd)} p={true}>{IC.plus} Agregar</Bt></div></div>
    {showAdd&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
        <Fi l="Codigo" v={na.cd} s={v=>setNa(p=>({...p,cd:v}))} ph="1.1.01.001"/>
        <Fi l="Nombre" v={na.nm} s={v=>setNa(p=>({...p,nm:v}))}/>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Tipo</label><select value={na.tp} onChange={e=>setNa(p=>({...p,tp:e.target.value}))}>{Object.entries(tpL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Nivel</label><select value={na.lv} onChange={e=>setNa(p=>({...p,lv:+e.target.value}))}><option value={1}>1 - Clase</option><option value={2}>2 - Grupo</option><option value={3}>3 - Clasificacion</option><option value={4}>4 - Cuenta</option></select></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12}}><Bt onClick={addA} p={true}>Agregar</Bt><Bt onClick={()=>setShowAdd(false)}>Cancelar</Bt></div>
    </div>}
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden"}}><div style={{maxHeight:"65vh",overflowY:"auto"}}>
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}><thead><tr style={{borderBottom:"1px solid var(--bd)",fontSize:11,color:"var(--tx3)",position:"sticky",top:0,background:"var(--sf2)",zIndex:1}}><th style={{textAlign:"left",padding:"10px 16px",fontWeight:500,width:140}}>Codigo</th><th style={{textAlign:"left",padding:"10px 8px",fontWeight:500}}>Nombre</th><th style={{textAlign:"left",padding:"10px 8px",fontWeight:500,width:80}}>Tipo</th><th style={{textAlign:"center",padding:"10px 8px",fontWeight:500,width:30}}>Nv</th><th style={{width:70}}></th></tr></thead>
        <tbody>{accts.map(a=><tr key={a.cd} style={{borderBottom:"1px solid "+(a.lv===1?"var(--bd2)":"var(--bd)"),background:a.lv===1?"var(--sf2)":"transparent"}}>
          <td style={{padding:"7px 16px",fontFamily:"monospace",fontSize:11,color:a.lv<=2?"var(--cy)":"var(--tx2)"}}>{a.cd}</td>
          <td style={{padding:"7px 8px",paddingLeft:lvPad[a.lv]||56,fontWeight:lvWeight[a.lv]||400,fontSize:lvSize[a.lv]||11}}>
            {editCd===a.cd?<div style={{display:"flex",gap:6,alignItems:"center"}}><input value={editNm} onChange={e=>setEditNm(e.target.value)} style={{padding:"4px 8px",fontSize:12,background:"var(--sf2)",width:"100%"}} onKeyDown={e=>e.key==="Enter"&&saveEdit()}/><button onClick={saveEdit} style={{background:"var(--cy)",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,whiteSpace:"nowrap"}}>OK</button><button onClick={()=>setEditCd(null)} style={{background:"none",border:"none",color:"var(--tx3)",fontSize:10}}>x</button></div>:a.nm}
          </td>
          <td style={{padding:"7px 8px",fontSize:10,color:tpC[a.tp]}}>{tpL[a.tp]}</td>
          <td style={{padding:"7px 8px",fontSize:10,textAlign:"center",color:"var(--tx3)"}}>{a.lv}</td>
          <td style={{padding:"4px 8px",textAlign:"right"}}>
            {editCd!==a.cd&&<div style={{display:"flex",gap:2,justifyContent:"flex-end"}}>
              <button onClick={()=>{setEditCd(a.cd);setEditNm(a.nm)}} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",padding:3,opacity:.5}} title="Editar nombre">{IC.edit}</button>
              {isLeaf(a.cd)&&<button onClick={()=>delA(a.cd)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",padding:3,opacity:.3}} title="Eliminar">x</button>}
            </div>}
          </td>
        </tr>)}</tbody>
      </table>
    </div></div>
  </div>);
}

function Asientos({entries,setEntries,empEntries,leafAccts,eObj,aLog}){
  const [showF,setShowF]=useState(false);
  const [fm,setFm]=useState({date:new Date().toISOString().slice(0,10),desc:"",lines:[{ac:"",db:0,cr:0},{ac:"",db:0,cr:0}]});
  const nxt=useMemo(()=>{const ns=empEntries.map(e=>parseInt(e.num)||0);return String(Math.max(0,...ns)+1).padStart(4,"0")},[empEntries]);
  const uLine=(i,f,v)=>setFm(p=>{const ls=[...p.lines];ls[i]={...ls[i],[f]:f==="ac"?v:Math.max(0,parseFloat(v)||0)};return{...p,lines:ls}});
  const addL=()=>setFm(p=>({...p,lines:[...p.lines,{ac:"",db:0,cr:0}]}));
  const rmL=i=>{if(fm.lines.length>2)setFm(p=>({...p,lines:p.lines.filter((_,j)=>j!==i)}))};
  const tD=fm.lines.reduce((s,l)=>s+(l.db||0),0);
  const tC=fm.lines.reduce((s,l)=>s+(l.cr||0),0);
  const bal=Math.abs(tD-tC)<0.01&&tD>0;
  const doSave=()=>{if(!fm.desc||!bal)return;if(fm.lines.some(l=>!l.ac)){alert("Selecciona cuenta en todas las lineas");return}const e={id:uid(),empresaId:eObj.id,num:nxt,date:fm.date,desc:fm.desc,lines:fm.lines.filter(l=>l.db>0||l.cr>0)};setEntries(p=>[...p,e]);aLog("Asiento "+nxt,fm.desc);setFm({date:new Date().toISOString().slice(0,10),desc:"",lines:[{ac:"",db:0,cr:0},{ac:"",db:0,cr:0}]});setShowF(false)};
  const delE=id=>setEntries(p=>p.filter(e=>e.id!==id));
  const handleCSV=ev=>{const f=ev.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=e=>{try{const rows=e.target.result.split("\n").filter(r=>r.trim()).slice(1);const imp=[];let cur=null;let n=parseInt(nxt);rows.forEach(row=>{const c=row.split(/[,;\t]/).map(x=>x.trim().replace(/^"|"$/g,""));if(c.length>=5){const[dt,gl,ct,dStr,hStr]=c;const db=parseFloat(dStr)||0;const cr=parseFloat(hStr)||0;const ac=leafAccts.find(a=>a.cd===ct||a.nm.toLowerCase().includes(ct.toLowerCase()));if(!cur||cur.desc!==gl||cur.date!==dt){if(cur&&cur.lines.length>0)imp.push(cur);cur={id:uid(),empresaId:eObj.id,num:String(n++).padStart(4,"0"),date:dt||new Date().toISOString().slice(0,10),desc:gl,lines:[]}}if(ac)cur.lines.push({ac:ac.cd,db,cr})}});if(cur&&cur.lines.length>0)imp.push(cur);if(imp.length>0){setEntries(p=>[...p,...imp]);aLog("CSV importado",imp.length+" asientos");alert(imp.length+" asiento(s) importado(s)")}else alert("No se importaron asientos. Verifica formato: Fecha,Glosa,Cuenta,Debe,Haber")}catch(err){alert("Error: "+err.message)}};rd.readAsText(f);ev.target.value=""};

  return(<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:"var(--tx3)"}}>{empEntries.length} asientos</span><div style={{display:"flex",gap:8}}><label style={{display:"flex",alignItems:"center",gap:8,background:"var(--sf2)",color:"var(--tx2)",border:"1px solid var(--bd)",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,cursor:"pointer"}}>CSV<input type="file" accept=".csv,.txt" onChange={handleCSV} style={{display:"none"}}/></label><Bt onClick={()=>setShowF(!showF)} p={true}>{IC.plus} Nuevo Asiento</Bt></div></div>
    <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:12,marginBottom:16,fontSize:11,color:"var(--tx3)"}}><b>CSV:</b> Fecha, Glosa, CodigoCuenta, Debe, Haber</div>
    {showF&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Asiento N {nxt}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}><input type="date" value={fm.date} onChange={e=>setFm(p=>({...p,date:e.target.value}))}/><input placeholder="Glosa / Descripcion" value={fm.desc} onChange={e=>setFm(p=>({...p,desc:e.target.value}))}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 32px",gap:8,fontSize:10,color:"var(--tx3)",fontWeight:500,padding:"0 4px"}}><span>Cuenta</span><span style={{textAlign:"right"}}>Debe</span><span style={{textAlign:"right"}}>Haber</span><span></span></div>
        {fm.lines.map((ln,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 32px",gap:8}}>
          <select value={ln.ac} onChange={e=>uLine(i,"ac",e.target.value)} style={{fontSize:12}}><option value="">Cuenta...</option>{leafAccts.map(a=><option key={a.cd} value={a.cd}>{a.cd} {a.nm}</option>)}</select>
          <input type="number" min="0" value={ln.db||""} placeholder="0" onChange={e=>uLine(i,"db",e.target.value)} style={{textAlign:"right",fontFamily:"monospace",fontSize:12}}/>
          <input type="number" min="0" value={ln.cr||""} placeholder="0" onChange={e=>uLine(i,"cr",e.target.value)} style={{textAlign:"right",fontFamily:"monospace",fontSize:12}}/>
          <button onClick={()=>rmL(i)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:14}}>x</button>
        </div>)}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1px solid var(--bd)"}}>
        <button onClick={addL} style={{background:"none",border:"none",color:"var(--cy)",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Linea</button>
        <div style={{display:"flex",alignItems:"center",gap:16,fontSize:12}}>
          <span style={{fontFamily:"monospace"}}>D: ${fmt(tD)}</span><span style={{fontFamily:"monospace"}}>H: ${fmt(tC)}</span>
          <span style={{padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:600,background:bal?"rgba(16,185,129,.15)":"rgba(239,68,68,.15)",color:bal?"var(--gn)":"var(--rd)"}}>{bal?"Cuadrado":"Descuadrado"}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12}}><Bt onClick={doSave} p={bal}>{bal?"Guardar":"Descuadrado"}</Bt><Bt onClick={()=>setShowF(false)}>Cancelar</Bt></div>
    </div>}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>{[...empEntries].sort((a,b)=>b.date.localeCompare(a.date)).map(e=><div key={e.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:10,fontFamily:"monospace",background:"var(--sf2)",padding:"2px 8px",borderRadius:4}}>N {e.num}</span><span style={{fontSize:13,fontWeight:500}}>{e.desc}</span></div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"var(--tx3)"}}>{fD(e.date)}</span><button onClick={()=>delE(e.id)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",opacity:.5}}>x</button></div></div>
      <div style={{fontSize:11}}>{e.lines.map((l,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",gap:8,padding:"2px 0"}}><span style={{color:"var(--tx2)",paddingLeft:l.cr>0?20:0}}>{l.ac} {leafAccts.find(a=>a.cd===l.ac)?.nm||""}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>{l.db>0?"$"+fmt(l.db):""}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>{l.cr>0?"$"+fmt(l.cr):""}</span></div>)}</div>
    </div>)}</div>
  </div>);
}

function LDiario({empEntries,accts,eObj}){
  const sorted=useMemo(()=>[...empEntries].sort((a,b)=>a.date.localeCompare(b.date)||a.num.localeCompare(b.num)),[empEntries]);
  const am=useMemo(()=>Object.fromEntries(accts.map(a=>[a.cd,a.nm])),[accts]);
  if(!sorted.length)return<Ey i="📖" t="Sin asientos" d="Registra asientos para ver el Libro Diario."/>;
  const tD=sorted.reduce((s,e)=>s+e.lines.reduce((ss,l)=>ss+(l.db||0),0),0);
  const tC=sorted.reduce((s,e)=>s+e.lines.reduce((ss,l)=>ss+(l.cr||0),0),0);
  return(<div className="report" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden"}}>
    <ReportHeader eObj={eObj} title="Libro Diario" subtitle={"Al "+new Date().toLocaleDateString("es-CL")}/>
    <div className="no-print" style={{padding:"16px 20px",borderBottom:"1px solid var(--bd)",background:"var(--sf2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:13,fontWeight:600}}>Libro Diario</span>
      <button onClick={()=>window.print()} style={{padding:"6px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf)",color:"var(--tx2)",fontSize:11,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button>
    </div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}><thead><tr style={{borderBottom:"1px solid var(--bd)",fontSize:10,color:"var(--tx3)",background:"var(--sf2)"}}><th style={{textAlign:"left",padding:"8px 12px",fontWeight:500}}>Fecha</th><th style={{textAlign:"left",padding:"8px 4px",fontWeight:500}}>N</th><th style={{textAlign:"left",padding:"8px 4px",fontWeight:500}}>Cod</th><th style={{textAlign:"left",padding:"8px 4px",fontWeight:500}}>Cuenta / Glosa</th><th style={{textAlign:"right",padding:"8px 12px",fontWeight:500}}>Debe</th><th style={{textAlign:"right",padding:"8px 12px",fontWeight:500}}>Haber</th></tr></thead>
      <tbody>{sorted.map(e=>e.lines.map((l,i)=><tr key={e.id+"-"+i} style={{borderBottom:"1px solid var(--bd)"}}>
        <td style={{padding:"6px 12px",fontSize:11}}>{i===0?fD(e.date):""}</td>
        <td style={{padding:"6px 4px",fontFamily:"monospace",fontSize:10}}>{i===0?e.num:""}</td>
        <td style={{padding:"6px 4px",fontFamily:"monospace",fontSize:10}}>{l.ac}</td>
        <td style={{padding:"6px 4px",paddingLeft:l.cr>0?20:4}}>{am[l.ac]||"?"}{i===0&&<div style={{fontSize:10,color:"var(--tx3)",fontStyle:"italic"}}>{e.desc}</div>}</td>
        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"monospace"}}>{l.db>0?"$"+fmt(l.db):""}</td>
        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"monospace"}}>{l.cr>0?"$"+fmt(l.cr):""}</td>
      </tr>))}
        <tr style={{borderTop:"2px solid var(--bd2)",background:"var(--sf2)",fontWeight:700}}><td colSpan={4} style={{padding:"10px 12px",textAlign:"right",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>Totales</td><td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace"}}>${fmt(tD)}</td><td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace"}}>${fmt(tC)}</td></tr>
      </tbody></table></div>
  </div>);
}

function Balance({empEntries,accts,leafAccts,eObj}){
  if(!empEntries.length)return<Ey i="⚖️" t="Sin datos" d="Registra asientos para generar el Balance."/>;
  const bals=useMemo(()=>{const b={};leafAccts.forEach(a=>{b[a.cd]={db:0,cr:0}});empEntries.forEach(e=>e.lines.forEach(l=>{if(!b[l.ac])b[l.ac]={db:0,cr:0};b[l.ac].db+=(l.db||0);b[l.ac].cr+=(l.cr||0)}));return b},[empEntries,leafAccts]);
  const getB=(cd,tp)=>{const b=bals[cd]||{db:0,cr:0};return(tp==="asset"||tp==="expense")?b.db-b.cr:b.cr-b.db};
  const mkSec=tp=>{const l2=accts.filter(a=>a.tp===tp&&a.lv===2);return l2.map(g=>{const ch=leafAccts.filter(a=>a.tp===tp&&a.cd.startsWith(g.cd+"."));const items=ch.map(c=>({cd:c.cd,nm:c.nm,bal:getB(c.cd,tp)})).filter(c=>c.bal!==0);return{grp:g.nm,items,sub:items.reduce((s,c)=>s+c.bal,0)}}).filter(g=>g.items.length>0)};
  const assets=mkSec("asset");const liabs=mkSec("liability");const eq=mkSec("equity");
  const tA=assets.reduce((s,g)=>s+g.sub,0);const tL=liabs.reduce((s,g)=>s+g.sub,0);const tE=eq.reduce((s,g)=>s+g.sub,0);const tPE=tL+tE;

  const BSec=({title,groups,total,color})=><div><div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,color}}>{title}</div>
    {groups.map((g,i)=><div key={i} style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",marginBottom:4,paddingLeft:8}}>{g.grp}</div>
      {g.items.map((it,j)=><div key={j} style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:12,paddingLeft:24,padding:"3px 0 3px 24px"}}><span style={{color:"var(--tx2)"}}>{it.nm}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(it.bal)}</span></div>)}
      <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:12,paddingLeft:24,padding:"6px 0 6px 24px",borderTop:"1px solid var(--bd)",marginTop:4,fontWeight:600}}><span>Subtotal {g.grp}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(g.sub)}</span></div>
    </div>)}
    <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:13,fontWeight:700,padding:"10px 0",borderTop:"2px solid var(--bd2)",marginTop:4}}><span>TOTAL {title.toUpperCase()}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(total)}</span></div>
  </div>;

  return(<div className="report" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28,maxWidth:700}}>
    <ReportHeader eObj={eObj} title="Balance General" subtitle={"Al "+new Date().toLocaleDateString("es-CL")}/>
    <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button onClick={()=>window.print()} style={{padding:"6px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx2)",fontSize:11,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button></div>
    <div className="no-print" style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:18,fontWeight:700}}>{eObj?.name}</div><div style={{fontSize:13,color:"var(--tx3)"}}>Balance General</div><div style={{fontSize:11,color:"var(--tx3)"}}>Al {new Date().toLocaleDateString("es-CL")}</div></div>
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <BSec title="Activos" groups={assets} total={tA} color="var(--cy)"/>
      <BSec title="Pasivos" groups={liabs} total={tL} color="var(--rd)"/>
      <BSec title="Patrimonio" groups={eq} total={tE} color="var(--pu)"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:14,fontWeight:700,padding:"12px 0",borderTop:"3px double var(--bd2)",color:Math.abs(tA-tPE)<1?"var(--gn)":"var(--rd)"}}><span>TOTAL PASIVOS + PATRIMONIO</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(tPE)}</span></div>
      {Math.abs(tA-tPE)>=1&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",borderRadius:"var(--rs)",padding:12,fontSize:11,color:"var(--rd)"}}>Descuadre: Activos (${fmt(tA)}) vs Pasivos+Patrimonio (${fmt(tPE)}). Diferencia: ${fmt(tA-tPE)}</div>}
    </div>
  </div>);
}

// ═══ ESTADO DE RESULTADOS ═══
function EERR({empEntries,accts,leafAccts,eObj}){
  if(!empEntries.length)return<Ey i="📈" t="Sin datos" d="Registra asientos para generar el Estado de Resultados."/>;
  const bals=useMemo(()=>{const b={};leafAccts.forEach(a=>{b[a.cd]={db:0,cr:0}});empEntries.forEach(e=>e.lines.forEach(l=>{if(!b[l.ac])b[l.ac]={db:0,cr:0};b[l.ac].db+=(l.db||0);b[l.ac].cr+=(l.cr||0)}));return b},[empEntries,leafAccts]);
  const getB=(cd,tp)=>{const b=bals[cd]||{db:0,cr:0};return tp==="income"?b.cr-b.db:b.db-b.cr};
  const mkSec=tp=>{const l2=accts.filter(a=>a.tp===tp&&a.lv===2);return l2.map(g=>{const ch=leafAccts.filter(a=>a.tp===tp&&a.cd.startsWith(g.cd+"."));const items=ch.map(c=>({cd:c.cd,nm:c.nm,bal:getB(c.cd,tp)})).filter(c=>c.bal!==0);return{grp:g.nm,items,sub:items.reduce((s,c)=>s+c.bal,0)}}).filter(g=>g.items.length>0)};
  const inc=mkSec("income");const exp=mkSec("expense");
  const tI=inc.reduce((s,g)=>s+g.sub,0);const tE=exp.reduce((s,g)=>s+g.sub,0);const net=tI-tE;
  return(<div className="report" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28,maxWidth:700}}>
    <ReportHeader eObj={eObj} title="Estado de Resultados" subtitle={"Al "+new Date().toLocaleDateString("es-CL")}/>
    <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button onClick={()=>window.print()} style={{padding:"6px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx2)",fontSize:11,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button></div>
    <div className="no-print" style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:18,fontWeight:700}}>{eObj?.name}</div><div style={{fontSize:13,color:"var(--tx3)"}}>Estado de Resultados</div><div style={{fontSize:11,color:"var(--tx3)"}}>Al {new Date().toLocaleDateString("es-CL")}</div></div>
    <div><div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,color:"var(--gn)"}}>Ingresos</div>
      {inc.map((g,i)=><div key={i} style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",paddingLeft:8,marginBottom:4}}>{g.grp}</div>
        {g.items.map((it,j)=><div key={j} style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:12,padding:"3px 0 3px 24px"}}><span style={{color:"var(--tx2)"}}>{it.nm}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(it.bal)}</span></div>)}</div>)}
      <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:13,fontWeight:700,padding:"10px 0",borderTop:"2px solid var(--bd2)"}}><span>TOTAL INGRESOS</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(tI)}</span></div>
    </div>
    <div style={{marginTop:16}}><div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,color:"var(--am)"}}>Costos y Gastos</div>
      {exp.map((g,i)=><div key={i} style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",paddingLeft:8,marginBottom:4}}>{g.grp}</div>
        {g.items.map((it,j)=><div key={j} style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:12,padding:"3px 0 3px 24px"}}><span style={{color:"var(--tx2)"}}>{it.nm}</span><span style={{textAlign:"right",fontFamily:"monospace"}}>(${fmt(it.bal)})</span></div>)}</div>)}
      <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:13,fontWeight:700,padding:"10px 0",borderTop:"2px solid var(--bd2)"}}><span>TOTAL COSTOS Y GASTOS</span><span style={{textAlign:"right",fontFamily:"monospace"}}>(${fmt(tE)})</span></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 120px",fontSize:15,fontWeight:700,padding:"14px 0",borderTop:"3px double var(--bd2)",marginTop:16,color:net>=0?"var(--gn)":"var(--rd)"}}><span>{net>=0?"UTILIDAD":"PERDIDA"} DEL EJERCICIO</span><span style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(net)}</span></div>
  </div>);
}

// ═══ LIBRO MAYOR ═══
function LMayor({empEntries,accts,leafAccts,eObj}){
  const [sel,setSel]=useState("");
  const am=useMemo(()=>Object.fromEntries(accts.map(a=>[a.cd,a.nm])),[accts]);
  const used=useMemo(()=>{const cs=new Set();empEntries.forEach(e=>e.lines.forEach(l=>cs.add(l.ac)));return leafAccts.filter(a=>cs.has(a.cd))},[empEntries,leafAccts]);
  const acctType=leafAccts.find(a=>a.cd===sel)?.tp;
  const isDeb=acctType==="asset"||acctType==="expense";
  const movesWithBal=useMemo(()=>{if(!sel)return[];const m=[];empEntries.forEach(e=>e.lines.forEach(l=>{if(l.ac===sel)m.push({date:e.date,num:e.num,desc:e.desc,db:l.db||0,cr:l.cr||0})}));m.sort((a,b)=>a.date.localeCompare(b.date));let bal=0;return m.map(mv=>{bal+=isDeb?(mv.db-mv.cr):(mv.cr-mv.db);return{...mv,bal}})},[sel,empEntries,isDeb]);
  return(<div>
    <div className="no-print" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16,marginBottom:16}}>
      <label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:8,fontWeight:500}}>Seleccionar cuenta</label>
      <select value={sel} onChange={e=>setSel(e.target.value)} style={{maxWidth:400}}><option value="">-- Seleccionar --</option>{used.map(a=><option key={a.cd} value={a.cd}>{a.cd} - {a.nm}</option>)}</select>
    </div>
    {sel&&<div className="report" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden"}}>
      <ReportHeader eObj={eObj} title="Libro Mayor" subtitle={sel+" — "+am[sel]+" · Naturaleza "+(isDeb?"Deudora":"Acreedora")}/>
      <div className="no-print" style={{padding:"12px 20px",borderBottom:"1px solid var(--bd)",background:"var(--sf2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:13,fontWeight:600}}>{sel} — {am[sel]}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Naturaleza: {isDeb?"Deudora":"Acreedora"}</div></div>
        <button onClick={()=>window.print()} style={{padding:"6px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf)",color:"var(--tx2)",fontSize:11,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button>
      </div>
      {movesWithBal.length===0?<div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>Sin movimientos.</div>
      :<div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}><thead><tr style={{borderBottom:"1px solid var(--bd)",fontSize:10,color:"var(--tx3)",background:"var(--sf2)"}}><th style={{textAlign:"left",padding:"8px 12px",fontWeight:500}}>Fecha</th><th style={{textAlign:"left",padding:"8px 4px",fontWeight:500}}>N</th><th style={{textAlign:"left",padding:"8px 4px",fontWeight:500}}>Glosa</th><th style={{textAlign:"right",padding:"8px 12px",fontWeight:500}}>Debe</th><th style={{textAlign:"right",padding:"8px 12px",fontWeight:500}}>Haber</th><th style={{textAlign:"right",padding:"8px 12px",fontWeight:500}}>Saldo</th></tr></thead>
        <tbody>{movesWithBal.map((m,i)=><tr key={i} style={{borderBottom:"1px solid var(--bd)"}}><td style={{padding:"6px 12px",fontSize:11}}>{fD(m.date)}</td><td style={{padding:"6px 4px",fontFamily:"monospace",fontSize:10}}>{m.num}</td><td style={{padding:"6px 4px"}}>{m.desc}</td><td style={{padding:"6px 12px",textAlign:"right",fontFamily:"monospace"}}>{m.db>0?"$"+fmt(m.db):""}</td><td style={{padding:"6px 12px",textAlign:"right",fontFamily:"monospace"}}>{m.cr>0?"$"+fmt(m.cr):""}</td><td style={{padding:"6px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:600,color:m.bal<0?"var(--rd)":"var(--tx)"}}>${fmt(m.bal)}</td></tr>)}</tbody></table></div>}
    </div>}
  </div>);
}

// ═══ CSV SII (Compras/Ventas) ═══
function CSVSII({entries,setEntries,leafAccts,eObj,empEntries,aLog}){
  const [result,setResult]=useState(null);
  const [periodo,setPeriodo]=useState("");
  const [autoBusy,setAutoBusy]=useState(null);
  const nxtNum=useMemo(()=>{const ns=empEntries.map(e=>parseInt(e.num)||0);return Math.max(0,...ns)+1},[empEntries]);
  // periodoTrib = periodo tributario (AAAAMM) que corresponde ante el SII —
  // puede diferir del mes de la fecha de emision del documento (ej. una
  // factura emitida a fin de mes pero reconocida/recibida el mes siguiente).
  // Se guarda aparte de "date" (fecha de emision) para armar el Libro de
  // Compras/Ventas mensual agrupado correctamente.
  const processCSVText=(text,tipo,periodoTrib)=>{try{
    const rows=text.split("\n").filter(r=>r.trim());
    if(rows.length<2){setResult({ok:false,msg:"Archivo vacio o sin datos"});return}
    const isCompra=tipo==="compra";
    const dataRows=rows.slice(1);const imported=[];let n=nxtNum;
    const ivaAc=isCompra?"1.1.03.001":"2.1.02.001";const ctpAc=isCompra?"1.1.05.001":"4.1.01.001";const tpAc=isCompra?"2.1.01.001":"1.1.02.001";
    dataRows.forEach(row=>{
      const c=row.split(";").map(x=>x.trim().replace(/^"|"$/g,""));
      if(c.length<7)return;
      // "exento" (documentos no afectos/exentos, ej. tipo 34) no tiene IVA
      // pero si un monto a contabilizar -- si solo se mira neto/iva, esos
      // documentos quedan con menos de 2 lineas y se descartan en silencio.
      let neto=0,exento=0,iva=0,total=0,fecha="",rut="",razon="",folio="",tipoDocCod="";
      const toNum=s=>parseInt((s||"").replace(/\./g,"").replace(/,/g,""))||0;
      if(c.length>=13){fecha=c[5]||"";rut=c[1]||"";razon=c[2]||"";folio=c[3]||"";neto=toNum(c[7]);iva=toNum(c[9]);total=toNum(c[12])}
      else if(c.length>=9){fecha=c[0]||"";rut=c[1]||"";razon=c[2]||"";folio=c[3]||"";neto=toNum(c[4]);exento=toNum(c[5]);iva=toNum(c[6]);total=toNum(c[7]);tipoDocCod=c[8]||""}
      else if(c.length>=8){fecha=c[0]||"";rut=c[1]||"";razon=c[2]||"";folio=c[3]||"";neto=toNum(c[4]);exento=toNum(c[5]);iva=toNum(c[6]);total=toNum(c[7])}
      else{fecha=c[0]||"";rut=c[1]||"";razon=c[2]||"";folio=c[3]||"";neto=toNum(c[4]);iva=toNum(c[5]);total=toNum(c[6])}
      if(!total)total=neto+exento+iva;
      if(total===0)return;
      const dt=fecha.includes("/")?(()=>{const p=fecha.split("/");return(p[2]||"2026")+"-"+(p[1]||"01").padStart(2,"0")+"-"+(p[0]||"01").padStart(2,"0")})():fecha||new Date().toISOString().slice(0,10);
      const glosa=(isCompra?"Compra":"Venta")+" F"+folio+" "+razon.slice(0,30);
      // Se junta neto+exento en una sola linea contable (misma contracuenta),
      // y el total-iva define esa linea para que el asiento cuadre exacto
      // aunque los montos del SII tengan alguna diferencia de redondeo.
      const netoExento=Math.abs(total)-Math.abs(iva);
      const lines=[];
      if(isCompra){if(netoExento>0)lines.push({ac:ctpAc,db:netoExento,cr:0});if(iva>0)lines.push({ac:ivaAc,db:Math.abs(iva),cr:0});lines.push({ac:tpAc,db:0,cr:Math.abs(total)})}
      else{lines.push({ac:tpAc,db:Math.abs(total),cr:0});if(netoExento>0)lines.push({ac:ctpAc,db:0,cr:netoExento});if(iva>0)lines.push({ac:ivaAc,db:0,cr:Math.abs(iva)})}
      if(lines.length>=2)imported.push({id:uid(),empresaId:eObj.id,num:String(n++).padStart(4,"0"),date:dt,desc:glosa,lines,rut:rut,folio:folio,razonSocial:razon,tipoDoc:isCompra?"compra":"venta",tipoDocCod:tipoDocCod,periodo:periodoTrib||dt.slice(0,7).replace("-",""),neto:Math.abs(neto),exento:Math.abs(exento),iva:Math.abs(iva),total:Math.abs(total)});
    });
    if(imported.length>0){
      // Reimportar el mismo periodo (ej. para corregir un bug de un import
      // anterior) reemplaza los asientos con el mismo folio+RUT en vez de
      // duplicarlos.
      const claves=new Set(imported.map(im=>im.tipoDoc+"|"+im.folio+"|"+im.rut));
      setEntries(p=>[...p.filter(e=>!(e.empresaId===eObj.id&&e.tipoDoc===(isCompra?"compra":"venta")&&claves.has(e.tipoDoc+"|"+e.folio+"|"+e.rut))),...imported]);
      aLog("CSV "+tipo+" importado",imported.length+" asientos - "+eObj.name);
      setResult({ok:true,msg:imported.length+" asientos importados de "+dataRows.length+" registros"});
    }
    else setResult({ok:false,msg:"No se pudieron importar asientos. Verifica el formato del CSV."})
  }catch(err){setResult({ok:false,msg:"Error: "+err.message})}};
  const processCSV=(file,tipo)=>{
    if(!/^\d{6}$/.test(periodo)){setResult({ok:false,msg:"Antes de cargar el CSV, ingresa el periodo tributario (AAAAMM) al que corresponde ese libro."});return}
    const rd=new FileReader();rd.onload=ev=>processCSVText(ev.target.result,tipo,periodo);rd.readAsText(file);
  };
  const limpiarDuplicados=()=>{
    const relevantes=empEntries.filter(e=>(e.tipoDoc==="compra"||e.tipoDoc==="venta")&&e.folio&&e.rut);
    const porClave=new Map();
    relevantes.forEach(e=>{
      const clave=e.tipoDoc+"|"+e.folio+"|"+e.rut;
      const prev=porClave.get(clave);
      // Se queda con el que tiene monto (>0); si ambos tienen monto, con el
      // ultimo encontrado (el import mas reciente).
      if(!prev||e.total>0||prev.total===0)porClave.set(clave,e);
    });
    const keepIds=new Set([...porClave.values()].map(e=>e.id));
    const eliminarIds=new Set(relevantes.filter(e=>!keepIds.has(e.id)).map(e=>e.id));
    if(eliminarIds.size===0){setResult({ok:true,msg:"No se encontraron documentos duplicados."});return}
    setEntries(p=>p.filter(e=>!eliminarIds.has(e.id)));
    aLog("Duplicados eliminados",eliminarIds.size+" asientos - "+eObj.name);
    setResult({ok:true,msg:eliminarIds.size+" asientos duplicados o vacios eliminados."});
  };
  const importarAuto=async(tipo)=>{
    if(!/^\d{6}$/.test(periodo)){setResult({ok:false,msg:"Ingresa el periodo en formato AAAAMM, ej: 202605"});return}
    setAutoBusy(tipo);setResult(null);
    try{
      const resp=await fetch(`http://localhost:4001/export?periodo=${periodo}&tipo=${tipo}`);
      const text=await resp.text();
      if(!resp.ok)throw new Error(text||("HTTP "+resp.status));
      processCSVText(text,tipo,periodo);
    }catch(err){
      setResult({ok:false,msg:"No se pudo conectar al puente local del SII. Corre 'node tools/sii-local-server.mjs' en tu computador (ver tools/README.md) y vuelve a intentar. ("+err.message+")"});
    }finally{setAutoBusy(null)}
  };

  return(<div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Periodo tributario</div>
      <div style={{fontSize:12,color:"var(--tx3)",marginBottom:12}}>El mes que corresponde este libro ante el SII (AAAAMM) — no siempre es el mismo mes de la fecha de emision de cada documento. Se usa tanto para importar automatico como para la carga manual, y define en que mes queda cada documento dentro del Libro de Compras/Libro de Ventas.</div>
      <input value={periodo} onChange={e=>setPeriodo(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="Periodo AAAAMM, ej: 202605" style={{padding:"8px 12px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx)",fontSize:13,width:200}}/>
    </div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Importar automatico desde el SII</div>
      <div style={{fontSize:12,color:"var(--tx3)",marginBottom:16}}>Requiere el puente local corriendo en tu computador: <code>node tools/sii-local-server.mjs</code> (despues de <code>sii auth login</code>). Ver <code>tools/README.md</code> para instalarlo.</div>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={()=>importarAuto("compra")} disabled={!!autoBusy} style={{padding:"8px 18px",borderRadius:"var(--rs)",border:"none",background:"var(--cy)",color:"#fff",fontSize:12,fontWeight:600,cursor:autoBusy?"default":"pointer",opacity:autoBusy?.6:1}}>{autoBusy==="compra"?"Importando...":"Importar Compras"}</button>
        <button onClick={()=>importarAuto("venta")} disabled={!!autoBusy} style={{padding:"8px 18px",borderRadius:"var(--rs)",border:"none",background:"var(--pu)",color:"#fff",fontSize:12,fontWeight:600,cursor:autoBusy?"default":"pointer",opacity:autoBusy?.6:1}}>{autoBusy==="venta"?"Importando...":"Importar Ventas"}</button>
      </div>
      <div style={{fontSize:11,color:"var(--tx3)",marginTop:12}}>Si reimportas el mismo periodo, reemplaza los asientos con el mismo folio+RUT en vez de duplicarlos.</div>
    </div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Limpieza</div>
      <div style={{fontSize:12,color:"var(--tx3)",marginBottom:12}}>Si algo quedo duplicado de una importacion anterior (ej. de antes de este arreglo), esto elimina las copias sin monto y deja solo una por documento (folio+RUT).</div>
      <button onClick={limpiarDuplicados} style={{padding:"8px 18px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"transparent",color:"var(--tx2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Eliminar duplicados</button>
    </div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Carga manual de Libros SII</div>
      <div style={{fontSize:12,color:"var(--tx3)",marginBottom:20}}>O sube el CSV descargado del SII a mano (con el periodo de arriba ya puesto). Las compras se contabilizan como: Gastos por Clasificar (debe) + IVA CF (debe) / Proveedores (haber). Las ventas como: Clientes (debe) / Ventas (haber) + IVA DF (haber).</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:20,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>📥</div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Libro de Compras</div>
          <div style={{fontSize:11,color:"var(--tx3)",marginBottom:12}}>CSV del registro de compras SII</div>
          <label style={{display:"inline-flex",alignItems:"center",gap:8,background:"var(--cy)",color:"#fff",padding:"8px 20px",borderRadius:"var(--rs)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Cargar CSV<input type="file" accept=".csv" onChange={e=>{if(e.target.files?.[0])processCSV(e.target.files[0],"compra");e.target.value=""}} style={{display:"none"}}/></label>
        </div>
        <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:20,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>📤</div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Libro de Ventas</div>
          <div style={{fontSize:11,color:"var(--tx3)",marginBottom:12}}>CSV del registro de ventas SII</div>
          <label style={{display:"inline-flex",alignItems:"center",gap:8,background:"var(--pu)",color:"#fff",padding:"8px 20px",borderRadius:"var(--rs)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Cargar CSV<input type="file" accept=".csv" onChange={e=>{if(e.target.files?.[0])processCSV(e.target.files[0],"venta");e.target.value=""}} style={{display:"none"}}/></label>
        </div>
      </div>
    </div>
    {result&&<div style={{background:result.ok?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",border:"1px solid "+(result.ok?"rgba(16,185,129,.3)":"rgba(239,68,68,.3)"),borderRadius:"var(--rs)",padding:16,fontSize:13,color:result.ok?"var(--gn)":"var(--rd)",marginBottom:16}}>{result.ok?"✓ ":"✗ "}{result.msg}</div>}
    <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:16}}>
      <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,marginBottom:8}}>Formato esperado del CSV SII</div>
      <div style={{fontSize:11,color:"var(--tx3)"}}>El sistema acepta el CSV estandar del SII (separado por punto y coma) y el que genera <code>tools/sii-rcv-export.mjs</code> (con o sin columna de Exento). Detecta automaticamente las columnas de Neto, Exento, IVA y Total. Las compras van a la cuenta "Gastos por Clasificar" (1.1.05.001) para que reclasifiques despues.</div>
    </div>
  </div>);
}

// ═══ LIBRO DE COMPRAS / LIBRO DE VENTAS (mensual) ═══
// Agrupa los documentos importados por "periodo" (periodo tributario ante
// el SII, AAAAMM) en vez de por fecha de emision: un documento puede
// emitirse a fin de mes pero reconocerse/recibirse el mes siguiente, y el
// Libro de Compras/Ventas debe reflejar el mes tributario, no la fecha del
// papel.
const MESES=[["01","Enero"],["02","Febrero"],["03","Marzo"],["04","Abril"],["05","Mayo"],["06","Junio"],["07","Julio"],["08","Agosto"],["09","Septiembre"],["10","Octubre"],["11","Noviembre"],["12","Diciembre"]];
const TIPO_DOC_LABELS={"33":"Factura Electronica","34":"Factura No Afecta o Exenta Electronica","39":"Boleta Electronica","41":"Boleta Exenta Electronica","46":"Factura de Compra Electronica","56":"Nota de Debito Electronica","61":"Nota de Credito Electronica","110":"Factura de Exportacion","111":"Nota de Debito de Exportacion","112":"Nota de Credito de Exportacion"};

function LibroCV({empEntries,tipo,eObj}){
  const [filtroAno,setFiltroAno]=useState("todos");
  const [filtroMes,setFiltroMes]=useState("todos");
  const [fFolio,setFFolio]=useState("");
  const [fRut,setFRut]=useState("");
  const [fRazon,setFRazon]=useState("");
  const [fTipoDoc,setFTipoDoc]=useState("todos");
  const [fNetoMin,setFNetoMin]=useState("");
  const [fNetoMax,setFNetoMax]=useState("");
  const [fIvaMin,setFIvaMin]=useState("");
  const [fIvaMax,setFIvaMax]=useState("");
  const [fTotalMin,setFTotalMin]=useState("");
  const [fTotalMax,setFTotalMax]=useState("");
  const [cerrados,setCerrados]=useState(()=>new Set());
  const [rcvOficial,setRcvOficial]=useState(null);
  const [rcvBusy,setRcvBusy]=useState(false);
  const [rcvErr,setRcvErr]=useState(null);
  const fmtPeriodo=p=>{if(!/^\d{6}$/.test(p))return p||"Sin periodo";const mm=MESES.find(m=>m[0]===p.slice(4,6));return(mm?mm[1]:p.slice(4,6))+" "+p.slice(0,4)};
  const fmtTipoDoc=cod=>cod?(TIPO_DOC_LABELS[cod]||"Tipo "+cod)+" ("+cod+")":"—";
  const toggle=p=>setCerrados(prev=>{const n=new Set(prev);n.has(p)?n.delete(p):n.add(p);return n});

  const docsBase=useMemo(()=>empEntries.filter(e=>e.tipoDoc===tipo),[empEntries,tipo]);
  const tiposPresentes=useMemo(()=>[...new Set(docsBase.map(d=>d.tipoDocCod).filter(Boolean))].sort(),[docsBase]);

  const hayFiltroTexto=fFolio||fRut||fRazon||fTipoDoc!=="todos"||fNetoMin||fNetoMax||fIvaMin||fIvaMax||fTotalMin||fTotalMax;
  const docsFiltrados=useMemo(()=>docsBase.filter(d=>{
    if(fFolio&&!String(d.folio||"").toLowerCase().includes(fFolio.toLowerCase()))return false;
    if(fRut&&!String(d.rut||"").toLowerCase().includes(fRut.toLowerCase()))return false;
    if(fRazon&&!String(d.razonSocial||"").toLowerCase().includes(fRazon.toLowerCase()))return false;
    if(fTipoDoc!=="todos"&&(d.tipoDocCod||"")!==fTipoDoc)return false;
    if(fNetoMin&&(d.neto||0)<parseFloat(fNetoMin))return false;
    if(fNetoMax&&(d.neto||0)>parseFloat(fNetoMax))return false;
    if(fIvaMin&&(d.iva||0)<parseFloat(fIvaMin))return false;
    if(fIvaMax&&(d.iva||0)>parseFloat(fIvaMax))return false;
    if(fTotalMin&&(d.total||0)<parseFloat(fTotalMin))return false;
    if(fTotalMax&&(d.total||0)>parseFloat(fTotalMax))return false;
    return true;
  }),[docsBase,fFolio,fRut,fRazon,fTipoDoc,fNetoMin,fNetoMax,fIvaMin,fIvaMax,fTotalMin,fTotalMax]);

  const todosGrupos=useMemo(()=>{
    const m=new Map();
    // Documentos importados antes de que se guardara "periodo" no lo tienen
    // -- se usa el mes de la fecha de emision como respaldo para que no
    // desaparezcan al filtrar por año/mes (no es igual de exacto que el
    // periodo tributario real, pero es mejor que perderlos del filtro).
    docsFiltrados.forEach(d=>{const p=d.periodo||(/^\d{4}-\d{2}/.test(d.date||"")?d.date.slice(0,7).replace("-",""):"Sin periodo");if(!m.has(p))m.set(p,[]);m.get(p).push(d)});
    return[...m.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([periodo,rows])=>({
      periodo,
      rows:rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||(parseInt(a.folio)||0)-(parseInt(b.folio)||0)),
      exento:rows.reduce((s,r)=>s+(r.exento||0),0),
      neto:rows.reduce((s,r)=>s+(r.neto||0),0),
      iva:rows.reduce((s,r)=>s+(r.iva||0),0),
      total:rows.reduce((s,r)=>s+(r.total||0),0),
    }));
  },[docsFiltrados]);

  const anos=useMemo(()=>[...new Set(docsBase.map(d=>d.periodo||(/^\d{4}-\d{2}/.test(d.date||"")?d.date.slice(0,7).replace("-",""):"")).filter(p=>/^\d{6}$/.test(p)).map(p=>p.slice(0,4)))].sort((a,b)=>b.localeCompare(a)),[docsBase]);

  const grupos=useMemo(()=>todosGrupos.filter(g=>{
    if(filtroAno==="todos"&&filtroMes==="todos")return true;
    if(!/^\d{6}$/.test(g.periodo))return false;
    if(filtroAno!=="todos"&&g.periodo.slice(0,4)!==filtroAno)return false;
    if(filtroMes!=="todos"&&g.periodo.slice(4,6)!==filtroMes)return false;
    return true;
  }),[todosGrupos,filtroAno,filtroMes]);

  const granTotal=useMemo(()=>({
    docs:grupos.reduce((s,g)=>s+g.rows.length,0),
    exento:grupos.reduce((s,g)=>s+g.exento,0),
    neto:grupos.reduce((s,g)=>s+g.neto,0),
    iva:grupos.reduce((s,g)=>s+g.iva,0),
    total:grupos.reduce((s,g)=>s+g.total,0),
  }),[grupos]);

  const periodoSel=filtroAno!=="todos"&&filtroMes!=="todos"?filtroAno+filtroMes:null;
  useEffect(()=>{setRcvOficial(null);setRcvErr(null)},[periodoSel,tipo]);

  const oficialTot=useMemo(()=>{
    if(!rcvOficial)return null;
    return{
      docs:rcvOficial.totalDocumentos??rcvOficial.rows.reduce((s,r)=>s+(r.documentos||0),0),
      exento:rcvOficial.rows.reduce((s,r)=>s+(r.exento||0),0),
      neto:rcvOficial.rows.reduce((s,r)=>s+(r.neto||0),0),
      iva:rcvOficial.rows.reduce((s,r)=>s+(r.iva||0),0),
      total:rcvOficial.rows.reduce((s,r)=>s+(r.total||0),0),
    };
  },[rcvOficial]);
  const coincide=oficialTot&&Math.abs(oficialTot.total-granTotal.total)<1&&oficialTot.docs===granTotal.docs;

  const compararRCV=async()=>{
    if(!periodoSel)return;
    setRcvBusy(true);setRcvErr(null);setRcvOficial(null);
    try{
      const resp=await fetch(`http://localhost:4001/summary?periodo=${periodoSel}&tipo=${tipo}`);
      if(!resp.ok){const msg=await resp.text();throw new Error(msg||("HTTP "+resp.status))}
      setRcvOficial(await resp.json());
    }catch(err){
      setRcvErr("No se pudo conectar al puente local del SII. Corre 'node tools/sii-local-server.mjs' en tu computador y vuelve a intentar. ("+err.message+")");
    }finally{setRcvBusy(false)}
  };

  const selStyle={padding:"8px 12px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx)",fontSize:13};
  const ivaLabel=tipo==="compra"?"IVA Recuperable":"IVA Debito Fiscal";

  const limpiarInput={padding:"8px 12px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx)",fontSize:13,width:130};
  const limpiarTodo=()=>{setFiltroAno("todos");setFiltroMes("todos");setFFolio("");setFRut("");setFRazon("");setFTipoDoc("todos");setFNetoMin("");setFNetoMax("");setFIvaMin("");setFIvaMax("");setFTotalMin("");setFTotalMax("")};

  return(<div>
    <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>{tipo==="compra"?"Libro de Compras":"Libro de Ventas"}</div>
        <div style={{fontSize:12,color:"var(--tx3)",marginBottom:16}}>Agrupado por periodo tributario (mes ante el SII), que puede ser distinto al mes de la fecha de emision de cada documento.</div>
      </div>
      <button onClick={()=>window.print()} style={{padding:"8px 18px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf2)",color:"var(--tx2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button>
    </div>

    <div className="no-print" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
      <select value={filtroAno} onChange={e=>setFiltroAno(e.target.value)} style={selStyle}>
        <option value="todos">Todos los años</option>
        {anos.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
      <select value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} style={selStyle}>
        <option value="todos">Todos los meses</option>
        {MESES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      {periodoSel&&<button onClick={compararRCV} disabled={rcvBusy} style={{padding:"8px 18px",borderRadius:"var(--rs)",border:"none",background:"var(--pu)",color:"#fff",fontSize:12,fontWeight:600,cursor:rcvBusy?"default":"pointer",opacity:rcvBusy?.6:1}}>{rcvBusy?"Consultando SII...":"Comparar con RCV oficial"}</button>}
    </div>

    <div className="no-print" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:16,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:12}}>
      <input value={fFolio} onChange={e=>setFFolio(e.target.value)} placeholder="Folio" style={limpiarInput}/>
      <input value={fRut} onChange={e=>setFRut(e.target.value)} placeholder="RUT" style={limpiarInput}/>
      <input value={fRazon} onChange={e=>setFRazon(e.target.value)} placeholder="Razon social" style={{...limpiarInput,width:180}}/>
      <select value={fTipoDoc} onChange={e=>setFTipoDoc(e.target.value)} style={{...selStyle,width:220}}>
        <option value="todos">Todos los tipos de documento</option>
        {tiposPresentes.map(c=><option key={c} value={c}>{fmtTipoDoc(c)}</option>)}
      </select>
      <input value={fNetoMin} onChange={e=>setFNetoMin(e.target.value)} placeholder="Neto min" type="number" style={limpiarInput}/>
      <input value={fNetoMax} onChange={e=>setFNetoMax(e.target.value)} placeholder="Neto max" type="number" style={limpiarInput}/>
      <input value={fIvaMin} onChange={e=>setFIvaMin(e.target.value)} placeholder="IVA min" type="number" style={limpiarInput}/>
      <input value={fIvaMax} onChange={e=>setFIvaMax(e.target.value)} placeholder="IVA max" type="number" style={limpiarInput}/>
      <input value={fTotalMin} onChange={e=>setFTotalMin(e.target.value)} placeholder="Total min" type="number" style={limpiarInput}/>
      <input value={fTotalMax} onChange={e=>setFTotalMax(e.target.value)} placeholder="Total max" type="number" style={limpiarInput}/>
      {(filtroAno!=="todos"||filtroMes!=="todos"||hayFiltroTexto)&&<button onClick={limpiarTodo} style={{padding:"8px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"transparent",color:"var(--tx3)",fontSize:12,cursor:"pointer"}}>Limpiar filtros</button>}
    </div>

    <div className="report">
    <ReportHeader eObj={eObj} title={tipo==="compra"?"Libro de Compras":"Libro de Ventas"} subtitle={periodoSel?fmtPeriodo(periodoSel):"Todos los periodos"}/>

    {grupos.length>0&&<div className="rpt-stats" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
      <div className="rpt-stat" style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:14,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700}}>{granTotal.docs}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Documentos</div></div>
      <div className="rpt-stat" style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:14,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700}}>${fmt(granTotal.exento)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Exento</div></div>
      <div className="rpt-stat" style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:14,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700}}>${fmt(granTotal.neto)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Neto</div></div>
      <div className="rpt-stat" style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:14,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700}}>${fmt(granTotal.iva)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>IVA</div></div>
      <div className="rpt-stat" style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:14,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"var(--cy)"}}>${fmt(granTotal.total)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Total</div></div>
    </div>}

    {rcvErr&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:"var(--rs)",padding:16,fontSize:13,color:"var(--rd)",marginBottom:16}}>✗ {rcvErr}</div>}

    {rcvOficial&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:20}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Resumen Registro de {tipo==="compra"?"Compras":"Ventas"} {fmtPeriodo(periodoSel)} — segun el SII</div>
      <div style={{fontSize:11,color:"var(--tx3)",marginBottom:12}}>Resumen por tipo de documento, tal como lo entrega el SII para este periodo.</div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse",marginBottom:16}}>
        <thead><tr style={{borderBottom:"1px solid var(--bd)"}}>
          <th style={{textAlign:"left",padding:"6px 8px"}}>Tipo Documento</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Documentos</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Exento</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Neto</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>{ivaLabel}</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Total</th>
        </tr></thead>
        <tbody>{rcvOficial.rows.map(r=><tr key={r.codigo} style={{borderBottom:"1px solid var(--bd)"}}>
          <td style={{padding:"6px 8px"}}>{r.descripcion||"—"} ({r.codigo})</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>{r.documentos}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.exento)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.neto)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.iva)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:600}}>${fmt(r.total)}</td>
        </tr>)}</tbody>
      </table></div>
      <div style={{background:coincide?"rgba(16,185,129,.1)":"rgba(245,158,11,.1)",border:"1px solid "+(coincide?"rgba(16,185,129,.3)":"rgba(245,158,11,.3)"),borderRadius:"var(--rs)",padding:16,fontSize:13,color:coincide?"var(--gn)":"var(--yl,#F59E0B)"}}>
        {coincide?"✓ Coincide con el RCV del SII — mismos documentos y mismo total.":
        "⚠ No coincide con el RCV del SII. SII: "+oficialTot.docs+" documentos, $"+fmt(oficialTot.total)+" — RADAR: "+granTotal.docs+" documentos, $"+fmt(granTotal.total)+" (diferencia $"+fmt(Math.abs(oficialTot.total-granTotal.total))+"). Puede que falten documentos por importar en este periodo, o que el SII haya agregado/rechazado documentos despues de tu ultima importacion — vuelve a importar este periodo para actualizar."}
      </div>
    </div>}

    {grupos.length===0?<Ey i="📚" t="Sin documentos" d={docsBase.length===0?("Importa "+(tipo==="compra"?"compras":"ventas")+" del SII en la pestaña 'Compras/Ventas SII'."):"No hay documentos que calcen con los filtros elegidos."}/>:
    grupos.map(g=>{const abierto=!cerrados.has(g.periodo);return(
    <div key={g.periodo} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:16}}>
      <div onClick={()=>toggle(g.periodo)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--cy)"}}>{abierto?"▾":"▸"} {fmtPeriodo(g.periodo)} — {g.rows.length} documentos</div>
        <div style={{fontSize:13,fontWeight:700}}>${fmt(g.total)}</div>
      </div>
      {abierto&&<div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
        <thead><tr style={{borderBottom:"1px solid var(--bd)"}}>
          <th style={{textAlign:"left",padding:"6px 8px"}}>Fecha emision</th>
          <th style={{textAlign:"left",padding:"6px 8px"}}>Folio</th>
          <th style={{textAlign:"left",padding:"6px 8px"}}>Tipo Doc</th>
          <th style={{textAlign:"left",padding:"6px 8px"}}>RUT</th>
          <th style={{textAlign:"left",padding:"6px 8px"}}>Razon social</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Exento</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Neto</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>IVA</th>
          <th style={{textAlign:"right",padding:"6px 8px"}}>Total</th>
        </tr></thead>
        <tbody>{g.rows.map(r=><tr key={r.id} style={{borderBottom:"1px solid var(--bd)"}}>
          <td style={{padding:"6px 8px"}}>{fD(r.date)}</td>
          <td style={{padding:"6px 8px",fontFamily:"monospace"}}>{r.folio}</td>
          <td style={{padding:"6px 8px",fontSize:11,fontFamily:"monospace"}} title={r.tipoDocCod?fmtTipoDoc(r.tipoDocCod):""}>{r.tipoDocCod||"—"}</td>
          <td style={{padding:"6px 8px",fontFamily:"monospace"}}>{r.rut}</td>
          <td style={{padding:"6px 8px"}}>{r.razonSocial}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.exento||0)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.neto||0)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(r.iva||0)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:600}}>${fmt(r.total||0)}</td>
        </tr>)}</tbody>
        <tfoot><tr style={{borderTop:"2px solid var(--bd)",fontWeight:700}}>
          <td colSpan={5} style={{padding:"6px 8px"}}>Total {fmtPeriodo(g.periodo)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(g.exento)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(g.neto)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(g.iva)}</td>
          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(g.total)}</td>
        </tr></tfoot>
      </table></div>}
    </div>)})}
    </div>
  </div>);
}

// ═══ CONCILIACION BANCARIA ═══
function ConciliacionP({entries,setEntries,leafAccts,eObj,empEntries,aLog}){
  const [cuentaBanco,setCuentaBanco]=useState("");
  const [movs,setMovs]=useState(null); // null = sin cartola cargada
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(false);
  const [clasif,setClasif]=useState({}); // {movId: {contracuenta, candidatoId}}

  const bancoLeaf=useMemo(()=>leafAccts.filter(a=>a.cd.startsWith("1.1.01.")),[leafAccts]);
  const nxtNum=useMemo(()=>{const ns=empEntries.map(e=>parseInt(e.num)||0);return Math.max(0,...ns)+1},[empEntries]);

  const cargarCartola=(file)=>{
    if(!cuentaBanco){setErr("Primero elige a que cuenta bancaria corresponde esta cartola.");return}
    setErr(null);setLoading(true);setMovs(null);setClasif({});
    file.arrayBuffer().then(parseCartolaSantander).then(parsed=>{setMovs(parsed);setLoading(false)}).catch(e=>{setErr(e.message);setLoading(false)});
  };

  const analisis=useMemo(()=>{
    if(!movs)return null;
    const contab=[],pend=[];
    for(const m of movs){
      const match=yaContabilizado(m,cuentaBanco,empEntries);
      if(match)contab.push({mov:m,asiento:match});
      else pend.push({mov:m,sugerencia:sugerirContraparte(m,empEntries)});
    }
    return{contab,pend};
  },[movs,cuentaBanco,empEntries]);

  const setContracuenta=(movId,cd)=>setClasif(p=>({...p,[movId]:{...p[movId],contracuenta:cd}}));
  const elegirCandidato=(movId,cand)=>setClasif(p=>({...p,[movId]:{...p[movId],contracuenta:cand.mov.cargoAbono==="C"?"2.1.01.001":"1.1.02.001",candidatoId:cand.id,rut:cand.rut}}));

  const generarAsientos=()=>{
    if(!analisis)return;
    let n=nxtNum;const nuevos=[];
    analisis.pend.forEach(({mov,sugerencia})=>{
      const c=clasif[mov.id];
      const contracuenta=c?.contracuenta||(sugerencia.estado==="match"?(mov.cargoAbono==="C"?"2.1.01.001":"1.1.02.001"):null);
      if(!contracuenta)return;
      nuevos.push(armarAsiento(mov,cuentaBanco,contracuenta,n++,eObj.id,"Conciliacion bancaria"));
    });
    if(nuevos.length===0){setErr("No hay ningun movimiento clasificado todavia — elige contracuenta al menos en uno.");return}
    setEntries(p=>[...p,...nuevos]);
    aLog("Conciliacion bancaria",nuevos.length+" asientos generados - "+eObj.name);
    setMovs(null);setClasif({});setErr(null);
  };

  const fmtRut=r=>{const n=normRut(r);return n?n.slice(0,-1)+"-"+n.slice(-1):""};

  return(<div>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:24,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Conciliacion Bancaria</div>
      <div style={{fontSize:12,color:"var(--tx3)",marginBottom:16}}>Sube la cartola del banco (Santander, formato Historica/Provisoria). Primero se detecta que movimientos ya tienen un asiento contabilizado; para el resto se sugiere la contracuenta cruzando con Compras/Ventas SII ya importadas.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"end"}}>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Cuenta bancaria (Disponible)</label>
          <select value={cuentaBanco} onChange={e=>setCuentaBanco(e.target.value)}><option value="">-- Selecciona --</option>{bancoLeaf.map(a=><option key={a.cd} value={a.cd}>{a.cd} {a.nm}</option>)}</select>
        </div>
        <label style={{display:"inline-flex",alignItems:"center",gap:8,background:"var(--cy)",color:"#fff",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>Cargar cartola<input type="file" accept=".xlsx" onChange={e=>{if(e.target.files?.[0])cargarCartola(e.target.files[0]);e.target.value=""}} style={{display:"none"}}/></label>
      </div>
      {loading&&<div style={{marginTop:12,fontSize:12,color:"var(--tx3)"}}>Leyendo cartola...</div>}
      {err&&<div style={{marginTop:12,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:"var(--rs)",padding:12,fontSize:12,color:"var(--rd)"}}>{err}</div>}
    </div>

    {analisis&&<>
      <div style={{display:"flex",gap:12,marginBottom:16}}>
        <div style={{flex:1,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16,textAlign:"center"}}><div style={{fontSize:24,fontWeight:700,color:"var(--gn)"}}>{analisis.contab.length}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Ya contabilizados</div></div>
        <div style={{flex:1,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16,textAlign:"center"}}><div style={{fontSize:24,fontWeight:700,color:"var(--am)"}}>{analisis.pend.length}</div><div style={{fontSize:11,color:"var(--tx3)"}}>Pendientes de clasificar</div></div>
      </div>

      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid var(--bd)",background:"var(--sf2)",fontSize:13,fontWeight:600}}>Pendientes de clasificar</div>
        {analisis.pend.length===0?<div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>Todo lo de esta cartola ya esta contabilizado.</div>:
        <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid var(--bd)",fontSize:10,color:"var(--tx3)"}}><th style={{textAlign:"left",padding:"8px 12px"}}>Fecha</th><th style={{textAlign:"left",padding:"8px 8px"}}>Glosa</th><th style={{textAlign:"right",padding:"8px 8px"}}>Monto</th><th style={{textAlign:"center",padding:"8px 8px"}}>C/A</th><th style={{textAlign:"left",padding:"8px 12px",minWidth:260}}>Contracuenta / sugerencia</th></tr></thead>
          <tbody>{analisis.pend.map(({mov,sugerencia})=>{
            const c=clasif[mov.id];
            return<tr key={mov.id} style={{borderBottom:"1px solid var(--bd)"}}>
              <td style={{padding:"8px 12px",whiteSpace:"nowrap"}}>{fD(mov.fecha)}</td>
              <td style={{padding:"8px 8px"}}>{mov.descripcion}</td>
              <td style={{padding:"8px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(mov.monto)}</td>
              <td style={{padding:"8px 8px",textAlign:"center"}}>{mov.cargoAbono==="C"?"Cargo":"Abono"}</td>
              <td style={{padding:"8px 12px"}}>
                {sugerencia.estado==="ambiguo"?
                  <select value={c?.candidatoId||""} onChange={e=>{const cand=sugerencia.candidatos.find(x=>x.id===e.target.value);if(cand)elegirCandidato(mov.id,{...cand,mov})}} style={{fontSize:11,marginBottom:4}}>
                    <option value="">-- {sugerencia.candidatos.length} candidatos, elige --</option>
                    {sugerencia.candidatos.map(cand=><option key={cand.id} value={cand.id}>F{cand.folio} {cand.razonSocial} ({fmtRut(cand.rut)})</option>)}
                  </select>
                :sugerencia.estado==="match"?
                  <div style={{fontSize:11,color:sugerencia.confianza==="alta"?"var(--gn)":"var(--am)",marginBottom:4}}>{sugerencia.confianza==="alta"?"✓ ":"⚠ "}F{sugerencia.candidato.folio} {sugerencia.candidato.razonSocial} ({fmtRut(sugerencia.candidato.rut)})</div>
                :<div style={{fontSize:11,color:"var(--tx3)",marginBottom:4}}>{sugerencia.motivo}</div>}
                <input list="cuentasConciliacionList" value={c?.contracuenta??(sugerencia.estado==="match"?(mov.cargoAbono==="C"?"2.1.01.001":"1.1.02.001"):"")} onChange={e=>setContracuenta(mov.id,e.target.value)} placeholder="Codigo de cuenta" style={{fontSize:11,padding:"4px 8px"}}/>
              </td>
            </tr>;
          })}</tbody>
        </table></div>}
      </div>
      <datalist id="cuentasConciliacionList">{leafAccts.map(a=><option key={a.cd} value={a.cd}>{a.nm}</option>)}</datalist>

      <details style={{marginBottom:16}}>
        <summary style={{cursor:"pointer",fontSize:13,fontWeight:600,padding:"10px 0"}}>Ya contabilizados ({analisis.contab.length}) — verificacion</summary>
        <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden",marginTop:8}}>
          {analisis.contab.length===0?<div style={{padding:16,textAlign:"center",color:"var(--tx3)",fontSize:12}}>Ninguno.</div>:
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}><tbody>{analisis.contab.map(({mov,asiento})=><tr key={mov.id} style={{borderBottom:"1px solid var(--bd)"}}>
            <td style={{padding:"6px 12px",whiteSpace:"nowrap"}}>{fD(mov.fecha)}</td><td style={{padding:"6px 8px"}}>{mov.descripcion}</td><td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>${fmt(mov.monto)}</td><td style={{padding:"6px 12px",fontSize:11,color:"var(--tx3)"}}>Asiento N {asiento.num}</td>
          </tr>)}</tbody></table>}
        </div>
      </details>

      <Bt onClick={generarAsientos} p={true}>Generar asientos de los clasificados</Bt>
    </>}
  </div>);
}

// ═══ BALANCE 8 COLUMNAS ═══
function B8Col({empEntries,accts,leafAccts,eObj}){
  if(!empEntries.length)return<Ey i="🔢" t="Sin datos" d="Registra asientos para generar el Balance de 8 Columnas."/>;
  const rows=useMemo(()=>{
    const b={};leafAccts.forEach(a=>{b[a.cd]={db:0,cr:0}});
    empEntries.forEach(e=>e.lines.forEach(l=>{if(!b[l.ac])b[l.ac]={db:0,cr:0};b[l.ac].db+=(l.db||0);b[l.ac].cr+=(l.cr||0)}));
    return leafAccts.map(a=>{
      const s=b[a.cd]||{db:0,cr:0};if(s.db===0&&s.cr===0)return null;
      const sDeb=s.db>s.cr?s.db-s.cr:0;const sCre=s.cr>s.db?s.cr-s.db:0;
      const isDeb=a.tp==="asset"||a.tp==="expense";
      const isBalance=a.tp==="asset"||a.tp==="liability"||a.tp==="equity";
      const invDeb=isBalance?sDeb:0;const invCre=isBalance?sCre:0;
      const resDeb=a.tp==="expense"?sDeb:0;const resCre=a.tp==="income"?sCre:0;
      return{cd:a.cd,nm:a.nm,sumDb:s.db,sumCr:s.cr,salDb:sDeb,salCr:sCre,invDb:invDeb,invCre:invCre,resDb:resDeb,resCre:resCre};
    }).filter(Boolean);
  },[empEntries,leafAccts]);
  const tot=(f)=>rows.reduce((s,r)=>s+(r[f]||0),0);
  return(<div className="report" style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",overflow:"hidden"}}>
    <ReportHeader eObj={eObj} title="Balance de 8 Columnas" subtitle={"Al "+new Date().toLocaleDateString("es-CL")}/>
    <div className="no-print" style={{padding:"16px 20px",borderBottom:"1px solid var(--bd)",background:"var(--sf2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:14,fontWeight:600}}>{eObj?.name} — Balance de 8 Columnas</div><div style={{fontSize:11,color:"var(--tx3)"}}>Al {new Date().toLocaleDateString("es-CL")}</div></div>
      <button onClick={()=>window.print()} style={{padding:"6px 14px",borderRadius:"var(--rs)",border:"1px solid var(--bd)",background:"var(--sf)",color:"var(--tx2)",fontSize:11,fontWeight:600,cursor:"pointer"}}>Exportar PDF</button>
    </div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:800}}>
      <thead><tr style={{background:"var(--sf2)",borderBottom:"1px solid var(--bd)"}}>
        <th rowSpan={2} style={{textAlign:"left",padding:"8px 12px",fontWeight:600,fontSize:10,color:"var(--tx3)",borderRight:"1px solid var(--bd)"}}>Cuenta</th>
        <th colSpan={2} style={{textAlign:"center",padding:"4px 8px",fontWeight:600,fontSize:10,color:"var(--cy)",borderRight:"1px solid var(--bd)",borderBottom:"1px solid var(--bd)"}}>SUMAS</th>
        <th colSpan={2} style={{textAlign:"center",padding:"4px 8px",fontWeight:600,fontSize:10,color:"var(--pu)",borderRight:"1px solid var(--bd)",borderBottom:"1px solid var(--bd)"}}>SALDOS</th>
        <th colSpan={2} style={{textAlign:"center",padding:"4px 8px",fontWeight:600,fontSize:10,color:"var(--gn)",borderRight:"1px solid var(--bd)",borderBottom:"1px solid var(--bd)"}}>INVENTARIO</th>
        <th colSpan={2} style={{textAlign:"center",padding:"4px 8px",fontWeight:600,fontSize:10,color:"var(--am)"}}>RESULTADO</th>
      </tr><tr style={{background:"var(--sf2)",borderBottom:"1px solid var(--bd)",fontSize:9,color:"var(--tx3)"}}>
        <th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Debe</th><th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Haber</th>
        <th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Deudor</th><th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Acreedor</th>
        <th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Activo</th><th style={{textAlign:"right",padding:"4px 8px",borderRight:"1px solid var(--bd)"}}>Pasivo</th>
        <th style={{textAlign:"right",padding:"4px 8px"}}>Perdida</th><th style={{textAlign:"right",padding:"4px 8px"}}>Ganancia</th>
      </tr></thead>
      <tbody>
        {rows.map(r=><tr key={r.cd} style={{borderBottom:"1px solid var(--bd)"}}>
          <td style={{padding:"5px 12px",borderRight:"1px solid var(--bd)",whiteSpace:"nowrap"}}><span style={{fontFamily:"monospace",fontSize:10,marginRight:6}}>{r.cd}</span>{r.nm}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.sumDb?fmt(r.sumDb):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.sumCr?fmt(r.sumCr):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.salDb?fmt(r.salDb):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.salCr?fmt(r.salCr):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.invDb?fmt(r.invDb):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{r.invCre?fmt(r.invCre):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace"}}>{r.resDb?fmt(r.resDb):""}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace"}}>{r.resCre?fmt(r.resCre):""}</td>
        </tr>)}
        <tr style={{borderTop:"2px solid var(--bd2)",background:"var(--sf2)",fontWeight:700}}>
          <td style={{padding:"8px 12px",borderRight:"1px solid var(--bd)"}}>TOTALES</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("sumDb"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("sumCr"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("salDb"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("salCr"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("invDb"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace",borderRight:"1px solid var(--bd)"}}>{fmt(tot("invCre"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace"}}>{fmt(tot("resDb"))}</td>
          <td style={{padding:"8px",textAlign:"right",fontFamily:"monospace"}}>{fmt(tot("resCre"))}</td>
        </tr>
      </tbody>
    </table></div>
  </div>);
}

// ═══ REMUNERACIONES ═══
const AFP_RATES={capital:{r:11.44,sis:1.85},cuprum:{r:11.44,sis:1.85},habitat:{r:11.27,sis:1.85},modelo:{r:10.58,sis:1.85},planvital:{r:11.16,sis:1.85},provida:{r:11.45,sis:1.85},uno:{r:10.69,sis:1.85}};
const SALUD_RATE=0.07;
const CESANTIA_TRAB=0.006;const CESANTIA_EMP_INDEF=0.024;const CESANTIA_EMP_FIJO=0.03;
const UF_APPROX=38500; // approximation
const UTM_APPROX=67000;
// Simplified Impuesto Unico table (monthly, approximate 2024-2026)
function calcImpUnico(baseImponible){
  const utm=UTM_APPROX;
  const t=baseImponible/utm;
  if(t<=13.5)return 0;
  if(t<=30)return Math.round((baseImponible-13.5*utm)*0.04);
  if(t<=50)return Math.round((baseImponible-30*utm)*0.08+16.5*utm*0.04);
  if(t<=70)return Math.round((baseImponible-50*utm)*0.135+20*utm*0.08+16.5*utm*0.04);
  if(t<=90)return Math.round((baseImponible-70*utm)*0.23+20*utm*0.135+20*utm*0.08+16.5*utm*0.04);
  return Math.round((baseImponible-90*utm)*0.304+20*utm*0.23+20*utm*0.135+20*utm*0.08+16.5*utm*0.04);
}

function calcRem(emp){
  const sb=emp.sueldoBase||0;const grat=emp.gratificacion||0;const bonos=emp.bonos||0;const horasExtra=emp.horasExtra||0;const colacion=emp.colacion||0;const movilizacion=emp.movilizacion||0;
  const totalImponible=sb+grat+bonos+horasExtra;
  const totalNoImponible=colacion+movilizacion;
  const totalHaberes=totalImponible+totalNoImponible;
  const afpRate=AFP_RATES[emp.afp||"habitat"]||{r:11.27,sis:1.85};
  const afpMonto=Math.round(totalImponible*afpRate.r/100);
  const sisMonto=Math.round(totalImponible*afpRate.sis/100);
  const saludMonto=Math.round(totalImponible*SALUD_RATE);
  const cesantiaTrab=Math.round(totalImponible*CESANTIA_TRAB);
  const cesantiaEmp=Math.round(totalImponible*(emp.contratoTipo==="fijo"?CESANTIA_EMP_FIJO:CESANTIA_EMP_INDEF));
  const baseImpUnico=totalImponible-afpMonto-saludMonto-cesantiaTrab;
  const impUnico=calcImpUnico(baseImpUnico);
  const totalDescuentos=afpMonto+saludMonto+cesantiaTrab+impUnico;
  const liquido=totalHaberes-totalDescuentos;
  const costoEmpresa=totalHaberes+cesantiaEmp+sisMonto;
  return{totalImponible,totalNoImponible,totalHaberes,afpMonto,sisMonto,saludMonto,cesantiaTrab,cesantiaEmp,impUnico,baseImpUnico,totalDescuentos,liquido,costoEmpresa};
}

function RemP({eObj,rems,setRems,empRems,entries,setEntries,empEntries,leafAccts,aLog,go}){
  const [vw,setVw]=useState("list");
  const [eid,setEid]=useState(null);
  const [fm,setFm]=useState({});
  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa primero."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;

  const emptyF=()=>({nombre:"",rut:"",cargo:"",afp:"habitat",isapre:"fonasa",contratoTipo:"indefinido",sueldoBase:0,gratificacion:0,bonos:0,horasExtra:0,colacion:0,movilizacion:0,periodo:new Date().toISOString().slice(0,7)});

  const openNew=()=>{setFm(emptyF());setEid(null);setVw("form")};
  const openEdit=r=>{setFm({...emptyF(),...r});setEid(r.id);setVw("form")};

  const doSave=()=>{
    if(!fm.nombre||!fm.sueldoBase)return;
    const calc=calcRem(fm);
    const rec={...fm,...calc,id:eid||uid(),empresaId:eObj.id};
    if(eid){setRems(p=>p.map(r=>r.id===eid?rec:r));aLog("Liquidacion actualizada",fm.nombre)}
    else{setRems(p=>[...p,rec]);aLog("Liquidacion creada",fm.nombre)}
    setVw("list");
  };
  const doDel=id=>{setRems(p=>p.filter(r=>r.id!==id));setVw("list")};

  const genAsiento=()=>{
    if(empRems.length===0)return;
    const tSB=empRems.reduce((s,r)=>s+r.totalImponible,0);
    const tNI=empRems.reduce((s,r)=>s+r.totalNoImponible,0);
    const tAFP=empRems.reduce((s,r)=>s+r.afpMonto,0);
    const tSalud=empRems.reduce((s,r)=>s+r.saludMonto,0);
    const tCes=empRems.reduce((s,r)=>s+r.cesantiaTrab,0);
    const tImp=empRems.reduce((s,r)=>s+r.impUnico,0);
    const tLiq=empRems.reduce((s,r)=>s+r.liquido,0);
    const tCesEmp=empRems.reduce((s,r)=>s+r.cesantiaEmp,0);
    const tSIS=empRems.reduce((s,r)=>s+r.sisMonto,0);
    const ns=empEntries.map(e=>parseInt(e.num)||0);
    const n=String(Math.max(0,...ns)+1).padStart(4,"0");
    const lines=[];
    lines.push({ac:"5.2.01",db:tSB+tNI+tCesEmp+tSIS,cr:0});
    const tCotiz=tAFP+tSalud+tCes+tCesEmp+tSIS;
    if(tCotiz>0)lines.push({ac:"2.1.08",db:0,cr:tCotiz});
    if(tImp>0)lines.push({ac:"2.1.05",db:0,cr:tImp});
    lines.push({ac:"2.1.07",db:0,cr:tLiq});
    const entry={id:uid(),empresaId:eObj.id,num:n,date:new Date().toISOString().slice(0,10),desc:"Centralizacion remuneraciones "+empRems[0]?.periodo,lines};
    setEntries(p=>[...p,entry]);
    aLog("Asiento remuneraciones",empRems.length+" trabajadores - "+eObj.name);
    alert("Asiento de centralizacion N"+n+" creado con "+empRems.length+" trabajadores");
  };

  const preview=fm.sueldoBase>0?calcRem(fm):null;

  if(vw==="form")return(<div style={{maxWidth:700,margin:"0 auto"}}>
    <Bk onClick={()=>setVw("list")}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:28}}>
      <h2 style={{fontSize:18,fontWeight:700,marginBottom:24}}>{eid?"Editar":"Nueva"} Liquidacion</h2>
      <Sc t="Trabajador"><FG>
        <Fi l="Nombre completo" v={fm.nombre} s={v=>setFm(p=>({...p,nombre:v}))}/>
        <Fi l="RUT" v={fm.rut} s={v=>setFm(p=>({...p,rut:v}))}/>
        <Fi l="Cargo" v={fm.cargo} s={v=>setFm(p=>({...p,cargo:v}))}/>
        <Fi l="Periodo" v={fm.periodo} s={v=>setFm(p=>({...p,periodo:v}))} t="month"/>
      </FG></Sc>
      <Sc t="Prevision"><FG>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>AFP</label><select value={fm.afp} onChange={e=>setFm(p=>({...p,afp:e.target.value}))}>{Object.keys(AFP_RATES).map(k=><option key={k} value={k}>{k.charAt(0).toUpperCase()+k.slice(1)} ({AFP_RATES[k].r}%)</option>)}</select></div>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Salud</label><select value={fm.isapre} onChange={e=>setFm(p=>({...p,isapre:e.target.value}))}><option value="fonasa">Fonasa (7%)</option><option value="isapre">Isapre</option></select></div>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Contrato</label><select value={fm.contratoTipo} onChange={e=>setFm(p=>({...p,contratoTipo:e.target.value}))}><option value="indefinido">Indefinido</option><option value="fijo">Plazo Fijo</option></select></div>
      </FG></Sc>
      <Sc t="Haberes Imponibles"><FG>
        <Fi l="Sueldo Base" v={fm.sueldoBase} s={v=>setFm(p=>({...p,sueldoBase:parseInt(v)||0}))} t="number"/>
        <Fi l="Gratificacion" v={fm.gratificacion} s={v=>setFm(p=>({...p,gratificacion:parseInt(v)||0}))} t="number"/>
        <Fi l="Bonos" v={fm.bonos} s={v=>setFm(p=>({...p,bonos:parseInt(v)||0}))} t="number"/>
        <Fi l="Horas Extra" v={fm.horasExtra} s={v=>setFm(p=>({...p,horasExtra:parseInt(v)||0}))} t="number"/>
      </FG></Sc>
      <Sc t="Haberes No Imponibles"><FG>
        <Fi l="Colacion" v={fm.colacion} s={v=>setFm(p=>({...p,colacion:parseInt(v)||0}))} t="number"/>
        <Fi l="Movilizacion" v={fm.movilizacion} s={v=>setFm(p=>({...p,movilizacion:parseInt(v)||0}))} t="number"/>
      </FG></Sc>

      {preview&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:20,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"var(--cy)",marginBottom:12}}>Preview Liquidacion</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
          <div style={{color:"var(--tx2)"}}>Total Imponible</div><div style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(preview.totalImponible)}</div>
          <div style={{color:"var(--tx2)"}}>Total No Imponible</div><div style={{textAlign:"right",fontFamily:"monospace"}}>${fmt(preview.totalNoImponible)}</div>
          <div style={{fontWeight:600}}>Total Haberes</div><div style={{textAlign:"right",fontFamily:"monospace",fontWeight:600}}>${fmt(preview.totalHaberes)}</div>
          <div style={{borderTop:"1px solid var(--bd)",paddingTop:8,color:"var(--rd)"}}>AFP ({fm.afp})</div><div style={{borderTop:"1px solid var(--bd)",paddingTop:8,textAlign:"right",fontFamily:"monospace",color:"var(--rd)"}}>-${fmt(preview.afpMonto)}</div>
          <div style={{color:"var(--rd)"}}>Salud (7%)</div><div style={{textAlign:"right",fontFamily:"monospace",color:"var(--rd)"}}>-${fmt(preview.saludMonto)}</div>
          <div style={{color:"var(--rd)"}}>Seg. Cesantia (0.6%)</div><div style={{textAlign:"right",fontFamily:"monospace",color:"var(--rd)"}}>-${fmt(preview.cesantiaTrab)}</div>
          <div style={{color:"var(--rd)"}}>Impuesto Unico</div><div style={{textAlign:"right",fontFamily:"monospace",color:"var(--rd)"}}>-${fmt(preview.impUnico)}</div>
          <div style={{fontWeight:600,color:"var(--rd)"}}>Total Descuentos</div><div style={{textAlign:"right",fontFamily:"monospace",fontWeight:600,color:"var(--rd)"}}>-${fmt(preview.totalDescuentos)}</div>
          <div style={{borderTop:"2px solid var(--bd2)",paddingTop:8,fontSize:14,fontWeight:700,color:"var(--gn)"}}>LIQUIDO</div><div style={{borderTop:"2px solid var(--bd2)",paddingTop:8,textAlign:"right",fontFamily:"monospace",fontSize:14,fontWeight:700,color:"var(--gn)"}}>${fmt(preview.liquido)}</div>
          <div style={{borderTop:"1px solid var(--bd)",paddingTop:8,color:"var(--tx3)",fontSize:11}}>Costo empresa (incl. SIS + cesantia emp.)</div><div style={{borderTop:"1px solid var(--bd)",paddingTop:8,textAlign:"right",fontFamily:"monospace",fontSize:11,color:"var(--tx3)"}}>${fmt(preview.costoEmpresa)}</div>
        </div>
      </div>}

      <div style={{display:"flex",gap:12}}><Bt onClick={doSave} p={true}>{eid?"Guardar":"Crear Liquidacion"}</Bt><Bt onClick={()=>setVw("list")}>Cancelar</Bt></div>
    </div>
  </div>);

  // LIST
  const totLiq=empRems.reduce((s,r)=>s+(r.liquido||0),0);
  const totCosto=empRems.reduce((s,r)=>s+(r.costoEmpresa||0),0);
  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"center",justifyContent:"space-between"}}>
      <div><div style={{fontSize:15,fontWeight:600}}>Remuneraciones - {eObj.name}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{empRems.length} trabajador{empRems.length!==1?"es":""}</div></div>
      <div style={{display:"flex",gap:8}}>{empRems.length>0&&<Bt onClick={genAsiento}>Centralizar</Bt>}<Bt onClick={openNew} p={true}>{IC.plus} Nueva Liquidacion</Bt></div>
    </div>
    {empRems.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16}}><div style={{fontSize:10,textTransform:"uppercase",color:"var(--tx3)",marginBottom:4}}>Total Liquido</div><div style={{fontSize:20,fontWeight:700,color:"var(--gn)"}}>${fmt(totLiq)}</div></div>
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16}}><div style={{fontSize:10,textTransform:"uppercase",color:"var(--tx3)",marginBottom:4}}>Costo Empresa</div><div style={{fontSize:20,fontWeight:700,color:"var(--am)"}}>${fmt(totCosto)}</div></div>
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16}}><div style={{fontSize:10,textTransform:"uppercase",color:"var(--tx3)",marginBottom:4}}>Trabajadores</div><div style={{fontSize:20,fontWeight:700}}>{empRems.length}</div></div>
    </div>}
    {empRems.length===0?<Ey i="👥" t="Sin liquidaciones" d="Crea tu primera liquidacion de sueldo."><Bt onClick={openNew} p={true}>Crear liquidacion</Bt></Ey>
    :<div style={{display:"flex",flexDirection:"column",gap:8}}>{empRems.map(r=><div key={r.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16,display:"flex",alignItems:"center",gap:16,cursor:"pointer"}} onClick={()=>openEdit(r)}>
      <div style={{width:40,height:40,borderRadius:10,background:"var(--sf2)",border:"1px solid var(--bd)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"var(--tx2)",flexShrink:0}}>{(r.nombre||"?").slice(0,2).toUpperCase()}</div>
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{r.nombre}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{r.cargo||"Sin cargo"} - {r.periodo}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:600,color:"var(--gn)"}}>${fmt(r.liquido||0)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>Liquido</div></div>
      <button onClick={e=>{e.stopPropagation();doDel(r.id)}} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",opacity:.5,padding:4}}>x</button>
    </div>)}</div>}
  </div>);
}

// ═══ RADAR TRIBUTARIO EVALUATION ═══
const TRIB_SECTIONS=[
  {id:"f29",title:"Declaraciones F29 (IVA Mensual)",questions:[
    {id:"f29_estado",text:"Estado general F29 ultimos 12 meses?",type:"select",opts:[{v:"al_dia",l:"Al dia"},{v:"atrasado",l:"Con atrasos"},{v:"no_declarado",l:"No declarado"}]},
    {id:"f29_diferencias",text:"Existen diferencias entre F29 y libros de compras/ventas?",type:"select",opts:[{v:"no",l:"No"},{v:"si_menor",l:"Si, menores"},{v:"si_mayor",l:"Si, significativas"}]},
    {id:"f29_ppm",text:"PPM se declara y paga oportunamente?",type:"select",opts:[{v:"si",l:"Si"},{v:"parcial",l:"Parcialmente"},{v:"no",l:"No"}]},
    {id:"f29_retencion",text:"Retenciones de honorarios se declaran?",type:"select",opts:[{v:"si",l:"Si"},{v:"no_aplica",l:"No aplica"},{v:"no",l:"No se declaran"}]},
    {id:"f29_obs",text:"Observaciones F29",type:"textarea"},
  ]},
  {id:"dj",title:"Declaraciones Juradas",questions:[
    {id:"dj_presentadas",text:"DJ presentadas oportunamente?",type:"select",opts:[{v:"si",l:"Todas presentadas"},{v:"parcial",l:"Algunas pendientes"},{v:"no",l:"No presentadas"}]},
    {id:"dj_1887",text:"DJ 1887 (Sueldos) - Estado?",type:"select",opts:[{v:"ok",l:"Presentada correcta"},{v:"rectificar",l:"Requiere rectificacion"},{v:"no_aplica",l:"No aplica"},{v:"pendiente",l:"Pendiente"}]},
    {id:"dj_1879",text:"DJ 1879 (Honorarios) - Estado?",type:"select",opts:[{v:"ok",l:"Presentada correcta"},{v:"rectificar",l:"Requiere rectificacion"},{v:"no_aplica",l:"No aplica"},{v:"pendiente",l:"Pendiente"}]},
    {id:"dj_otras",text:"Otras DJ relevantes pendientes?",type:"text"},
    {id:"dj_obs",text:"Observaciones DJ",type:"textarea"},
  ]},
  {id:"sii",title:"Situacion ante el SII",questions:[
    {id:"sii_anotaciones",text:"Existen anotaciones en el SII?",type:"select",opts:[{v:"no",l:"Sin anotaciones"},{v:"si_leve",l:"Si, leves"},{v:"si_grave",l:"Si, graves"}]},
    {id:"sii_fiscalizacion",text:"Existe fiscalizacion en curso?",type:"select",opts:[{v:"no",l:"No"},{v:"si",l:"Si"}]},
    {id:"sii_fiscal_detalle",text:"Detalle de la fiscalizacion",type:"textarea"},
    {id:"sii_bloqueo",text:"Existe bloqueo de folios o timbraje?",type:"select",opts:[{v:"no",l:"No"},{v:"si",l:"Si"}]},
    {id:"sii_inicio_act",text:"Inicio de actividades vigente y correcto?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"},{v:"revisar",l:"Requiere revision"}]},
    {id:"sii_obs",text:"Observaciones situacion SII",type:"textarea"},
  ]},
  {id:"cumplimiento",title:"Cumplimiento General",questions:[
    {id:"cum_libros",text:"Libros contables al dia?",type:"select",opts:[{v:"si",l:"Si"},{v:"parcial",l:"Parcialmente"},{v:"no",l:"No"}]},
    {id:"cum_patente",text:"Patente municipal al dia?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"},{v:"no_aplica",l:"No aplica"}]},
    {id:"cum_contribuciones",text:"Contribuciones al dia?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"},{v:"no_aplica",l:"No aplica"}]},
    {id:"cum_contratos",text:"Contratos de trabajo formalizados?",type:"select",opts:[{v:"si",l:"Todos"},{v:"parcial",l:"Parcialmente"},{v:"no",l:"No"}]},
    {id:"cum_previred",text:"Cotizaciones previsionales al dia?",type:"select",opts:[{v:"si",l:"Si"},{v:"atrasado",l:"Con atraso"},{v:"no",l:"No"}]},
    {id:"cum_obs",text:"Observaciones cumplimiento",type:"textarea"},
  ]},
  {id:"riesgos",title:"Riesgos y Contingencias Tributarias",questions:[
    {id:"rie_contingencia",text:"Existen contingencias tributarias identificadas?",type:"select",opts:[{v:"no",l:"No"},{v:"si_bajo",l:"Si, riesgo bajo"},{v:"si_medio",l:"Si, riesgo medio"},{v:"si_alto",l:"Si, riesgo alto"}]},
    {id:"rie_monto",text:"Monto estimado contingencias ($)",type:"number"},
    {id:"rie_prescripcion",text:"Existen periodos proximos a prescribir?",type:"select",opts:[{v:"no",l:"No"},{v:"si",l:"Si"}]},
    {id:"rie_detalle",text:"Detalle de riesgos identificados",type:"textarea"},
  ]},
  {id:"profesional",title:"Analisis Profesional",questions:[
    {id:"pro_conclusion",text:"Conclusion general del profesional",type:"textarea",ph:"Analisis integral de la situacion tributaria, recomendaciones, plan de accion..."},
    {id:"pro_riesgo_global",text:"Nivel de riesgo tributario global",type:"select",opts:[{v:"bajo",l:"Bajo"},{v:"medio",l:"Medio"},{v:"alto",l:"Alto"},{v:"critico",l:"Critico"}]},
  ]},
];

function TribV({ev,upd,del,emp,back}){
  const [secIdx,setSecIdx]=useState(0);
  const [showS,setShowS]=useState(false);
  const [aiL,setAiL]=useState(false);
  const [aiR,setAiR]=useState(ev.aiReport||"");
  const r=ev.responses||{};
  const setR=(q,v)=>upd({responses:{...r,[q]:v}});
  const sec=TRIB_SECTIONS[secIdx];
  const answered=Object.keys(r).filter(k=>r[k]!==""&&r[k]!==undefined).length;
  const totalQ=TRIB_SECTIONS.reduce((s,sc)=>s+sc.questions.length,0);

  const genAI=async()=>{
    setAiL(true);
    try{
      const resumen=TRIB_SECTIONS.map(sc=>sc.title+":\n"+sc.questions.map(q=>"  "+q.text+" -> "+(r[q.id]||"Sin respuesta")).join("\n")).join("\n\n");
      const prompt="Eres un contador auditor chileno. Genera INFORME EJECUTIVO de evaluacion RADAR Tributario.\n\nEMPRESA: "+emp.name+"\nRUT: "+(emp.rut||"N/I")+"\nREGIMEN: "+(emp.regimen||"N/I")+"\n\nRESULTADOS:\n"+resumen+"\n\nGenera: 1)RESUMEN EJECUTIVO 2)HALLAZGOS POR AREA 3)NIVEL RIESGO (Bajo/Medio/Alto/Critico) 4)RECOMENDACIONES PRIORIZADAS 5)CONCLUSION. Tono profesional, terminologia chilena. Texto plano, titulos MAYUSCULAS.";
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      if(!resp.ok)throw new Error("Status "+resp.status);
      const data=await resp.json();
      const txt=(data.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n")||"Sin respuesta.";
      setAiR(txt);upd({aiReport:txt});
    }catch(e){const L=[];L.push("INFORME RADAR TRIBUTARIO\n=========================================");L.push("Empresa: "+emp.name+"\nRUT: "+(emp.rut||"N/I")+"\nFecha: "+new Date().toLocaleDateString("es-CL"));TRIB_SECTIONS.forEach(sc=>{L.push("\n"+sc.title.toUpperCase()+"\n-----------------------------------------");sc.questions.forEach(q=>{const v=r[q.id];if(!v||v==="")return;const ol=q.opts?.find(o=>o.v===v)?.l||v;L.push("  "+q.text+" -> "+ol)})});L.push("\n-----------------------------------------\nInforme generado por RADAR");const loc=L.join("\n");setAiR(loc);upd({aiReport:loc})}finally{setAiL(false)}
  };

  if(showS)return(<div style={{maxWidth:800,margin:"0 auto"}}><Bk onClick={()=>setShowS(false)}>Volver a evaluacion</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:32}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:2}}>Evaluacion RADAR</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{emp.name}</div><div style={{fontSize:13,color:"var(--cy)",fontWeight:600,marginTop:4}}>RADAR Tributario</div></div>
      {TRIB_SECTIONS.map((sc,si)=><div key={sc.id} style={{marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--cy)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{sc.title}</div>
        {sc.questions.map(q=>{const val=r[q.id];if(!val||val==="")return null;const optLabel=q.opts?.find(o=>o.v===val)?.l||val;
          return<div key={q.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"6px 0",borderBottom:"1px solid var(--bd)",fontSize:12}}>
            <span style={{color:"var(--tx2)"}}>{q.text}</span>
            <span style={{fontWeight:500,color:val.includes("no")||val.includes("alto")||val.includes("critico")||val.includes("grave")?"var(--rd)":val.includes("si")||val.includes("ok")||val.includes("al_dia")||val.includes("bajo")?"var(--gn)":"var(--am)"}}>{optLabel}</span>
          </div>})}
      </div>)}
      <div style={{borderTop:"1px solid var(--bd)",paddingTop:24,marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:13,fontWeight:700,color:"var(--cy)"}}>Informe con IA</div></div>
          <button onClick={genAI} disabled={aiL} style={{display:"flex",alignItems:"center",gap:8,background:aiL?"var(--sf2)":"linear-gradient(135deg, #06B6D4, #8B5CF6)",color:"#fff",border:"none",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,fontWeight:600,cursor:aiL?"wait":"pointer",opacity:aiL?.7:1}}>{aiL?"Generando...":aiR?"Regenerar":"Generar Informe"}</button>
        </div>
        {aiL&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:32,textAlign:"center"}}><div style={{fontSize:28,marginBottom:12,animation:"rpulse 1.5s infinite"}}>🤖</div><div style={{fontSize:14,fontWeight:600,color:"var(--cy)"}}>Analizando...</div></div>}
        {!aiL&&aiR&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:24}}><div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7}}>{aiR}</div><div style={{display:"flex",gap:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--bd)"}}><button onClick={()=>{navigator.clipboard.writeText(aiR);alert("Copiado!")}} style={{background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--tx2)",padding:"8px 16px",borderRadius:"var(--rs)",fontSize:12}}>Copiar</button></div></div>}
      </div>
    </div></div>);

  return(<div style={{maxWidth:900,margin:"0 auto"}}><Bk onClick={back}>Volver a evaluaciones</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:28}}>⚖️</span><div><div style={{fontSize:15,fontWeight:600}}>RADAR Tributario</div><div style={{fontSize:12,color:"var(--tx3)"}}>{emp.name} - {answered}/{totalQ} respuestas</div></div></div>
      <div style={{display:"flex",gap:8}}><Bt onClick={()=>setShowS(true)}>Resumen</Bt><Bt onClick={()=>upd({status:ev.status==="completada"?"en_proceso":"completada"})} p={ev.status!=="completada"}>{ev.status==="completada"?"Completada":"Completar"}</Bt></div>
    </div>
    {/* Section tabs */}
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{TRIB_SECTIONS.map((sc,i)=>{
      const secAnswered=sc.questions.filter(q=>r[q.id]&&r[q.id]!=="").length;
      return<button key={sc.id} onClick={()=>setSecIdx(i)} style={{padding:"10px 14px",borderRadius:"var(--rs)",border:"none",fontSize:12,fontWeight:secIdx===i?700:500,background:secIdx===i?"var(--cyg)":"var(--sf)",color:secIdx===i?"var(--cy)":"var(--tx2)",position:"relative"}}>{sc.title.split("(")[0].trim()}{secAnswered>0&&<span style={{marginLeft:6,fontSize:9,color:"var(--gn)"}}>{secAnswered}/{sc.questions.length}</span>}</button>})}</div>
    {/* Questions */}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--cy)",marginBottom:4}}>{sec.title}</div>
      {sec.questions.map((q,i)=><div key={q.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",borderLeft:"3px solid "+(r[q.id]&&r[q.id]!==""?"var(--cy)":"var(--bd2)")}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:10,color:"var(--tx3)",background:"var(--sf2)",padding:"2px 8px",borderRadius:4,fontWeight:600}}>P{i+1}</span><span style={{fontSize:13,fontWeight:600}}>{q.text}</span></div>
        {q.type==="select"&&<div style={{display:"flex",flexDirection:"column",gap:6}}>{q.opts.map(o=><button key={o.v} onClick={()=>setR(q.id,o.v)} style={{padding:"10px 16px",borderRadius:"var(--rs)",border:"1px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd)"),background:r[q.id]===o.v?"var(--cyg)":"var(--sf2)",color:r[q.id]===o.v?"var(--cy)":"var(--tx2)",fontSize:13,textAlign:"left",fontWeight:r[q.id]===o.v?600:400,display:"flex",alignItems:"center",gap:8}}><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd2)"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r[q.id]===o.v&&<div style={{width:10,height:10,borderRadius:"50%",background:"var(--cy)"}}/>}</div>{o.l}</button>)}</div>}
        {q.type==="text"&&<input value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="Escriba aqui..." style={{background:"var(--sf2)"}}/>}
        {q.type==="number"&&<input type="number" value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="0" style={{background:"var(--sf2)",maxWidth:250}}/>}
        {q.type==="textarea"&&<textarea value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder={q.ph||"Escriba aqui..."} style={{background:"var(--sf2)"}}/>}
      </div>)}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>
      {secIdx>0?<Bt onClick={()=>setSecIdx(secIdx-1)}>Anterior</Bt>:<div/>}
      {secIdx<TRIB_SECTIONS.length-1&&<Bt onClick={()=>setSecIdx(secIdx+1)} p={true}>Siguiente</Bt>}
    </div>
    <div style={{marginTop:32,padding:"16px 20px",borderRadius:"var(--rs)",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:600,color:"var(--rd)"}}>Eliminar evaluacion</div><button onClick={()=>{if(confirm("Eliminar?"))del()}} style={{background:"transparent",border:"1px solid var(--rd)",color:"var(--rd)",borderRadius:"var(--rs)",padding:"6px 16px",fontSize:12}}>Eliminar</button></div>
  </div>);
}

// ═══ GESTION DOCUMENTAL ═══
const DOC_CATS=[
  {id:"legal",l:"Legal",icon:"📜",items:["Escritura sociedad","Estatutos","Modificaciones","Certificado Vigencia","Poderes"]},
  {id:"tributario",l:"Tributario",icon:"📋",items:["F22","F29","DJ","Carpeta Tributaria","Certificados SII","Resoluciones"]},
  {id:"financiero",l:"Financiero",icon:"📊",items:["Balance","Estado Resultados","EEFF","Notas EEFF","Flujo Efectivo"]},
  {id:"laboral",l:"Laboral",icon:"👥",items:["Contratos","Anexos contrato","Finiquitos","Liquidaciones","Certificados AFC"]},
  {id:"bancario",l:"Bancario",icon:"🏦",items:["Cartolas","Conciliaciones","Contratos bancarios","Pagares"]},
  {id:"auditoria",l:"Auditoría",icon:"🔍",items:["Informe auditor","Papeles trabajo","Carta gerencia","Hallazgos"]},
  {id:"radar",l:"Informes RADAR",icon:"🎯",items:["Evaluacion RADAR","Informe ejecutivo","Plan accion","Seguimiento"]},
  {id:"otros",l:"Otros",icon:"📁",items:["Actas","Permisos","Patentes","Seguros","Contratos comerciales"]},
];

function DocsP({eObj,docs,setDocs,empDocs,aLog,go}){
  const [vw,setVw]=useState("list");
  const [showAdd,setShowAdd]=useState(false);
  const [fm,setFm]=useState({nombre:"",categoria:"tributario",tipo:"",periodo:"",obs:"",fecha:new Date().toISOString().slice(0,10),estado:"vigente"});
  const [filtCat,setFiltCat]=useState("all");

  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa primero."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;

  const addDoc=()=>{
    if(!fm.nombre)return;
    const doc={id:uid(),empresaId:eObj.id,...fm,createdAt:new Date().toISOString()};
    setDocs(p=>[...p,doc]);
    aLog("Documento registrado",fm.nombre+" - "+eObj.name);
    setFm({nombre:"",categoria:"tributario",tipo:"",periodo:"",obs:"",fecha:new Date().toISOString().slice(0,10),estado:"vigente"});
    setShowAdd(false);
  };
  const delDoc=id=>setDocs(p=>p.filter(d=>d.id!==id));
  const toggleEstado=(id)=>setDocs(p=>p.map(d=>d.id===id?{...d,estado:d.estado==="vigente"?"vencido":d.estado==="vencido"?"archivado":"vigente"}:d));

  const filtered=filtCat==="all"?empDocs:empDocs.filter(d=>d.categoria===filtCat);
  const catCounts=DOC_CATS.map(c=>({...c,count:empDocs.filter(d=>d.categoria===c.id).length}));

  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"center",justifyContent:"space-between"}}>
      <div><div style={{fontSize:15,fontWeight:600}}>Documentos - {eObj.name}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{empDocs.length} documento{empDocs.length!==1?"s":""}</div></div>
      <Bt onClick={()=>setShowAdd(!showAdd)} p={true}>{IC.plus} Registrar Documento</Bt>
    </div>

    {/* Category cards */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8,marginBottom:16}}>
      <button onClick={()=>setFiltCat("all")} style={{background:filtCat==="all"?"var(--cyg)":"var(--sf)",border:"1px solid "+(filtCat==="all"?"var(--cy2)":"var(--bd)"),borderRadius:"var(--rs)",padding:"12px 10px",textAlign:"center",color:filtCat==="all"?"var(--cy)":"var(--tx2)",fontSize:11,fontWeight:600}}>Todos ({empDocs.length})</button>
      {catCounts.filter(c=>c.count>0).map(c=><button key={c.id} onClick={()=>setFiltCat(c.id)} style={{background:filtCat===c.id?"var(--cyg)":"var(--sf)",border:"1px solid "+(filtCat===c.id?"var(--cy2)":"var(--bd)"),borderRadius:"var(--rs)",padding:"12px 10px",textAlign:"center",color:filtCat===c.id?"var(--cy)":"var(--tx2)",fontSize:11}}><div style={{fontSize:18}}>{c.icon}</div><div style={{marginTop:4,fontWeight:500}}>{c.l} ({c.count})</div></button>)}
    </div>

    {showAdd&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Registrar documento</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        <Fi l="Nombre del documento" v={fm.nombre} s={v=>setFm(p=>({...p,nombre:v}))}/>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Categoria</label>
          <select value={fm.categoria} onChange={e=>setFm(p=>({...p,categoria:e.target.value,tipo:""}))}>{DOC_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.l}</option>)}</select></div>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Tipo</label>
          <select value={fm.tipo} onChange={e=>setFm(p=>({...p,tipo:e.target.value}))}><option value="">Seleccionar...</option>{(DOC_CATS.find(c=>c.id===fm.categoria)?.items||[]).map(i=><option key={i} value={i}>{i}</option>)}</select></div>
        <Fi l="Periodo (ej: 2025, AT2025, Ene-2025)" v={fm.periodo} s={v=>setFm(p=>({...p,periodo:v}))}/>
        <Fi l="Fecha documento" v={fm.fecha} s={v=>setFm(p=>({...p,fecha:v}))} t="date"/>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Estado</label>
          <select value={fm.estado} onChange={e=>setFm(p=>({...p,estado:e.target.value}))}><option value="vigente">Vigente</option><option value="vencido">Vencido</option><option value="archivado">Archivado</option><option value="pendiente">Pendiente</option></select></div>
      </div>
      <div style={{marginTop:12}}><Fi l="Observaciones" v={fm.obs} s={v=>setFm(p=>({...p,obs:v}))}/></div>
      <div style={{display:"flex",gap:8,marginTop:12}}><Bt onClick={addDoc} p={true}>Registrar</Bt><Bt onClick={()=>setShowAdd(false)}>Cancelar</Bt></div>
    </div>}

    {filtered.length===0?<Ey i="📁" t={filtCat==="all"?"Sin documentos":"Sin documentos en esta categoria"} d="Registra documentos para crear el expediente digital de la empresa."/>
    :<div style={{display:"flex",flexDirection:"column",gap:6}}>{filtered.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(d=>{
      const cat=DOC_CATS.find(c=>c.id===d.categoria);
      const estColor={vigente:"var(--gn)",vencido:"var(--rd)",archivado:"var(--tx3)",pendiente:"var(--am)"};
      return<div key={d.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:20,flexShrink:0}}>{cat?.icon||"📄"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.nombre}</div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{d.tipo||cat?.l||""}{d.periodo?" - "+d.periodo:""}{d.obs?" | "+d.obs:""}</div>
        </div>
        <button onClick={()=>toggleEstado(d.id)} style={{fontSize:10,padding:"3px 10px",borderRadius:12,border:"none",background:estColor[d.estado]+"20",color:estColor[d.estado],fontWeight:600,cursor:"pointer"}}>{d.estado}</button>
        <span style={{fontSize:10,color:"var(--tx3)",flexShrink:0}}>{d.fecha?fD(d.fecha):""}</span>
        <button onClick={()=>delDoc(d.id)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",opacity:.4,padding:4}}>x</button>
      </div>})}</div>}
  </div>);
}

// ═══ RADAR FINANCIERO ═══
const FIN_SECTIONS=[
  {id:"liquidez",title:"Liquidez",questions:[
    {id:"fl_corriente",text:"Razon corriente (AC/PC)?",type:"select",opts:[{v:"mayor2",l:"Mayor a 2 (Excelente)"},{v:"1a2",l:"Entre 1 y 2 (Buena)"},{v:"menor1",l:"Menor a 1 (Deficiente)"}]},
    {id:"fl_acida",text:"Prueba acida (AC-Inv)/PC?",type:"select",opts:[{v:"mayor1",l:"Mayor a 1"},{v:"05a1",l:"Entre 0.5 y 1"},{v:"menor05",l:"Menor a 0.5"}]},
    {id:"fl_capital",text:"Capital de trabajo es positivo?",type:"select",opts:[{v:"si",l:"Si, positivo"},{v:"no",l:"No, negativo"},{v:"justo",l:"Justo / Muy ajustado"}]},
    {id:"fl_obs",text:"Observaciones de liquidez",type:"textarea"},
  ]},
  {id:"endeudamiento",title:"Endeudamiento",questions:[
    {id:"fe_ratio",text:"Nivel de endeudamiento (Pasivos/Activos)?",type:"select",opts:[{v:"bajo",l:"Bajo (menor 40%)"},{v:"medio",l:"Medio (40-70%)"},{v:"alto",l:"Alto (mayor 70%)"}]},
    {id:"fe_leverage",text:"Leverage (Pasivos/Patrimonio)?",type:"select",opts:[{v:"bajo",l:"Menor a 1"},{v:"medio",l:"Entre 1 y 2"},{v:"alto",l:"Mayor a 2"}]},
    {id:"fe_cp_lp",text:"Concentracion de deuda?",type:"select",opts:[{v:"cp",l:"Concentrada en corto plazo"},{v:"lp",l:"Concentrada en largo plazo"},{v:"equilibrada",l:"Equilibrada"}]},
    {id:"fe_obs",text:"Observaciones endeudamiento",type:"textarea"},
  ]},
  {id:"rentabilidad",title:"Rentabilidad",questions:[
    {id:"fr_margen",text:"Margen de utilidad neta?",type:"select",opts:[{v:"alto",l:"Alto (mayor 15%)"},{v:"medio",l:"Medio (5-15%)"},{v:"bajo",l:"Bajo (menor 5%)"},{v:"negativo",l:"Negativo (perdida)"}]},
    {id:"fr_roe",text:"ROE (Utilidad/Patrimonio)?",type:"select",opts:[{v:"bueno",l:"Superior a la industria"},{v:"normal",l:"Normal"},{v:"bajo",l:"Inferior a la industria"}]},
    {id:"fr_ebitda",text:"EBITDA es positivo y creciente?",type:"select",opts:[{v:"si_crece",l:"Si, positivo y creciente"},{v:"si_estable",l:"Si, pero estable"},{v:"si_decrece",l:"Si, pero decreciente"},{v:"no",l:"No, negativo"}]},
    {id:"fr_obs",text:"Observaciones rentabilidad",type:"textarea"},
  ]},
  {id:"operacional",title:"Eficiencia Operacional",questions:[
    {id:"fo_rotacion",text:"Rotacion de inventarios?",type:"select",opts:[{v:"alta",l:"Alta (eficiente)"},{v:"normal",l:"Normal"},{v:"baja",l:"Baja (lenta)"},{v:"na",l:"No aplica"}]},
    {id:"fo_cobro",text:"Periodo promedio de cobro?",type:"select",opts:[{v:"30",l:"Menor a 30 dias"},{v:"60",l:"30-60 dias"},{v:"90",l:"60-90 dias"},{v:"mayor90",l:"Mayor a 90 dias"}]},
    {id:"fo_pago",text:"Periodo promedio de pago a proveedores?",type:"select",opts:[{v:"30",l:"Menor a 30 dias"},{v:"60",l:"30-60 dias"},{v:"90",l:"Mayor a 60 dias"}]},
    {id:"fo_obs",text:"Observaciones eficiencia",type:"textarea"},
  ]},
  {id:"flujo",title:"Flujo de Efectivo",questions:[
    {id:"ff_operacional",text:"Flujo operacional es positivo?",type:"select",opts:[{v:"si",l:"Si"},{v:"no",l:"No"},{v:"nr",l:"No disponible"}]},
    {id:"ff_capacidad",text:"Capacidad de pago de obligaciones financieras?",type:"select",opts:[{v:"holgada",l:"Holgada"},{v:"justa",l:"Justa"},{v:"insuficiente",l:"Insuficiente"}]},
    {id:"ff_obs",text:"Observaciones flujo",type:"textarea"},
  ]},
  {id:"conclusion",title:"Conclusion Profesional",questions:[
    {id:"fp_salud",text:"Salud financiera global",type:"select",opts:[{v:"excelente",l:"Excelente"},{v:"buena",l:"Buena"},{v:"regular",l:"Regular"},{v:"deficiente",l:"Deficiente"},{v:"critica",l:"Critica"}]},
    {id:"fp_conclusion",text:"Conclusion y recomendaciones",type:"textarea",ph:"Analisis integral financiero, riesgos, oportunidades..."},
  ]},
];

function FinV({ev,upd,del,emp,back}){
  const [secIdx,setSecIdx]=useState(0);
  const [showS,setShowS]=useState(false);
  const [aiL,setAiL]=useState(false);
  const [aiR,setAiR]=useState(ev.aiReport||"");
  const r=ev.responses||{};
  const setR=(q,v)=>upd({responses:{...r,[q]:v}});
  const sec=FIN_SECTIONS[secIdx];
  const answered=Object.keys(r).filter(k=>r[k]&&r[k]!=="").length;
  const totalQ=FIN_SECTIONS.reduce((s,sc)=>s+sc.questions.length,0);

  const genAI=async()=>{
    setAiL(true);
    try{
      const resumen=FIN_SECTIONS.map(sc=>sc.title+":\n"+sc.questions.map(q=>"  "+q.text+" -> "+(r[q.id]||"Sin respuesta")).join("\n")).join("\n\n");
      const prompt="Eres un contador auditor chileno. Genera INFORME EJECUTIVO de evaluacion RADAR Financiero.\n\nEMPRESA: "+emp.name+"\nRUT: "+(emp.rut||"N/I")+"\n\nRESULTADOS:\n"+resumen+"\n\nGenera: 1)RESUMEN EJECUTIVO 2)ANALISIS POR AREA (liquidez, endeudamiento, rentabilidad, eficiencia, flujo) 3)INDICADORES CLAVE 4)NIVEL SALUD FINANCIERA 5)RECOMENDACIONES 6)CONCLUSION. Texto plano, titulos MAYUSCULAS.";
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      if(!resp.ok)throw new Error("Status "+resp.status);
      const data=await resp.json();
      const txt=(data.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n")||"Sin respuesta.";
      setAiR(txt);upd({aiReport:txt});
    }catch(e){const L=[];L.push("INFORME RADAR FINANCIERO\n=========================================");L.push("Empresa: "+emp.name+"\nFecha: "+new Date().toLocaleDateString("es-CL"));FIN_SECTIONS.forEach(sc=>{L.push("\n"+sc.title.toUpperCase()+"\n-----------------------------------------");sc.questions.forEach(q=>{const v=r[q.id];if(!v||v==="")return;const ol=q.opts?.find(o=>o.v===v)?.l||v;L.push("  "+q.text+" -> "+ol)})});L.push("\n-----------------------------------------\nInforme generado por RADAR");const loc=L.join("\n");setAiR(loc);upd({aiReport:loc})}finally{setAiL(false)}
  };

  if(showS)return(<div style={{maxWidth:800,margin:"0 auto"}}><Bk onClick={()=>setShowS(false)}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:32}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:2}}>Evaluacion RADAR</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{emp.name}</div><div style={{fontSize:13,color:"var(--gn)",fontWeight:600,marginTop:4}}>RADAR Financiero</div></div>
      {FIN_SECTIONS.map(sc=><div key={sc.id} style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:700,color:"var(--gn)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{sc.title}</div>
        {sc.questions.map(q=>{const val=r[q.id];if(!val||val==="")return null;const ol=q.opts?.find(o=>o.v===val)?.l||val;
          return<div key={q.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"6px 0",borderBottom:"1px solid var(--bd)",fontSize:12}}><span style={{color:"var(--tx2)"}}>{q.text}</span><span style={{fontWeight:500}}>{ol}</span></div>})}</div>)}
      <div style={{borderTop:"1px solid var(--bd)",paddingTop:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"var(--cy)"}}>Informe con IA</div>
          <button onClick={genAI} disabled={aiL} style={{background:aiL?"var(--sf2)":"linear-gradient(135deg,#06B6D4,#10B981)",color:"#fff",border:"none",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,fontWeight:600,cursor:aiL?"wait":"pointer"}}>{aiL?"Generando...":aiR?"Regenerar":"Generar Informe"}</button></div>
        {aiL&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:32,textAlign:"center"}}><div style={{fontSize:28,animation:"rpulse 1.5s infinite"}}>🤖</div></div>}
        {!aiL&&aiR&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:24}}><div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7}}>{aiR}</div><button onClick={()=>{navigator.clipboard.writeText(aiR);alert("Copiado!")}} style={{marginTop:16,background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--tx2)",padding:"8px 16px",borderRadius:"var(--rs)",fontSize:12}}>Copiar</button></div>}
      </div>
    </div></div>);

  return(<div style={{maxWidth:900,margin:"0 auto"}}><Bk onClick={back}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:28}}>📊</span><div><div style={{fontSize:15,fontWeight:600}}>RADAR Financiero</div><div style={{fontSize:12,color:"var(--tx3)"}}>{emp.name} - {answered}/{totalQ}</div></div></div>
      <div style={{display:"flex",gap:8}}><Bt onClick={()=>setShowS(true)}>Resumen</Bt><Bt onClick={()=>upd({status:ev.status==="completada"?"en_proceso":"completada"})} p={ev.status!=="completada"}>{ev.status==="completada"?"Completada":"Completar"}</Bt></div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{FIN_SECTIONS.map((sc,i)=>{const sa=sc.questions.filter(q=>r[q.id]&&r[q.id]!=="").length;return<button key={sc.id} onClick={()=>setSecIdx(i)} style={{padding:"10px 14px",borderRadius:"var(--rs)",border:"none",fontSize:12,fontWeight:secIdx===i?700:500,background:secIdx===i?"var(--cyg)":"var(--sf)",color:secIdx===i?"var(--cy)":"var(--tx2)"}}>{sc.title.split("(")[0].trim()}{sa>0&&<span style={{marginLeft:6,fontSize:9,color:"var(--gn)"}}>{sa}/{sc.questions.length}</span>}</button>})}</div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{fontSize:13,fontWeight:600,color:"var(--gn)",marginBottom:4}}>{sec.title}</div>
      {sec.questions.map((q,i)=><QCard key={q.id} q={q} i={i} r={r} setR={setR}/>)}</div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>{secIdx>0?<Bt onClick={()=>setSecIdx(secIdx-1)}>Anterior</Bt>:<div/>}{secIdx<FIN_SECTIONS.length-1&&<Bt onClick={()=>setSecIdx(secIdx+1)} p={true}>Siguiente</Bt>}</div>
    <div style={{marginTop:32,padding:"16px 20px",borderRadius:"var(--rs)",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:600,color:"var(--rd)"}}>Eliminar</div><button onClick={()=>{if(confirm("Eliminar?"))del()}} style={{background:"transparent",border:"1px solid var(--rd)",color:"var(--rd)",borderRadius:"var(--rs)",padding:"6px 16px",fontSize:12}}>Eliminar</button></div>
  </div>);
}

// ═══ RADAR 360 ═══
function R360V({ev,upd,del,emp,back}){
  const [showS,setShowS]=useState(false);
  const [aiL,setAiL]=useState(false);
  const [aiR,setAiR]=useState(ev.aiReport||"");
  const r=ev.responses||{};
  const setR=(q,v)=>upd({responses:{...r,[q]:v}});
  const ALL_SECS=[...TRIB_SECTIONS,...FIN_SECTIONS];
  const [secIdx,setSecIdx]=useState(0);
  const sec=ALL_SECS[secIdx];
  const answered=Object.keys(r).filter(k=>r[k]&&r[k]!=="").length;
  const totalQ=ALL_SECS.reduce((s,sc)=>s+sc.questions.length,0);

  const genAI=async()=>{
    setAiL(true);
    try{
      const resumen=ALL_SECS.map(sc=>sc.title+":\n"+sc.questions.map(q=>"  "+q.text+" -> "+(r[q.id]||"Sin respuesta")).join("\n")).join("\n\n");
      const prompt="Eres un contador auditor chileno. Genera INFORME EJECUTIVO de evaluacion RADAR 360 (diagnostico integral).\n\nEMPRESA: "+emp.name+"\nRUT: "+(emp.rut||"N/I")+"\n\nRESULTADOS EVALUACION COMPLETA (Tributario + Financiero):\n"+resumen+"\n\nGenera: 1)RESUMEN EJECUTIVO 2)DIAGNOSTICO TRIBUTARIO 3)DIAGNOSTICO FINANCIERO 4)RIESGOS IDENTIFICADOS 5)OPORTUNIDADES 6)RADAR SCORE (califica de 0 a 100) 7)RECOMENDACIONES PRIORIZADAS 8)PLAN DE ACCION 9)CONCLUSION. Texto plano, titulos MAYUSCULAS.";
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      if(!resp.ok)throw new Error("Status "+resp.status);
      const data=await resp.json();
      const txt=(data.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("\n")||"Sin respuesta.";
      setAiR(txt);upd({aiReport:txt});
    }catch(e){const L=[];L.push("INFORME RADAR 360 - DIAGNOSTICO INTEGRAL\n=========================================");L.push("Empresa: "+emp.name+"\nFecha: "+new Date().toLocaleDateString("es-CL"));ALL_SECS.forEach(sc=>{L.push("\n"+sc.title.toUpperCase()+"\n-----------------------------------------");sc.questions.forEach(q=>{const v=r[q.id];if(!v||v==="")return;const ol=q.opts?.find(o=>o.v===v)?.l||v;L.push("  "+q.text+" -> "+ol)})});L.push("\n-----------------------------------------\nInforme generado por RADAR");const loc=L.join("\n");setAiR(loc);upd({aiReport:loc})}finally{setAiL(false)}
  };

  if(showS)return(<div style={{maxWidth:800,margin:"0 auto"}}><Bk onClick={()=>setShowS(false)}>Volver</Bk>
    <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:32}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:2}}>Evaluacion RADAR</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{emp.name}</div><div style={{fontSize:13,color:"var(--rd)",fontWeight:600,marginTop:4}}>RADAR 360 - Diagnostico Integral</div><div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>{answered}/{totalQ} respuestas</div></div>
      <div style={{borderTop:"1px solid var(--bd)",paddingTop:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"var(--cy)"}}>Informe 360 con IA</div>
          <button onClick={genAI} disabled={aiL} style={{background:aiL?"var(--sf2)":"linear-gradient(135deg,#EF4444,#8B5CF6)",color:"#fff",border:"none",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,fontWeight:600,cursor:aiL?"wait":"pointer"}}>{aiL?"Generando...":aiR?"Regenerar":"Generar Informe 360"}</button></div>
        {aiL&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:32,textAlign:"center"}}><div style={{fontSize:28,animation:"rpulse 1.5s infinite"}}>🎯</div><div style={{fontSize:14,fontWeight:600,color:"var(--cy)",marginTop:8}}>Generando diagnostico integral...</div></div>}
        {!aiL&&aiR&&<div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--rs)",padding:24}}><div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7}}>{aiR}</div><button onClick={()=>{navigator.clipboard.writeText(aiR);alert("Copiado!")}} style={{marginTop:16,background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--tx2)",padding:"8px 16px",borderRadius:"var(--rs)",fontSize:12}}>Copiar</button></div>}
      </div>
    </div></div>);

  return(<div style={{maxWidth:900,margin:"0 auto"}}><Bk onClick={back}>Volver</Bk>
    <div style={{background:"linear-gradient(135deg,rgba(239,68,68,.1),rgba(139,92,246,.1))",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:28}}>🎯</span><div><div style={{fontSize:15,fontWeight:600}}>RADAR 360 - Diagnostico Integral</div><div style={{fontSize:12,color:"var(--tx3)"}}>{emp.name} - {answered}/{totalQ}</div></div></div>
      <div style={{display:"flex",gap:8}}><Bt onClick={()=>setShowS(true)}>Resumen</Bt><Bt onClick={()=>upd({status:ev.status==="completada"?"en_proceso":"completada"})} p={ev.status!=="completada"}>{ev.status==="completada"?"Completada":"Completar"}</Bt></div>
    </div>
    <div style={{display:"flex",gap:4,marginBottom:20,flexWrap:"wrap"}}>{ALL_SECS.map((sc,i)=>{const sa=sc.questions.filter(q=>r[q.id]&&r[q.id]!=="").length;return<button key={sc.id+i} onClick={()=>setSecIdx(i)} style={{padding:"8px 12px",borderRadius:"var(--rs)",border:"none",fontSize:11,fontWeight:secIdx===i?700:400,background:secIdx===i?"var(--cyg)":"var(--sf)",color:secIdx===i?"var(--cy)":"var(--tx2)"}}>{sc.title.split("(")[0].trim().slice(0,12)}{sa>0&&<span style={{marginLeft:4,fontSize:8,color:"var(--gn)"}}>{sa}</span>}</button>})}</div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{fontSize:13,fontWeight:600,color:"var(--rd)",marginBottom:4}}>{sec.title}</div>
      {sec.questions.map((q,i)=><QCard key={q.id} q={q} i={i} r={r} setR={setR}/>)}</div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>{secIdx>0?<Bt onClick={()=>setSecIdx(secIdx-1)}>Anterior</Bt>:<div/>}{secIdx<ALL_SECS.length-1&&<Bt onClick={()=>setSecIdx(secIdx+1)} p={true}>Siguiente</Bt>}</div>
    <div style={{marginTop:32,padding:"16px 20px",borderRadius:"var(--rs)",border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:600,color:"var(--rd)"}}>Eliminar</div><button onClick={()=>{if(confirm("Eliminar?"))del()}} style={{background:"transparent",border:"1px solid var(--rd)",color:"var(--rd)",borderRadius:"var(--rs)",padding:"6px 16px",fontSize:12}}>Eliminar</button></div>
  </div>);
}

// Shared question card for section-based evaluations
function QCard({q,i,r,setR}){
  return<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"20px 24px",borderLeft:"3px solid "+(r[q.id]&&r[q.id]!==""?"var(--cy)":"var(--bd2)")}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:10,color:"var(--tx3)",background:"var(--sf2)",padding:"2px 8px",borderRadius:4,fontWeight:600}}>P{i+1}</span><span style={{fontSize:13,fontWeight:600}}>{q.text}</span></div>
    {q.type==="select"&&<div style={{display:"flex",flexDirection:"column",gap:6}}>{q.opts.map(o=><button key={o.v} onClick={()=>setR(q.id,o.v)} style={{padding:"10px 16px",borderRadius:"var(--rs)",border:"1px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd)"),background:r[q.id]===o.v?"var(--cyg)":"var(--sf2)",color:r[q.id]===o.v?"var(--cy)":"var(--tx2)",fontSize:13,textAlign:"left",fontWeight:r[q.id]===o.v?600:400,display:"flex",alignItems:"center",gap:8}}><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid "+(r[q.id]===o.v?"var(--cy)":"var(--bd2)"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r[q.id]===o.v&&<div style={{width:10,height:10,borderRadius:"50%",background:"var(--cy)"}}/>}</div>{o.l}</button>)}</div>}
    {q.type==="text"&&<input value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="Escriba aqui..." style={{background:"var(--sf2)"}}/>}
    {q.type==="number"&&<input type="number" value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder="0" style={{background:"var(--sf2)",maxWidth:250}}/>}
    {q.type==="textarea"&&<textarea value={r[q.id]||""} onChange={e=>setR(q.id,e.target.value)} placeholder={q.ph||"Escriba aqui..."} style={{background:"var(--sf2)"}}/>}
  </div>;
}

// ═══ PLANIFICACION ═══
const TAREA_TIPOS=[{v:"f29",l:"Declaracion F29"},{v:"f22",l:"Declaracion F22"},{v:"dj",l:"Declaracion Jurada"},{v:"balance",l:"Balance"},{v:"eeff",l:"Estados Financieros"},{v:"auditoria",l:"Auditoria"},{v:"patente",l:"Patente Municipal"},{v:"sii",l:"Tramite SII"},{v:"reunion",l:"Reunion"},{v:"informe",l:"Informe"},{v:"otro",l:"Otro"}];
const PRIORIDADES=[{v:"alta",l:"Alta",c:"var(--rd)"},{v:"media",l:"Media",c:"var(--am)"},{v:"baja",l:"Baja",c:"var(--gn)"}];

function PlanP({eObj,tareas,setTareas,empTareas,aLog,go}){
  const [showAdd,setShowAdd]=useState(false);
  const [filtro,setFiltro]=useState("pendiente");
  const [fm,setFm]=useState({titulo:"",tipo:"f29",prioridad:"media",vencimiento:"",notas:"",estado:"pendiente"});

  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa primero."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;

  const addT=()=>{if(!fm.titulo)return;setTareas(p=>[...p,{id:uid(),empresaId:eObj.id,...fm,createdAt:new Date().toISOString()}]);aLog("Tarea creada",fm.titulo);setFm({titulo:"",tipo:"f29",prioridad:"media",vencimiento:"",notas:"",estado:"pendiente"});setShowAdd(false)};
  const toggleT=id=>setTareas(p=>p.map(t=>t.id===id?{...t,estado:t.estado==="pendiente"?"completada":"pendiente"}:t));
  const delT=id=>setTareas(p=>p.filter(t=>t.id!==id));

  const filtered=filtro==="todas"?empTareas:empTareas.filter(t=>t.estado===filtro);
  const pendCount=empTareas.filter(t=>t.estado==="pendiente").length;
  const compCount=empTareas.filter(t=>t.estado==="completada").length;
  const vencidas=empTareas.filter(t=>t.estado==="pendiente"&&t.vencimiento&&t.vencimiento<new Date().toISOString().slice(0,10)).length;

  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"center",justifyContent:"space-between"}}>
      <div><div style={{fontSize:15,fontWeight:600}}>Planificacion - {eObj.name}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{pendCount} pendiente{pendCount!==1?"s":""} · {compCount} completada{compCount!==1?"s":""}</div></div>
      <Bt onClick={()=>setShowAdd(!showAdd)} p={true}>{IC.plus} Nueva Tarea</Bt>
    </div>

    {vencidas>0&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:"var(--rs)",padding:14,marginBottom:16,fontSize:12,color:"var(--rd)",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>⚠️</span>{vencidas} tarea{vencidas>1?"s":""} vencida{vencidas>1?"s":""}!</div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:16}}>
      {[{v:"pendiente",l:"Pendientes ("+pendCount+")"},{v:"completada",l:"Completadas ("+compCount+")"},{v:"todas",l:"Todas ("+empTareas.length+")"}].map(f=><button key={f.v} onClick={()=>setFiltro(f.v)} style={{padding:"10px",borderRadius:"var(--rs)",border:"none",fontSize:12,fontWeight:filtro===f.v?600:400,background:filtro===f.v?"var(--cyg)":"var(--sf)",color:filtro===f.v?"var(--cy)":"var(--tx2)"}}>{f.l}</button>)}
    </div>

    {showAdd&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20,marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        <Fi l="Titulo *" v={fm.titulo} s={v=>setFm(p=>({...p,titulo:v}))}/>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Tipo</label><select value={fm.tipo} onChange={e=>setFm(p=>({...p,tipo:e.target.value}))}>{TAREA_TIPOS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
        <div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>Prioridad</label><select value={fm.prioridad} onChange={e=>setFm(p=>({...p,prioridad:e.target.value}))}>{PRIORIDADES.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
        <Fi l="Vencimiento" v={fm.vencimiento} s={v=>setFm(p=>({...p,vencimiento:v}))} t="date"/>
      </div>
      <div style={{marginTop:12}}><Fi l="Notas" v={fm.notas} s={v=>setFm(p=>({...p,notas:v}))}/></div>
      <div style={{display:"flex",gap:8,marginTop:12}}><Bt onClick={addT} p={true}>Crear Tarea</Bt><Bt onClick={()=>setShowAdd(false)}>Cancelar</Bt></div>
    </div>}

    {filtered.length===0?<Ey i="📋" t="Sin tareas" d={filtro==="pendiente"?"No hay tareas pendientes.":"No hay tareas en esta vista."}/>
    :<div style={{display:"flex",flexDirection:"column",gap:6}}>{filtered.sort((a,b)=>{const po={alta:0,media:1,baja:2};return(po[a.prioridad]||1)-(po[b.prioridad]||1)||(a.vencimiento||"z").localeCompare(b.vencimiento||"z")}).map(t=>{
      const pri=PRIORIDADES.find(p=>p.v===t.prioridad);const tipo=TAREA_TIPOS.find(x=>x.v===t.tipo);
      const vencida=t.estado==="pendiente"&&t.vencimiento&&t.vencimiento<new Date().toISOString().slice(0,10);
      return<div key={t.id} style={{background:"var(--sf)",border:"1px solid "+(vencida?"rgba(239,68,68,.4)":"var(--bd)"),borderRadius:"var(--rs)",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,opacity:t.estado==="completada"?.6:1}}>
        <button onClick={()=>toggleT(t.id)} style={{width:22,height:22,borderRadius:6,border:"2px solid "+(t.estado==="completada"?"var(--gn)":"var(--bd2)"),background:t.estado==="completada"?"var(--gn)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0}}>{t.estado==="completada"&&IC.check}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,textDecoration:t.estado==="completada"?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.titulo}</div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{tipo?.l||""}{t.notas?" | "+t.notas:""}</div>
        </div>
        <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,background:pri?.c+"20",color:pri?.c,fontWeight:600,flexShrink:0}}>{pri?.l}</span>
        {t.vencimiento&&<span style={{fontSize:10,color:vencida?"var(--rd)":"var(--tx3)",flexShrink:0,fontWeight:vencida?600:400}}>{fD(t.vencimiento)}</span>}
        <button onClick={()=>delT(t.id)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",opacity:.4,padding:4}}>x</button>
      </div>})}</div>}
  </div>);
}

// ═══ PORTAL DEL CLIENTE ═══
function PortalP({eObj,empEntries,empDocs,empRems,eEvs,accts,leafAccts,go}){
  if(!eObj)return<Ey i="🏢" t="Selecciona una empresa" d="Activa una empresa para ver su portal."><Bt onClick={()=>go("empresas")} p={true}>Ir a Empresas</Bt></Ey>;

  // Calculate key metrics
  const bals=useMemo(()=>{const b={};leafAccts.forEach(a=>{b[a.cd]={db:0,cr:0}});empEntries.forEach(e=>e.lines.forEach(l=>{if(!b[l.ac])b[l.ac]={db:0,cr:0};b[l.ac].db+=(l.db||0);b[l.ac].cr+=(l.cr||0)}));return b},[empEntries,leafAccts]);
  const getB=(cd,tp)=>{const b=bals[cd]||{db:0,cr:0};return(tp==="asset"||tp==="expense")?b.db-b.cr:b.cr-b.db};
  const totalA=leafAccts.filter(a=>a.tp==="asset").reduce((s,a)=>s+getB(a.cd,a.tp),0);
  const totalL=leafAccts.filter(a=>a.tp==="liability").reduce((s,a)=>s+getB(a.cd,a.tp),0);
  const totalE=leafAccts.filter(a=>a.tp==="equity").reduce((s,a)=>s+getB(a.cd,a.tp),0);
  const totalI=leafAccts.filter(a=>a.tp==="income").reduce((s,a)=>s+getB(a.cd,a.tp),0);
  const totalX=leafAccts.filter(a=>a.tp==="expense").reduce((s,a)=>s+getB(a.cd,a.tp),0);
  const resultado=totalI-totalX;
  const liquidez=totalL>0?(totalA/totalL).toFixed(2):"N/A";
  const endeudam=totalA>0?((totalL/totalA)*100).toFixed(1):"0";

  const lastEval=eEvs.length>0?eEvs[eEvs.length-1]:null;
  const docsPend=empDocs.filter(d=>d.estado==="pendiente").length;
  const docsVenc=empDocs.filter(d=>d.estado==="vencido").length;

  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    {/* Client header */}
    <div style={{background:"linear-gradient(135deg,var(--sf2),var(--sf))",borderRadius:"var(--r)",border:"1px solid var(--bd)",padding:"28px 24px",marginBottom:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:"50%",background:"var(--cy)",opacity:.04}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{fontSize:10,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:2}}>Portal Cliente</div>
          <div style={{fontSize:22,fontWeight:700,marginTop:4}}>{eObj.name}</div>
          <div style={{fontSize:12,color:"var(--tx3)",marginTop:4}}>{eObj.rut} - {eObj.giro||"Sin giro"}</div>
        </div>
        <div style={{width:72,height:72,borderRadius:"50%",background:"var(--cyg)",border:"2px solid var(--cy2)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{fontSize:22,fontWeight:800,color:"var(--cy)"}}>{lastEval?.responses?.pro_riesgo_global==="bajo"?"A":lastEval?.responses?.pro_riesgo_global==="medio"?"B":lastEval?.responses?.pro_riesgo_global==="alto"?"C":"--"}</div>
          <div style={{fontSize:7,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:1}}>Score</div>
        </div>
      </div>
    </div>

    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:20}}>
      {[
        {l:"Activos",v:"$"+fmt(totalA),c:"var(--cy)"},
        {l:"Pasivos",v:"$"+fmt(totalL),c:"var(--rd)"},
        {l:"Patrimonio",v:"$"+fmt(totalE),c:"var(--pu)"},
        {l:"Resultado",v:"$"+fmt(resultado),c:resultado>=0?"var(--gn)":"var(--rd)"},
        {l:"Liquidez",v:liquidez,c:parseFloat(liquidez)>=1?"var(--gn)":"var(--rd)"},
        {l:"Endeudamiento",v:endeudam+"%",c:parseFloat(endeudam)>70?"var(--rd)":"var(--gn)"},
      ].map((k,i)=><div key={i} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:16}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:6}}>{k.l}</div>
        <div style={{fontSize:18,fontWeight:700,color:k.c}}>{k.v}</div>
      </div>)}
    </div>

    {/* Alerts */}
    {(docsPend>0||docsVenc>0)&&<div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:"var(--rs)",padding:16,marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:20}}>⚠️</span>
      <div style={{fontSize:12,color:"var(--am)"}}>
        {docsPend>0&&<span>{docsPend} documento{docsPend>1?"s":""} pendiente{docsPend>1?"s":""}. </span>}
        {docsVenc>0&&<span>{docsVenc} documento{docsVenc>1?"s":""} vencido{docsVenc>1?"s":""}.</span>}
      </div>
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
      {/* Recent documents */}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20}}>
        <div style={{fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:14}}>Ultimos Documentos</div>
        {empDocs.length===0?<div style={{fontSize:12,color:"var(--tx3)",textAlign:"center",padding:"20px 0"}}>Sin documentos</div>
        :empDocs.slice(-5).reverse().map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--bd)",fontSize:12}}>
          <span style={{fontSize:14}}>{DOC_CATS.find(c=>c.id===d.categoria)?.icon||"📄"}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.nombre}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{d.periodo||""}</div></div>
          <span style={{fontSize:10,color:d.estado==="vigente"?"var(--gn)":d.estado==="pendiente"?"var(--am)":"var(--rd)"}}>{d.estado}</span>
        </div>)}
      </div>

      {/* Evaluations */}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20}}>
        <div style={{fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:14}}>Evaluaciones RADAR</div>
        {eEvs.length===0?<div style={{fontSize:12,color:"var(--tx3)",textAlign:"center",padding:"20px 0"}}>Sin evaluaciones</div>
        :eEvs.slice(-5).reverse().map(ev=>{const et=ETYPES.find(t=>t.id===ev.type);return<div key={ev.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--bd)",fontSize:12}}>
          <span style={{fontSize:14}}>{et?.icon||"📋"}</span>
          <div style={{flex:1}}><div style={{fontWeight:500}}>{ev.label}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{new Date(ev.createdAt).toLocaleDateString("es-CL")}</div></div>
          <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ev.status==="completada"?"rgba(16,185,129,.15)":"rgba(245,158,11,.15)",color:ev.status==="completada"?"var(--gn)":"var(--am)"}}>{ev.status==="completada"?"Completada":"En proceso"}</span>
        </div>})}
      </div>

      {/* Employees */}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20}}>
        <div style={{fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:14}}>Remuneraciones</div>
        {empRems.length===0?<div style={{fontSize:12,color:"var(--tx3)",textAlign:"center",padding:"20px 0"}}>Sin liquidaciones</div>
        :empRems.slice(-5).map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--bd)",fontSize:12}}>
          <div style={{width:28,height:28,borderRadius:8,background:"var(--sf2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"var(--tx2)"}}>{(r.nombre||"?").slice(0,2).toUpperCase()}</div>
          <div style={{flex:1}}><div style={{fontWeight:500}}>{r.nombre}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{r.cargo}</div></div>
          <span style={{fontFamily:"monospace",fontSize:11,color:"var(--gn)"}}>${fmt(r.liquido||0)}</span>
        </div>)}
      </div>
    </div>
  </div>);
}

function Bt({children,onClick,p}){return<button onClick={onClick} style={{display:"flex",alignItems:"center",gap:8,background:p?"var(--cy)":"var(--sf2)",color:p?"#fff":"var(--tx2)",border:p?"none":"1px solid var(--bd)",padding:"10px 20px",borderRadius:"var(--rs)",fontSize:13,fontWeight:600}}>{children}</button>}
function Bk({onClick,children}){return<button onClick={onClick} style={{background:"none",border:"none",color:"var(--tx3)",fontSize:12,display:"flex",alignItems:"center",gap:6,marginBottom:16,padding:0}}>{IC.back}{children}</button>}
function Tg({children,c}){return<span style={{fontSize:12,padding:"6px 14px",borderRadius:20,background:c+"15",color:c,border:"1px solid "+c+"30",fontWeight:500}}>{children}</span>}
function Ey({i,t,d,children}){return<div style={{textAlign:"center",padding:"60px 20px",background:"var(--sf)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}><div style={{fontSize:40,marginBottom:12}}>{i}</div><div style={{fontSize:15,fontWeight:600,marginBottom:6}}>{t}</div><div style={{fontSize:13,color:"var(--tx3)",marginBottom:20}}>{d}</div>{children}</div>}
function IC2({t,items}){return<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:20}}><div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"var(--tx3)",marginBottom:14}}>{t}</div>{items.map((it,i)=><div key={i} style={{marginBottom:10}}><div style={{fontSize:10,color:"var(--tx3)",marginBottom:2}}>{it.l}</div><div style={{fontSize:13,fontWeight:500,color:it.v?"var(--tx)":"var(--tx3)"}}>{it.v||"\u2014"}</div></div>)}</div>}
function Sc({t,children}){return<div style={{marginBottom:24}}><div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1.5,color:"var(--cy)",marginBottom:14,paddingBottom:8,borderBottom:"1px solid var(--bd)"}}>{t}</div>{children}</div>}
function FG({children}){return<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>{children}</div>}
function Fi({l,v,s,ph,t="text"}){return<div><label style={{fontSize:11,color:"var(--tx3)",display:"block",marginBottom:6,fontWeight:500}}>{l}</label><input type={t} value={v||""} placeholder={ph||""} onChange={e=>s(e.target.value)}/></div>}
