import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, collection, doc, getDoc, getDocs, getDocFromServer, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, runTransaction, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { POLITICA, TERMINOS, CORREO } from "./legal.js";

/* ================= Firebase ================= */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache() });

/* ================= Constantes ================= */
const KM_MIN = 2, KM_MAX = 20;
const VERSION_TERMINOS = "2026-10-30";
const PAISES = [["+504", "Honduras", 8], ["+52", "México", 10], ["+503", "El Salvador", 8], ["+502", "Guatemala", 8], ["+1", "USA", 10]];
const CIUDADES = ["Choluteca", "Tegucigalpa", "San Pedro Sula", "Comayagua"];
const SUGERENCIAS = ["👋 Hola, ¿cómo vas con mi pedido?", "❓ ¿Por dónde vienes aproximadamente?", "🏠 Ya estoy listo afuera esperando", "🔔 Por favor toca el timbre", "👍 Muchas gracias"];
const EMOJIS = [
  ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥳","🤔","🤩","👍","👎","👏","🙌","🤝","🙏","🤛","🤜","👌","✌️","💪"],
  ["🛵","🚗","🚲","🛺","📦","✉️","📍","🗺️","🏠","🏢","🚪","🔑","⏱️","⏳","🔔","📱","📞","💵","💳","🧾","🚨","⛽"],
  ["🍕","🍔","🍟","🌭","🍿","🌮","🌯","🥗","🍗","🥩","🍱","🍣","🍦","🍰","☕","🥤","🧃","🍺","🍩","🥐"],
  ["✅","❌","⚠️","‼️","❓","💬","🔴","🟢","🔵","💛","💖","🔥","✨","⭐","💯","🎉","🆗","🆒"]];
const EMO_NOMBRES = ["😀 Gestos", "🛵 Reparto", "🍕 Comida", "✨ Símbolos"];
const ESTADOS_FIN = ["ENTREGADO", "CANCELADO", "FINALIZADO", "RECHAZADO", "COMPLETADO"];
const ETIQUETA = { NUEVO: "⏳ Esperando que el local acepte", PENDIENTE: "⏳ Esperando que el local acepte", ACEPTADO: "👨‍🍳 El local aceptó tu pedido", PREPARANDO: "👨‍🍳 Preparando tu pedido", LISTO: "✅ Tu pedido está listo", ASIGNADO: "🛵 Repartidor asignado", EN_CAMINO: "🛵 Tu pedido va en camino", RECOGIDO: "🛵 Tu pedido va en camino", ENTREGADO: "🎉 Pedido entregado", CANCELADO: "🛑 Pedido cancelado", RECHAZADO: "🛑 Pedido rechazado" };

/* Ajustes de esquema (si tus colecciones se llaman distinto, cámbialo aquí) */
const SUBCOLECCIONES_MENU = ["menu", "platos", "productos", "menus"];

/* Tarifas (se sobreescriben desde configuracion/tarifas en tiempo real) */
const cfg = { topePct: 35, envioMax: 30, ganancia: 5, extraPct: 3, minimoLargo: 100, kmMinimo: 5,
  pagoKm: [40, 50, 55, 60, 64, 70, 76, 82, 88, 95, 102, 109, 116, 123, 130, 137, 144, 151, 158] };

/* ================= Estado ================= */
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app"), nav = $("#nav"), layer = $("#layer");
const ls = {
  get(k, d = "") { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const S = {
  user: null, me: null, view: "inicio", params: {},
  restaurantes: [], restSnap: [], menu: { rId: "", rNom: "", items: [], logo: "", lat: 0, lon: 0 },
  filtro: "", filtroPedidos: 0, pedidoActivo: null, unsub: {}, regTmp: {}, regDirs: [], modalidad: "DELIVERY",
  checkout: null
};
const me = () => S.me || { lat: 13.3024, lon: -87.1921, ciudad: "Choluteca" };

/* ================= Utilidades ================= */
const IMG = s => !s ? "" : /^(https?:|data:|blob:)/.test(s) ? s : "data:image/jpeg;base64," + String(s).replace(/\s/g, "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = n => "L. " + n;
const L2 = n => "L. " + Number(n).toFixed(2);
function toast(m, ms = 2600) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms); }
const pick = (d, ks) => { for (const k of ks) if (d[k] !== undefined && d[k] !== null && d[k] !== "") return d[k]; return ""; };
const num = (d, k) => { const v = d[k]; return typeof v === "number" ? v : parseFloat(v) || 0; };
function haversine(a, b, c, d) { const R = 6371, r = x => x * Math.PI / 180; const dl = r(c - a), dn = r(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const fmtHora = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const pedidoUrl = (rId, pId) => doc(db, "restaurantes", rId, "pedidos", pId);

function unsubAll(keys) { for (const k of keys) { if (S.unsub[k]) { S.unsub[k](); delete S.unsub[k]; } } }

/* ================= Tarifas ================= */
function calcularTarifa(kmReal, subtotal) {
  const t = {};
  t.kmCobro = Math.max(KM_MIN, Math.min(KM_MAX, Math.ceil(kmReal)));
  t.pago = cfg.pagoKm[t.kmCobro - KM_MIN];
  const cubrir = t.pago + cfg.ganancia;
  t.envio = Math.min(cubrir, cfg.envioMax);
  t.base = cubrir - t.envio;
  t.minimo = t.kmCobro >= cfg.kmMinimo ? cfg.minimoLargo : 0;
  const maximo = Math.round(subtotal * cfg.topePct / 100);
  const holgura = Math.max(0, maximo - t.base);
  t.extra = Math.min(holgura, Math.round(subtotal * cfg.extraPct / 100));
  t.aumento = t.base + t.extra;
  t.ganancia = cfg.ganancia + t.extra;
  return t;
}
const kmCache = {};
let kmTimer = null;
function kmHacia(rLat, rLon) {
  const m = me();
  if (!rLat || !rLon) { rLat = m.lat + 0.003; rLon = m.lon + 0.003; }
  const k = [rLat, rLon, m.lat, m.lon].map(x => Number(x).toFixed(4)).join(",");
  if (kmCache[k]) return kmCache[k].km;
  const prov = Math.max(0.5, haversine(rLat, rLon, m.lat, m.lon) * 1.3);
  kmCache[k] = { km: prov, final: false };
  fetch(`https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${m.lon},${m.lat}?overview=false`)
    .then(r => r.json()).then(j => {
      const d = j && j.routes && j.routes[0] && j.routes[0].distance;
      if (d) { kmCache[k] = { km: d / 1000, final: true }; clearTimeout(kmTimer); kmTimer = setTimeout(refrescarPorTarifas, 250); }
    }).catch(() => {});
  return prov;
}
const precioVisible = (p, lat, lon) => p + calcularTarifa(kmHacia(lat, lon), Math.round(p)).aumento;
function escucharTarifas() {
  onSnapshot(doc(db, "configuracion", "tarifas"), d => {
    if (!d.exists()) return;
    const x = d.data(), n = (k, def) => typeof x[k] === "number" ? x[k] : def;
    const antes = JSON.stringify(cfg);
    cfg.topePct = n("tope_aumento_pct", cfg.topePct); cfg.envioMax = n("envio_visible_max", cfg.envioMax);
    cfg.ganancia = n("ganancia_pedido", cfg.ganancia); cfg.extraPct = n("ganancia_extra_pct", cfg.extraPct);
    cfg.minimoLargo = n("pedido_minimo", cfg.minimoLargo); cfg.kmMinimo = n("km_pedido_minimo", cfg.kmMinimo);
    if (Array.isArray(x.pago_km) && x.pago_km.length === KM_MAX - KM_MIN + 1 && x.pago_km.every(v => typeof v === "number")) cfg.pagoKm = x.pago_km;
    if (antes !== JSON.stringify(cfg)) refrescarPorTarifas();
  }, () => {});
}
function refrescarPorTarifas() {
  if (!S.user || !S.me) return;
  if (["inicio", "menu", "carrito", "servicio"].includes(S.view) && !$(".full") && !$(".mapfull")) render();
}

/* ================= Navegación ================= */
function go(view, params = {}, replace = false) {
  S.view = view; S.params = params;
  const st = { v: view, p: params };
  if (replace) history.replaceState(st, ""); else history.pushState(st, "");
  render(); window.scrollTo(0, 0);
}
window.addEventListener("popstate", e => {
  cerrarCapas();
  const st = e.state;
  if (st && st.v) { S.view = st.v; S.params = st.p || {}; render(); }
  else if (S.user && S.me) { S.view = "inicio"; S.params = {}; render(); }
});
function cerrarCapas() { layer.innerHTML = ""; unsubAll(["chat"]); if (S.mapa) { try { S.mapa.remove(); } catch {} S.mapa = null; } }
const TABS = ["inicio", "carrito", "pedidos", "cuenta"];

function render() {
  if (!S.user || !S.me) { nav.classList.add("hidden"); app.className = "noNav"; return; }
  const conNav = TABS.includes(S.view);
  nav.classList.toggle("hidden", !conNav);
  app.className = conNav ? "" : "noNav";
  if (conNav) pintarNav();
  const f = { inicio: vInicio, menu: vMenu, carrito: vCarrito, pedidos: vPedidos, cuenta: vCuenta, servicio: vServicio, seguimiento: vSeguimiento, legal: vLegal, direcciones: vDirecciones }[S.view] || vInicio;
  f();
}
function pintarNav() {
  const n = contarCarrito();
  const items = [["inicio", "🏠", "Inicio"], ["carrito", "🛒", n ? `Carrito (${n})` : "Carrito"], ["pedidos", "🧾", "Pedidos"], ["cuenta", "👤", "Cuenta"]];
  const act = S.view === "menu" ? "inicio" : S.view;
  nav.innerHTML = items.map(([v, i, t]) => `<button data-a="tab" data-v="${v}" class="${act === v ? "on" : ""}"><span class="i">${i}</span>${t}</button>`).join("");
}

/* ================= Carrito ================= */
const getCarrito = () => { try { return JSON.parse(ls.get("carrito_web", "[]")); } catch { return []; } };
const setCarrito = c => ls.set("carrito_web", JSON.stringify(c));
const contarCarrito = () => getCarrito().length;
function agregarCarrito(it) {
  const c = getCarrito();
  if (it.img && it.img.length > 150000) it.img = "";
  c.push(it); setCarrito(c); toast("🛒 Agregado al carrito");
}

/* ================= Autenticación / perfil ================= */
async function cargarPerfil(user) {
  let snap = null;
  for (const campo of ["correo", "email"]) {
    const q = await getDocs(query(collection(db, "clientes"), where(campo, "==", user.email), limit(1)));
    if (!q.empty) { snap = q.docs[0]; break; }
  }
  if (!snap) return null;
  const d = snap.data();
  return { id: snap.id, telefono: d.telefono || snap.id, nombre: d.nombre || "", correo: user.email, ciudad: d.ciudad || "Choluteca", idioma: d.idioma || "Español",
    lat: num(d, "lat") || num(d, "latitud") || 13.3024, lon: num(d, "lon") || num(d, "longitud") || -87.1921,
    dir_desc: d.dir_desc || d.direccion || "", direcciones: Array.isArray(d.direcciones) ? d.direcciones : [] };
}
onAuthStateChanged(auth, async user => {
  S.user = user;
  if (!user) { S.me = null; vAuth(); return; }
  try { S.me = await cargarPerfil(user); } catch (e) { console.error(e); }
  if (!S.me) {
    app.innerHTML = `<div class="card c"><h2>No encontramos tu perfil</h2><p class="mu">Tu acceso existe pero no tiene perfil de cliente. Escribe a ${esc(CORREO)}.</p><button class="btn mut" data-a="logout">Cerrar sesión</button></div>`;
    return;
  }
  ls.set("telefono", S.me.telefono);
  escucharTarifas(); escucharLocales();
  const act = ls.get("pedidoActivoId");
  history.replaceState({ v: "inicio", p: {} }, "");
  if (act && ls.get("restIdActivo")) go("seguimiento", { rId: ls.get("restIdActivo"), pId: act }, true);
  else { S.view = "inicio"; render(); }
});

/* ---- Pantalla de acceso ---- */
function vAuth(modo = "login") {
  nav.classList.add("hidden"); app.className = "noNav";
  S.authModo = modo;
  if (modo === "login") app.innerHTML = `<div class="auth"><div class="brand">🛵 LLEVARI</div><div class="sub">Tus antojos favoritos a la puerta</div>
    <div class="card"><h2>¡Hola de nuevo! 👋</h2><p class="mu small">Inicia sesión para continuar con tus pedidos.</p>
    <input id="lemail" type="email" placeholder="Correo electrónico" autocomplete="email">
    <input id="lpass" type="password" placeholder="Contraseña" autocomplete="current-password">
    <button class="btn" data-a="login">ENTRAR AHORA</button>
    <span class="link" data-a="recuperar">¿Olvidaste tu contraseña?</span>
    <span class="link" data-a="authmodo" data-v="registro">¿No tienes cuenta? Regístrate aquí</span>
    <span class="link mu small" data-a="legalPub" data-v="menu">Términos y Política de Privacidad</span></div></div>`;
  else if (modo === "registro") app.innerHTML = `<div class="auth"><div class="brand">🛵 LLEVARI</div><div class="sub">&nbsp;</div>
    <div class="card"><h2>Crea tu cuenta 🚀</h2><p class="mu small">Regístrate rápido y empieza a ordenar.</p>
    <input id="rnombre" placeholder="Nombre completo" autocomplete="name">
    <input id="rcorreo" type="email" placeholder="Correo electrónico" autocomplete="email">
    <div class="row"><select id="rpais" style="flex:.45">${PAISES.map((p, i) => `<option value="${i}">${p[0]} (${p[1]})</option>`).join("")}</select><input id="rtel" type="tel" inputmode="numeric" placeholder="Número" style="flex:.55" maxlength="8"></div>
    <div class="b small" style="margin-top:8px">Selecciona tu ciudad:</div><select id="rciudad">${CIUDADES.map(c => `<option>${c}</option>`).join("")}</select>
    <div class="b small">Idioma de preferencia:</div><select id="ridioma"><option>Español</option><option>English</option></select>
    <input id="rpass" type="password" placeholder="Crea tu contraseña (mínimo 6)" autocomplete="new-password">
    <label class="chk"><input type="checkbox" id="racepto"><span>Soy mayor de 18 años y acepto los Términos y Condiciones y la Política de Privacidad</span></label>
    <span class="link" data-a="legalPub" data-v="terminos" style="padding:4px">📜 Leer Términos y Condiciones</span>
    <span class="link" data-a="legalPub" data-v="politica" style="padding:4px">📄 Leer Política de Privacidad</span>
    <button class="btn" style="background:#D97706" data-a="regpaso1">SIGUIENTE ➔</button>
    <span class="link" data-a="authmodo" data-v="login">¿Ya tienes una cuenta? Inicia sesión</span></div></div>`;
  else if (modo === "registro2") app.innerHTML = `<div class="auth"><div class="brand">🛵 LLEVARI</div><div class="sub">&nbsp;</div>
    <div class="card"><h2>Tus Direcciones 📍</h2><p class="mu small">Agrega al menos una dirección para entregas.</p>
    ${S.regDirs.map((d, i) => `<div class="card row" style="background:#F6F4FB;box-shadow:none"><div class="col">📍 ${esc(d.desc)}</div><button class="back" style="width:36px;height:36px;color:#DC2626" data-a="regdel" data-i="${i}">✕</button></div>`).join("")}
    <button class="btn sky" data-a="mapaNuevaDir" data-v="reg">+ Agregar Nueva Dirección en Mapa</button>
    <button class="btn gr" data-a="regfinal" ${S.regDirs.length ? "" : "disabled"}>FINALIZAR REGISTRO ✅</button>
    <span class="link" data-a="authmodo" data-v="registro">❮ Volver a datos</span></div></div>`;
  const sel = $("#rpais"); if (sel) sel.onchange = () => { $("#rtel").maxLength = PAISES[sel.value][2]; };
  const enter = ev => { if (ev.key === "Enter") { const b = $("[data-a=login]"); if (b) b.click(); } };
  const lp = $("#lpass"); if (lp) lp.onkeydown = enter;
}

async function iniciarSesion() {
  const e = $("#lemail").value.trim(), p = $("#lpass").value;
  if (!e || !p) return toast("Escribe tu correo y contraseña");
  try { await signInWithEmailAndPassword(auth, e, p); }
  catch (er) { toast(mensajeAuth(er)); }
}
function mensajeAuth(er) {
  const c = er && er.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Correo o contraseña incorrectos";
  if (c.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta";
  if (c.includes("weak-password")) return "La contraseña es muy débil (mínimo 6)";
  if (c.includes("invalid-email")) return "Correo no válido";
  if (c.includes("network")) return "Sin conexión. Revisa tu señal";
  if (c.includes("too-many")) return "Demasiados intentos. Espera un momento";
  return "No se pudo completar: " + (er.message || c);
}
async function recuperar() {
  const e = ($("#lemail") && $("#lemail").value.trim()) || prompt("Escribe tu correo para enviarte el enlace:");
  if (!e) return toast("Escribe tu correo");
  try { await sendPasswordResetEmail(auth, e); toast("Te enviamos un correo para restablecer tu contraseña", 4000); }
  catch (er) { toast(mensajeAuth(er)); }
}
function regPaso1() {
  if (!$("#racepto").checked) return toast("Debes aceptar los términos y la política");
  const pi = +$("#rpais").value, t = $("#rtel").value.replace(/\D/g, "");
  const d = { nombre: $("#rnombre").value.trim(), correo: $("#rcorreo").value.trim(), pais: PAISES[pi][0], tel: t, ciudad: $("#rciudad").value, idioma: $("#ridioma").value, pass: $("#rpass").value };
  if (!d.nombre) return toast("Escribe tu nombre");
  if (!/^\S+@\S+\.\S+$/.test(d.correo)) return toast("Correo no válido");
  if (t.length !== PAISES[pi][2]) return toast(`El número debe tener ${PAISES[pi][2]} dígitos`);
  if (d.pass.length < 6) return toast("La contraseña debe tener al menos 6 caracteres");
  S.regTmp = d; vAuth("registro2");
}
async function regFinal() {
  const d = S.regTmp, tel = d.tel, dir = S.regDirs[0];
  const btn = $("[data-a=regfinal]"); btn.disabled = true; btn.textContent = "Creando cuenta...";
  try {
    const ex = await getDoc(doc(db, "clientes", tel));
    if (ex.exists()) { toast("Ese número ya está registrado"); btn.disabled = false; btn.textContent = "FINALIZAR REGISTRO ✅"; return; }
    const cred = await createUserWithEmailAndPassword(auth, d.correo, d.pass);
    await setDoc(doc(db, "clientes", tel), {
      nombre: d.nombre, correo: d.correo, telefono: tel, pais: d.pais, ciudad: d.ciudad, idioma: d.idioma, uid: cred.user.uid,
      lat: dir.lat, lon: dir.lon, dir_desc: dir.desc, direcciones: S.regDirs,
      terminos_aceptados: true, terminos_version: VERSION_TERMINOS, terminos_fecha: serverTimestamp(), mayor_de_18: true, plataforma: "web"
    });
    S.regTmp = {}; S.regDirs = [];
  } catch (er) { toast(mensajeAuth(er)); btn.disabled = false; btn.textContent = "FINALIZAR REGISTRO ✅"; }
}

/* ================= Locales ================= */
function unaSucursalPorMarca(docs) {
  const grupos = new Map();
  for (const d of docs) { const m = (d.data().marca_id || "").toString().trim().toLowerCase(); if (!m) continue; if (!grupos.has(m)) grupos.set(m, []); grupos.get(m).push(d); }
  if (!grupos.size) return docs;
  const elegida = new Map(), m = me();
  for (const [k, lista] of grupos) {
    let mejor = null, mejorKm = Infinity, mejorAb = false;
    for (const d of lista) {
      const x = d.data(); if (x.ciudad && x.ciudad.toLowerCase() !== (m.ciudad || "").toLowerCase()) continue;
      const ab = String(x.estado).toUpperCase() !== "CERRADO"; const la = num(x, "latitud"), lo = num(x, "longitud");
      const km = (!la || !lo) ? 1e9 : haversine(m.lat, m.lon, la, lo);
      if (!mejor || (ab && !mejorAb) || (ab === mejorAb && km < mejorKm)) { mejor = d; mejorKm = km; mejorAb = ab; }
    }
    if (mejor) elegida.set(k, mejor.id);
  }
  return docs.filter(d => { const k = (d.data().marca_id || "").toString().trim().toLowerCase(); if (!k) return true; const id = elegida.get(k); return !id || id === d.id; });
}
let primeraLocales = true;
function escucharLocales() {
  if (S.unsub.locales) return;
  S.unsub.locales = onSnapshot(collection(db, "restaurantes"), snap => {
    const antes = new Map(S.restaurantes.map(r => [r.id, r.estado]));
    S.restaurantes = unaSucursalPorMarca(snap.docs).map(d => { const x = d.data(); return { id: d.id, nombre: x.nombre || x.nombre_local || d.id, estado: String(x.estado || "").toUpperCase(), ciudad: x.ciudad || "", lat: num(x, "latitud"), lon: num(x, "longitud"), logo: x.logoUrl || "", categoria: x.categoria || x.tipo || "", marca: x.marca_id || "" }; });
    const cambio = !primeraLocales && S.restaurantes.some(r => antes.get(r.id) !== r.estado);
    primeraLocales = false;
    if (S.view === "inicio" || (cambio && S.view === "menu")) {
      if (cambio && S.view === "menu" && S.menu.rId) { const r = S.restaurantes.find(x => x.id === S.menu.rId); if (r && r.estado === "CERRADO") { toast("🛑 Este local acaba de cerrar"); go("inicio", {}, true); return; } }
      if (!$(".full") && !$(".mapfull")) render();
    }
  }, err => { console.error(err); S.errLocales = true; if (S.view === "inicio") render(); });
}
function vInicio() {
  const m = me(), q = S.filtro.toLowerCase();
  let lista = S.restaurantes.filter(r => !r.ciudad || r.ciudad.toLowerCase() === (m.ciudad || "").toLowerCase());
  if (q) lista = lista.filter(r => (r.nombre + " " + r.categoria).toLowerCase().includes(q));
  lista.sort((a, b) => (a.estado === "CERRADO") - (b.estado === "CERRADO") || haversine(m.lat, m.lon, a.lat || 0, a.lon || 0) - haversine(m.lat, m.lon, b.lat || 0, b.lon || 0));
  const tarjetas = lista.map(r => {
    const t = calcularTarifa(kmHacia(r.lat, r.lon), 0), cerr = r.estado === "CERRADO";
    return `<div class="card row" data-a="abrirLocal" data-id="${esc(r.id)}" style="${cerr ? "opacity:.6" : ""}"><div class="logo">${r.logo ? `<img src="${esc(IMG(r.logo))}" loading="lazy" alt="">` : "🏪"}</div>
      <div class="col"><h3>${esc(r.nombre)}</h3><div class="small mu">⏱ 20-35 min${r.categoria ? " · " + esc(r.categoria) : ""}</div><div class="small b" style="color:var(--pd)">🛵 Envío ${L(t.envio)}</div></div>
      <span class="badge ${cerr ? "" : "ok"}">${cerr ? "Cerrado" : "Abierto"}</span></div>`;
  }).join("");
  app.innerHTML = `<div class="row" style="margin-bottom:6px"><div class="col"><h1>Hola, ${esc((m.nombre || "").split(" ")[0])} 👋</h1><div class="small mu" data-a="irDirs" style="cursor:pointer">📍 ${esc(m.dir_desc || m.ciudad)} ▾</div></div></div>
    <div class="search"><input id="buscar" type="search" placeholder="🔍 Buscar locales..." value="${esc(S.filtro)}"></div>
    ${S.errLocales ? `<div class="empty"><div class="e">📡</div>No pudimos cargar los locales\nRevisa tu señal e intenta de nuevo</div><button class="btn" data-a="reintentar">REINTENTAR</button>`
      : !S.restaurantes.length ? `<div class="loader">Cargando locales...</div>`
      : tarjetas || `<div class="empty"><div class="e">🔎</div>No hay locales para mostrar</div>`}`;
  const b = $("#buscar"); b.oninput = () => { S.filtro = b.value; const pos = b.selectionStart; vInicio(); const n = $("#buscar"); n.focus(); n.setSelectionRange(pos, pos); };
}

/* ================= Menú ================= */
function normItem(d, id) {
  const p = pick(d, ["p", "nombre", "plato", "pNom", "titulo"]);
  return { id, p: String(p), pr: parseFloat(pick(d, ["pr", "precio", "pPrec"])) || 0, de: String(pick(d, ["de", "descripcion", "desc", "pDesc"])), im: String(pick(d, ["im", "imagen", "img", "pImg", "foto", "imagenUrl"])), op: String(pick(d, ["op", "opciones", "pOps"])), cat: String(pick(d, ["categoria", "cat"])), disp: d.disponible !== false && d.activo !== false };
}
async function cargarMenuItems(rId) {
  for (const sub of SUBCOLECCIONES_MENU) {
    try { const s = await getDocs(collection(db, "restaurantes", rId, sub)); if (!s.empty) return s.docs.map(d => normItem(d.data(), d.id)); } catch {}
  }
  const r = await getDoc(doc(db, "restaurantes", rId)); const d = r.data() || {};
  for (const k of ["menu", "platos", "productos"]) if (Array.isArray(d[k])) return d[k].map((x, i) => normItem(x, String(i)));
  return [];
}
async function abrirLocal(id) {
  const r = S.restaurantes.find(x => x.id === id); if (!r) return;
  if (r.estado === "CERRADO") return toast("🛑 Este local está cerrado ahora");
  S.menu = { rId: id, rNom: r.nombre, items: null, logo: r.logo, lat: r.lat, lon: r.lon };
  go("menu", { id });
  try { S.menu.items = (await cargarMenuItems(id)).filter(i => i.p && i.pr > 0 && i.disp); } catch (e) { console.error(e); S.menu.items = []; toast("No se pudo cargar el menú"); }
  if (S.view === "menu") render();
}
function vMenu() {
  const M = S.menu;
  if (!M.rId) { go("inicio", {}, true); return; }
  const it = M.items;
  const cats = it ? [...new Set(it.map(i => i.cat).filter(Boolean))] : [];
  const f = S.catSel || "";
  const lista = it ? it.filter(i => !f || i.cat === f) : [];
  const t = calcularTarifa(kmHacia(M.lat, M.lon), 0);
  app.innerHTML = `<div class="top"><button class="back" data-a="back">❮</button><div class="col"><h2 style="margin:0">${esc(M.rNom)}</h2><div class="small mu">⏱ 20-35 min · 🛵 Envío ${L(t.envio)}</div></div></div>
    ${cats.length ? `<div style="margin-bottom:8px"><span class="chip ${!f ? "on" : ""}" data-a="cat" data-v="">Todo</span>${cats.map(c => `<span class="chip ${f === c ? "on" : ""}" data-a="cat" data-v="${esc(c)}">${esc(c)}</span>`).join("")}</div>` : ""}
    ${it === null ? `<div class="loader">Cargando menú...</div>` : !lista.length ? `<div class="empty"><div class="e">🍽️</div>Este local aún no tiene productos</div>` :
      lista.map((i, n) => `<div class="card row" data-a="plato" data-i="${it.indexOf(i)}"><div class="thumb">${i.im ? `<img src="${esc(IMG(i.im))}" loading="lazy" alt="">` : "🍽️"}</div><div class="col"><div class="b">${esc(i.p)}</div>${i.de ? `<div class="small mu" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(i.de)}</div>` : ""}<div class="price" style="margin-top:4px">${L(Math.round(precioVisible(i.pr, M.lat, M.lon)))}</div></div><span class="back" style="display:flex;align-items:center;justify-content:center">+</span></div>`).join("")}`;
}

/* ---- Hoja de producto ---- */
function parseOpciones(opStr) {
  const grupos = [];
  if (!opStr || !opStr.trim()) return grupos;
  for (const g of opStr.split("/")) {
    const pt = g.split(":"); if (pt.length < 2) continue;
    let cb = false; const li = [];
    for (const o of pt.slice(1).join(":").split(",")) {
      if (!o.trim()) continue;
      let nO = o.trim(), pOp = 0;
      if (nO.includes("+")) { const se = nO.split("+"); nO = se[0].trim(); const v = parseFloat((se[1] || "").replace(/[^0-9.]/g, "")); if (!isNaN(v)) { pOp = v; if (v > 0) cb = true; } }
      li.push({ n: nO, p: pOp });
    }
    if (cb) li.unshift({ n: "No gracias", p: 0 });
    grupos.push({ n: pt[0].trim(), ops: li });
  }
  return grupos;
}
function abrirPlato(item) {
  const M = S.menu, grupos = parseOpciones(item.op), sel = grupos.map(() => 0);
  let cnt = 1;
  const calc = () => {
    let ex = 0; grupos.forEach((g, i) => ex += g.ops[sel[i]].p);
    const u = item.pr + ex, sub = Math.round(u * cnt);
    const t = calcularTarifa(kmHacia(M.lat, M.lon), sub), productos = sub + t.aumento, total = productos + t.envio;
    return { u, sub, t, productos, total };
  };
  const sugeridos = S.menu.items.filter(x => x.p !== item.p).slice(0, 4);
  layer.innerHTML = `<div class="full" id="plato">
    <div class="hero">🍽️${item.im ? `<img src="${esc(IMG(item.im))}" alt="">` : ""}<span class="rn">🏪 ${esc(M.rNom)}</span></div>
    <button class="back floatback" data-a="cerrarPlato">❮</button>
    <div style="padding:20px 18px 6px"><h1 style="font-size:26px">${esc(item.p)}</h1>${item.de ? `<p class="mu">${esc(item.de)}</p>` : ""}<div class="price" style="font-size:24px" id="pp"></div></div>
    ${grupos.map((g, gi) => `<div class="grp"><div class="row"><h3 class="col">${esc(g.n)}</h3><span class="badge" style="background:#F1F5F9;color:#334155">Obligatorio</span></div><div class="small mu" style="margin:4px 0 6px">Selecciona una opción</div>
      ${g.ops.map((o, oi) => `<label class="opt"><input type="radio" name="g${gi}" data-g="${gi}" data-o="${oi}" ${oi === 0 ? "checked" : ""}><span class="col">${esc(o.n)}</span>${o.p > 0 ? `<span class="mu b small">+ ${L2(o.p)}</span>` : ""}</label>`).join("")}</div>`).join("")}
    ${sugeridos.length ? `<h2 style="padding:20px 18px 0">Otras personas lo combinaron con</h2>${sugeridos.map(s => `<div class="row" style="padding:8px 18px;cursor:pointer" data-a="otroPlato" data-i="${S.menu.items.indexOf(s)}"><div class="thumb">${s.im ? `<img src="${esc(IMG(s.im))}" loading="lazy" alt="">` : "🍽️"}</div><div class="col">${esc(s.p)}<div class="b" style="margin-top:4px">${L(Math.round(precioVisible(s.pr, M.lat, M.lon)))}</div></div><span class="back" style="display:flex;align-items:center;justify-content:center">+</span></div>`).join("")}` : ""}
    <div class="sheetbot"><div class="row"><h2 class="col" style="margin:0">Tu producto</h2><h2 id="tp" style="margin:0"></h2></div>
      <div class="row" style="margin-top:14px"><div class="qty"><button id="qm">－</button><b id="qc" style="min-width:24px;text-align:center">1</b><button id="qp">＋</button></div><button class="btn" id="pedir" style="margin:0;flex:1;height:56px"></button></div>
      <button class="btn soft" id="alcarro" style="border:2px solid var(--p);margin-top:10px">🛒 Agregar al carrito</button></div></div>`;
  const root = $("#plato");
  const pintar = () => { const c = calc(); $("#qc").textContent = cnt; $("#pp").textContent = L2(c.productos / cnt) + (cnt > 1 ? " c/u" : ""); $("#tp").textContent = L(c.productos); $("#pedir").textContent = "Pedir • " + L(c.total); };
  const opcionesTxt = () => grupos.map((g, i) => g.ops[sel[i]].n.toLowerCase() === "no gracias" ? null : `${g.n}: ${g.ops[sel[i]].n}`).filter(Boolean).join(" / ");
  root.addEventListener("change", e => { const r = e.target; if (r.dataset.g !== undefined) { sel[+r.dataset.g] = +r.dataset.o; pintar(); } });
  $("#qm", root).onclick = () => { if (cnt > 1) { cnt--; pintar(); } };
  $("#qp", root).onclick = () => { cnt++; pintar(); };
  $("#alcarro", root).onclick = () => {
    const c = calc(); const lat = M.lat || me().lat + 0.003, lon = M.lon || me().lon + 0.003;
    agregarCarrito({ rId: M.rId, rNom: M.rNom, nombre: `${cnt}x ${item.p}`, precio: c.u * cnt, opciones: opcionesTxt(), img: item.im, lat, lon });
    layer.innerHTML = ""; if (S.view === "menu") vMenu(); pintarNav();
  };
  $("#pedir", root).onclick = () => {
    const c = calc(); const lat = M.lat || me().lat + 0.003, lon = M.lon || me().lon + 0.003, ops = opcionesTxt();
    S.checkout = { rId: M.rId, rNom: M.rNom, texto: `${cnt}x ${item.p}` + (ops ? ` (${ops})` : ""), subtotal: c.u * cnt, img: item.im, lat, lon, items: [{ nombre: `${cnt}x ${item.p}`, opciones: ops, precio: c.u * cnt }] };
    layer.innerHTML = ""; go("servicio");
  };
  pintar();
}

/* ================= Carrito (vista) ================= */
function agruparCarrito() {
  const g = new Map();
  for (const [i, it] of getCarrito().entries()) {
    if (!g.has(it.rId)) g.set(it.rId, { rId: it.rId, rNom: it.rNom, lat: it.lat, lon: it.lon, sub: 0, items: [] });
    const x = g.get(it.rId); x.sub += it.precio; x.items.push({ ...it, idx: i });
  }
  return [...g.values()];
}
function vCarrito() {
  const gs = agruparCarrito(), n = contarCarrito();
  if (!gs.length) { app.innerHTML = `<h1>Tu carrito</h1><div class="empty"><div class="e">🛒</div>Tu carrito está vacío\nAgrega platillos desde tus locales favoritos</div>`; return; }
  app.innerHTML = `<h1>Tu carrito</h1><div class="mu small" style="margin-bottom:14px">${n} ${n === 1 ? "producto" : "productos"}${gs.length > 1 ? " · " + gs.length + " locales" : ""}</div>` +
    gs.map(g => {
      const t = calcularTarifa(kmHacia(g.lat, g.lon), Math.round(g.sub));
      return `<div class="card row"><div class="logo">🏪</div><div class="col"><h3>${esc(g.rNom)}</h3><div class="small mu">⏱ Recibes en 20-35 min</div><div class="small b" style="color:var(--pd)">🛵 Envío ${L(t.envio)}</div></div></div>
      ${g.items.map(it => { const vis = it.precio + (g.sub > 0 ? t.aumento * it.precio / g.sub : 0); return `<div class="card row"><div class="thumb">${it.img ? `<img src="${esc(IMG(it.img))}" loading="lazy" alt="">` : "🍽️"}</div><div class="col"><div class="b">${esc(it.nombre)}</div>${it.opciones ? `<div class="small mu">${esc(it.opciones)}</div>` : ""}<div class="price" style="margin-top:4px">${L2(vis)}</div></div><button class="back" style="background:#FEE2E2" data-a="quitar" data-i="${it.idx}">🗑</button></div>`; }).join("")}
      ${t.minimo > 0 && Math.round(g.sub) < t.minimo ? `<div class="warn">⚠️ Pedido mínimo ${L(t.minimo)} en este local (te faltan ${L(t.minimo - Math.round(g.sub))})</div>` : ""}
      <button class="btn ac" data-a="pedirLocal" data-id="${esc(g.rId)}">PEDIR ESTE LOCAL ➔ ${L2(g.sub + t.aumento + t.envio)}</button>
      <button class="btn soft" data-a="masLocal" data-id="${esc(g.rId)}">➕ Agregar más de este local</button><div style="height:14px"></div>`;
    }).join("");
}
function pedirDesdeCarrito(rId) {
  const g = agruparCarrito().find(x => x.rId === rId); if (!g) return;
  S.checkout = { rId, rNom: g.rNom, texto: g.items.map(i => i.nombre + (i.opciones ? ` (${i.opciones})` : "")).join(" + "), subtotal: g.sub, img: (g.items[0] || {}).img || "", lat: g.lat, lon: g.lon, items: g.items.map(i => ({ nombre: i.nombre, opciones: i.opciones, precio: i.precio })), desdeCarrito: true };
  go("servicio");
}

/* ================= Tipo de servicio / confirmar pedido ================= */
function vServicio() {
  const C = S.checkout; if (!C) { go("inicio", {}, true); return; }
  const del = S.modalidad === "DELIVERY", sub = Math.round(C.subtotal), t = calcularTarifa(kmHacia(C.lat, C.lon), sub);
  const productos = sub + t.aumento, total = del ? productos + t.envio : sub, falta = del && t.minimo > 0 && sub < t.minimo;
  C.total = total; C.envio = del ? t.envio : 0; C.productos = del ? productos : sub;
  const r = S.restaurantes.find(x => x.id === C.rId);
  app.innerHTML = `<div class="top"><button class="back" data-a="back">❮</button><h2 class="col c" style="margin:0">Tu pedido</h2><span style="width:42px"></span></div>
    <div class="card row"><div class="logo">${r && r.logo ? `<img src="${esc(IMG(r.logo))}" alt="">` : "🏪"}</div><div class="col"><h3>${esc(C.rNom)}</h3><div class="small mu">Pago en efectivo · 💳 Tarjeta: próximamente</div></div><div style="font-size:30px">🛵</div></div>
    <div class="seg"><button data-a="modal" data-v="DELIVERY" class="${del ? "on" : ""}">🛵 Delivery</button><button data-a="modal" data-v="PICKUP" class="${!del ? "on" : ""}">🏪 Retiro en local</button></div>
    <div style="padding:0 4px 14px">${del ? "⏱ Recibes en 20-35 min" : "🏪 Pasas por tu pedido cuando esté listo"}<div class="b" style="color:var(--pd);margin-top:6px">${del ? "🛵 Envío " + L(t.envio) : "Sin costo de envío"}</div>${del ? `<div class="small mu" style="margin-top:6px">📍 ${esc(me().dir_desc || me().ciudad)} · <span class="link" style="display:inline;padding:0" data-a="irDirs">cambiar</span></div>` : ""}</div>
    <div class="card"><div class="b">${esc(C.texto)}</div></div>
    <div class="card sum"><h2>Resumen</h2><div class="r"><span>Productos</span><b>${L(C.productos)}</b></div>${del ? `<div class="r"><span>Envío</span><b>${L(t.envio)}</b></div>` : ""}
      <div class="r t"><span>${del ? "Total a pagar al repartidor" : "Total a pagar en el local"}</span><b>${L(total)}</b></div>${falta ? `<div class="warn">⚠️ Pedido mínimo para delivery: ${L(t.minimo)} (te faltan ${L(t.minimo - sub)})</div>` : ""}</div>
    <button class="btn" id="confirmar" style="${falta ? "opacity:.55" : ""}">Confirmar pedido • ${L(total)}</button>`;
}
async function confirmarPedido() {
  const C = S.checkout, del = S.modalidad === "DELIVERY";
  if (S.enviando) return; if (!C) return;
  const sub = Math.round(C.subtotal), t = calcularTarifa(kmHacia(C.lat, C.lon), sub);
  if (del && t.minimo > 0 && sub < t.minimo) return toast(`Pedido mínimo para delivery a tu distancia: ${L(t.minimo)}. Te faltan ${L(t.minimo - sub)}. Agrega más o elige Retiro.`, 4500);
  if (del && !me().dir_desc) return toast("Agrega una dirección de entrega en Cuenta ➔ Mis direcciones", 4000);
  S.enviando = true; toast("Verificando conexión...");
  try {
    const rd = await getDocFromServer(doc(db, "restaurantes", C.rId));
    if (String(rd.data().estado).toUpperCase() === "CERRADO") { S.enviando = false; toast("🛑 Este local está cerrado ahora. No se envió tu pedido.", 4000); go("inicio", {}, true); return; }
  } catch (e) { S.enviando = false; return avisoServidor(); }
  overlay();
  const m = me();
  const base = { estado: "NUEVO", cliente_nombre: m.nombre, cliente_telefono: m.telefono, cliente_lat: m.lat, cliente_lon: m.lon, cliente_direccion_desc: m.dir_desc,
    restaurante_nombre: C.rNom, pedido: C.texto, plato: C.texto, detalle: C.texto, items: C.items, tipo_servicio: S.modalidad, tipo: S.modalidad, pago: "EFECTIVO",
    productos: C.productos, envio: C.envio, total: C.total, subtotal_local: sub, origen: "web", hora_creacion: fmtHora(), timestamp: Timestamp.now() };
  try {
    const { ref, n } = await crearPedidoConId(C.rId, base);
    await setDoc(doc(db, "clientes", m.telefono, "mis_pedidos", ref.id), { rId: C.rId, pId: ref.id, id_numerico: n, rNombre: C.rNom, estado: "NUEVO", total: C.total, tipo_servicio: S.modalidad, pedido: C.texto, hora_creacion: base.hora_creacion, timestamp: base.timestamp });
    ls.set("pedidoActivoId", ref.id); ls.set("restIdActivo", C.rId); ls.set("rNombreActivo", C.rNom);
    if (C.desdeCarrito) setCarrito(getCarrito().filter(i => i.rId !== C.rId));
    S.checkout = null; S.enviando = false;
    setTimeout(() => { quitarOverlay(); go("seguimiento", { rId: C.rId, pId: ref.id }, true); }, 1400);
  } catch (e) { console.error(e); S.enviando = false; quitarOverlay(); toast("No se pudo enviar el pedido: " + e.message, 5000); }
}
async function crearPedidoConId(rId, m) {
  const col = collection(db, "restaurantes", rId, "pedidos"), resRef = doc(db, "restaurantes", rId), pedRef = doc(col);
  let base = 1000;
  try { const q = await getDocs(query(col, orderBy("id_numerico", "desc"), limit(1))); if (!q.empty) { const x = q.docs[0].data().id_numerico; if (typeof x === "number" && x > base) base = x; } } catch {}
  try {
    const n = await runTransaction(db, async tr => {
      const r = await tr.get(resRef), c = r.data().contador_pedidos, nuevo = Math.max(typeof c === "number" ? c : 0, base) + 1;
      tr.update(resRef, { contador_pedidos: nuevo }); tr.set(pedRef, { ...m, id_numerico: nuevo }); return nuevo;
    });
    return { ref: pedRef, n };
  } catch (e) {
    toast("ID no asignado: " + e.message, 3500);
    const r = await addDoc(col, m); return { ref: r, n: 0 };
  }
}
function overlay() { const o = document.createElement("div"); o.className = "overlay"; o.id = "ov"; o.innerHTML = `<div class="em">🛵</div><div style="font-size:34px;font-weight:800;letter-spacing:.15em;margin:16px 0 6px">LLEVARI</div><div style="color:#DDD6FE">Procesando tu pedido con éxito...</div>`; document.body.appendChild(o); }
function quitarOverlay() { const o = $("#ov"); if (o) o.remove(); }
function avisoServidor() {
  modal(`<div class="c"><div style="font-size:46px">⚠️</div><h2>Problemas con el servidor</h2><p class="mu">No podemos conectar con el servidor ahora mismo. Tu pedido NO se envió. Intenta de nuevo en unos minutos.</p><button class="btn" data-a="cerrarModal">ENTENDIDO</button></div>`);
}
function modal(html) { const d = document.createElement("div"); d.className = "modal"; d.id = "modal"; d.innerHTML = `<div class="box">${html}</div>`; document.body.appendChild(d); return d; }
function cerrarModal() { const m = $("#modal"); if (m) m.remove(); }

/* ================= Seguimiento ================= */
function vSeguimiento() {
  const { rId, pId } = S.params;
  if (!rId || !pId) { go("inicio", {}, true); return; }
  nav.classList.add("hidden"); app.className = "noNav";
  app.innerHTML = `<div class="top"><button class="back" data-a="cerrarSeg">❮</button><h2 class="col" style="margin:0">Tu pedido</h2><button class="btn ac" style="width:auto;margin:0;padding:10px 16px;font-size:14px;display:none" id="btnchat" data-a="abrirChat">💬 Chat Repartidor</button></div>
    <div class="card"><div class="b" id="sgEstado" style="font-size:17px">Cargando...</div><div class="small mu" id="sgInfo"></div><div class="small mu" id="sgDet" style="margin-top:6px"></div><div class="b" id="sgCobro" style="margin-top:8px;color:var(--pd)"></div></div>
    <div id="sgMapa" class="map"></div><div id="sgAcc"></div>`;
  unsubAll(["seg"]);
  let mapa = null, mc = null, mr = null, mrep = null;
  S.unsub.seg = onSnapshot(pedidoUrl(rId, pId), snap => {
    if (!snap.exists()) { limpiarActivo(); toast("Este pedido ya no existe"); go("inicio", {}, true); return; }
    const d = snap.data(), es = String(d.estado || "").toUpperCase();
    $("#sgEstado").textContent = ETIQUETA[es] || ("📦 " + es);
    $("#sgInfo").textContent = `Pedido #${d.id_numerico || ""} · ${d.restaurante_nombre || ""}`;
    const rn = d.repartidor_nombre || d.repartidor || ""; const rt = d.repartidor_telefono || "";
    $("#sgDet").innerHTML = rn ? `🛵 ${esc(rn)}${rt ? ` · <a href="tel:${esc(rt)}">${esc(rt)}</a>` : ""}` : esc(d.pedido || "");
    $("#sgCobro").textContent = d.total ? `${d.tipo_servicio === "PICKUP" ? "Pagas en el local" : "Pagas al repartidor"}: ${L(d.total)}` : "";
    $("#btnchat").style.display = (rn || ["ASIGNADO", "EN_CAMINO", "RECOGIDO"].includes(es)) ? "" : "none";
    const cancelable = es === "NUEVO" || es === "PENDIENTE";
    $("#sgAcc").innerHTML = cancelable ? `<button class="btn red" data-a="cancelar">Cancelar pedido</button>` : "";
    // mapa
    const cl = [num(d, "cliente_lat"), num(d, "cliente_lon")], rs = S.restaurantes.find(x => x.id === rId);
    const rl = rs && rs.lat ? [rs.lat, rs.lon] : null, rp = (d.repartidor_lat && d.repartidor_lon) ? [num(d, "repartidor_lat"), num(d, "repartidor_lon")] : (d.repartidor_ubicacion && d.repartidor_ubicacion.latitude ? [d.repartidor_ubicacion.latitude, d.repartidor_ubicacion.longitude] : null);
    if (!mapa && window.L && $("#sgMapa")) {
      mapa = L_.map("sgMapa").setView(cl[0] ? cl : [me().lat, me().lon], 14);
      L_.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
      S.mapa = mapa;
    }
    if (mapa) {
      const ic = e => L_.divIcon({ html: `<div style="font-size:30px;transform:translate(-50%,-100%)">${e}</div>`, className: "", iconSize: [0, 0] });
      if (cl[0]) { if (!mc) mc = L_.marker(cl, { icon: ic("🏠") }).addTo(mapa); }
      if (rl && !mr) mr = L_.marker(rl, { icon: ic("🏪") }).addTo(mapa);
      if (rp) { if (!mrep) mrep = L_.marker(rp, { icon: ic("🛵") }).addTo(mapa); else mrep.setLatLng(rp); }
      const pts = [cl[0] && cl, rl, rp].filter(Boolean); if (pts.length > 1) mapa.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    }
    S.pedidoEstado = es;
    if (ESTADOS_FIN.includes(es)) {
      limpiarActivo();
      updateDoc(doc(db, "clientes", me().telefono, "mis_pedidos", pId), { estado: es }).catch(() => {});
    } else updateDoc(doc(db, "clientes", me().telefono, "mis_pedidos", pId), { estado: es }).catch(() => {});
  }, err => console.error(err));
}
const L_ = window.L;
function limpiarActivo() { ls.del("pedidoActivoId"); ls.del("restIdActivo"); ls.del("rNombreActivo"); }
function cerrarSeg() { unsubAll(["seg"]); if (S.mapa) { try { S.mapa.remove(); } catch {} S.mapa = null; } go("inicio", {}, true); }
async function cancelarPedido() {
  const { rId, pId } = S.params;
  if (!confirm("¿Cancelar pedido?\n\nSolo se puede cancelar si el local aún no empezó a prepararlo.")) return;
  toast("Cancelando...");
  const ref = pedidoUrl(rId, pId);
  try {
    await runTransaction(db, async tr => {
      const es = String((await tr.get(ref)).data().estado).toUpperCase();
      if (!(es === "NUEVO" || es === "PENDIENTE")) throw new Error("NO_CANCELABLE");
      tr.update(ref, { estado: "CANCELADO", cancelado_por: "cliente" });
    });
    await updateDoc(doc(db, "clientes", me().telefono, "mis_pedidos", pId), { estado: "CANCELADO" }).catch(() => {});
    limpiarActivo(); toast("Pedido cancelado", 3500); go("inicio", {}, true);
  } catch (e) {
    if (String(e.message).includes("NO_CANCELABLE")) toast("Ya no se puede cancelar: el local aceptó tu pedido. Contacta al repartidor por el chat.", 5000);
    else toast("No se pudo cancelar. Revisa tu conexión.", 4000);
  }
}

/* ================= Chat ================= */
let chatPrevio = -1, emoCat = 0, emoOn = false;
function abrirChat() {
  const { rId, pId } = S.params; chatPrevio = -1; emoOn = false;
  const nombre = me().nombre || "Cliente";
  layer.innerHTML = `<div class="chat"><div class="h"><button class="back" data-a="cerrarChat">❮</button><div class="col"><div class="b" style="font-size:17px">Chat con Repartidor</div><div class="small mu">Pedido en curso</div></div></div>
    <div class="sug">${SUGERENCIAS.map(s => `<span data-a="chatSug">${esc(s)}</span>`).join("")}</div><div class="msgs" id="msgs"></div>
    <div class="emo hidden" id="emo"></div>
    <div class="in"><button class="rb" data-a="adjuntar">📷</button><button class="rb" data-a="emoToggle">😊</button><input id="cmsg" placeholder="Mensaje..." autocomplete="off"><button class="rb send" data-a="chatEnviar">➤</button></div>
    <input type="file" id="cfile" accept="image/*" class="hidden"></div>`;
  $("#cmsg").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); chatEnviar(); } };
  $("#cfile").onchange = e => { const f = e.target.files[0]; if (f) enviarImagen(f); e.target.value = ""; };
  pintarEmojis();
  const colRef = collection(db, "restaurantes", rId, "pedidos", pId, "chat");
  unsubAll(["chat"]);
  S.unsub.chat = onSnapshot(query(colRef, orderBy("timestamp", "asc")), snap => {
    const docs = snap.docs, box = $("#msgs"); if (!box) return;
    if (chatPrevio !== -1 && docs.length > chatPrevio && docs[docs.length - 1].data().remitente === "repartidor") sonido();
    chatPrevio = docs.length;
    box.innerHTML = docs.map(d => {
      const x = d.data(), cli = x.remitente === "cliente", visto = x.visto === true, pend = d.metadata.hasPendingWrites;
      if (!cli && !visto) updateDoc(d.ref, { visto: true }).catch(() => {});
      const txt = x.texto || x.mensaje || "", img = x.imagen_base64, nom = x.remitente_nombre || x.nombre || "Repartidor";
      return `<div class="bub ${cli ? "me" : ""}">${!cli ? `<div class="n">${esc(nom)}</div>` : ""}${txt ? `<div>${esc(txt)}</div>` : ""}${img ? `<img src="data:image/jpeg;base64,${img.replace(/\s/g, "")}" data-a="verImg" alt="">` : ""}${cli ? `<div class="ck ${visto && !pend ? "v" : ""}">${pend ? "✓" : "✓✓"}</div>` : ""}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }, err => console.error(err));
}
function sonido() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .35); o.start(); o.stop(c.currentTime + .35); if (navigator.vibrate) navigator.vibrate(120); } catch {} }
function pintarEmojis() {
  const e = $("#emo"); if (!e) return;
  e.innerHTML = `<div class="tabs">${EMO_NOMBRES.map((n, i) => `<span class="${i === emoCat ? "on" : ""}" data-a="emoCat" data-i="${i}">${n}</span>`).join("")}</div><div class="g">${EMOJIS[emoCat].map(x => `<span data-a="emo">${x}</span>`).join("")}</div>`;
}
async function chatMsg(extra) {
  const { rId, pId } = S.params;
  await addDoc(collection(db, "restaurantes", rId, "pedidos", pId, "chat"), { remitente: "cliente", remitente_nombre: me().nombre || "Cliente", visto: false, timestamp: serverTimestamp(), ...extra });
}
function chatEnviar() { const i = $("#cmsg"), t = i.value.trim(); if (!t) return; i.value = ""; chatMsg({ texto: t }).catch(() => toast("No se pudo enviar")); }
async function enviarImagen(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    let src = bmp; if (!src) { src = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); }); }
    const w0 = src.width, h0 = src.height, r = Math.min(1, 1024 / Math.max(w0, h0)), cv = document.createElement("canvas");
    cv.width = Math.round(w0 * r); cv.height = Math.round(h0 * r); cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
    let b64 = cv.toDataURL("image/jpeg", .85).split(",")[1];
    if (b64.length > 1000000) b64 = cv.toDataURL("image/jpeg", .65).split(",")[1];
    if (b64.length > 1000000) return toast("La imagen es muy grande");
    await chatMsg({ imagen_base64: b64 });
  } catch (e) { toast("Error procesando imagen"); }
}
function verImagen(src) { const d = document.createElement("div"); d.className = "modal"; d.style.background = "#000"; d.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%">`; d.onclick = () => d.remove(); document.body.appendChild(d); }

/* ================= Pedidos (historial) ================= */
async function vPedidos() {
  app.innerHTML = `<h1>Mis pedidos</h1><div id="fp">${["Todos", "En curso", "Finalizados"].map((n, i) => `<span class="chip ${S.filtroPedidos === i ? "on" : ""}" data-a="fpedidos" data-i="${i}">${n}</span>`).join("")}</div><div id="hist" class="loader">Cargando...</div>`;
  try {
    const q = await getDocs(collection(db, "clientes", me().telefono, "mis_pedidos"));
    let l = q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.timestamp && b.timestamp.seconds) || 0) - ((a.timestamp && a.timestamp.seconds) || 0));
    const fin = x => ESTADOS_FIN.includes(String(x.estado || "").toUpperCase());
    if (S.filtroPedidos === 1) l = l.filter(x => !fin(x)); else if (S.filtroPedidos === 2) l = l.filter(fin);
    const h = $("#hist"); if (!h || S.view !== "pedidos") return; h.className = "";
    h.innerHTML = l.length ? l.map(x => { const e = String(x.estado || "").toUpperCase(); return `<div class="card row" ${!fin(x) ? `data-a="verPedido" data-r="${esc(x.rId)}" data-p="${esc(x.pId || x.id)}" style="cursor:pointer"` : ""}><div class="logo">${fin(x) ? (e === "CANCELADO" ? "🛑" : "✅") : "🛵"}</div><div class="col"><h3>${esc(x.rNombre || "Pedido")} ${x.id_numerico ? "#" + x.id_numerico : ""}</h3><div class="small mu">${esc(x.hora_creacion || "")}</div><div class="small">${esc(ETIQUETA[e] || e)}</div></div><div class="price">${x.total ? L(x.total) : ""}</div></div>`; }).join("") : `<div class="empty"><div class="e">🧾</div>Aún no tienes pedidos</div>`;
  } catch (e) { const h = $("#hist"); if (h) h.innerHTML = `<div class="empty"><div class="e">📡</div>No pudimos cargar tus pedidos</div>`; }
}

/* ================= Cuenta / legal / direcciones ================= */
function vCuenta() {
  const m = me();
  app.innerHTML = `<h1>Cuenta</h1><div class="card row"><div class="logo">👤</div><div class="col"><h3>${esc(m.nombre)}</h3><div class="small mu">${esc(m.correo)}</div><div class="small mu">${esc(m.telefono)} · ${esc(m.ciudad)}</div></div></div>
    <button class="btn soft" data-a="irDirs">📍 Mis direcciones</button>
    <button class="btn" data-a="legal" data-v="politica">📄 Política de Privacidad</button>
    <button class="btn" data-a="legal" data-v="terminos">📜 Términos y Condiciones</button>
    <a class="btn sky" style="text-decoration:none;text-align:center" href="mailto:${CORREO}?subject=Soporte%20Llevari">✉️ Contacto y soporte</a>
    <button class="btn mut" data-a="logout">Cerrar sesión</button>
    <p class="mu small" style="margin-top:20px">Si eliminas tu cuenta se borran tu perfil, direcciones, historial de pedidos y mensajes del chat. Los pedidos en los registros del local se conservan solo de forma anonimizada (sin tu nombre, teléfono ni ubicación).</p>
    <button class="btn red" data-a="eliminar">🗑 Eliminar mi cuenta</button>`;
}
function vLegal() {
  const d = S.params.doc;
  nav.classList.add("hidden"); app.className = "noNav";
  app.innerHTML = `<div class="top"><button class="back" data-a="back">❮</button><h2 style="margin:0">${d === "terminos" ? "Términos y Condiciones" : "Política de Privacidad"}</h2></div><pre class="legal">${esc(d === "terminos" ? TERMINOS : POLITICA)}</pre>`;
}
function legalPublico(doc_) {
  if (doc_ === "menu") return modal(`<h2>Cuenta y legal</h2><button class="btn" data-a="legalPub" data-v="politica">📄 Política de Privacidad</button><button class="btn" data-a="legalPub" data-v="terminos">📜 Términos y Condiciones</button><button class="btn mut" data-a="cerrarModal">Cerrar</button>`);
  modal(`<h2>${doc_ === "terminos" ? "Términos y Condiciones" : "Política de Privacidad"}</h2><pre class="legal">${esc(doc_ === "terminos" ? TERMINOS : POLITICA)}</pre><button class="btn mut" data-a="cerrarModal">Cerrar</button>`);
}
function vDirecciones() {
  const m = me();
  nav.classList.add("hidden"); app.className = "noNav";
  const dirs = m.direcciones.length ? m.direcciones : (m.dir_desc ? [{ desc: m.dir_desc, lat: m.lat, lon: m.lon }] : []);
  app.innerHTML = `<div class="top"><button class="back" data-a="back">❮</button><h2 style="margin:0">Mis direcciones</h2></div>
    ${dirs.map((d, i) => `<div class="card row"><div class="col" data-a="usarDir" data-i="${i}" style="cursor:pointer">📍 ${esc(d.desc)}${d.desc === m.dir_desc ? ` <span class="badge ok">En uso</span>` : ""}</div><button class="back" style="color:#DC2626" data-a="delDir" data-i="${i}">✕</button></div>`).join("") || `<div class="empty">Aún no tienes direcciones</div>`}
    <button class="btn sky" data-a="mapaNuevaDir" data-v="perfil">+ Agregar Nueva Dirección en Mapa</button>`;
}
async function guardarDirs(dirs, activa) {
  const m = me(), a = activa || dirs[0];
  const upd = { direcciones: dirs }; if (a) { upd.lat = a.lat; upd.lon = a.lon; upd.dir_desc = a.desc; }
  await updateDoc(doc(db, "clientes", m.id || m.telefono), upd);
  m.direcciones = dirs; if (a) { m.lat = a.lat; m.lon = a.lon; m.dir_desc = a.desc; }
}

/* ---- Mapa para ubicar dirección ---- */
function mapaNuevaDir(destino) {
  const m = S.me || { lat: 13.3024, lon: -87.1921 };
  layer.innerHTML = `<div class="mapfull"><div id="pm"></div><div class="pin">📍</div>
    <div class="maptop"><button class="back" data-a="cerrarMapa">❮</button><input id="mq" type="search" placeholder="Buscar dirección..."><button class="back" data-a="buscarDir">🔍</button></div>
    <button class="locate" data-a="locate">🎯</button>
    <div class="mapcard"><div class="b" style="margin-bottom:6px">📍 Mueve el mapa para centrar el pin</div><input id="mdesc" placeholder="Describe tu dirección (colonia, casa, referencia)"><button class="btn gr" data-a="confirmarUbi" data-v="${destino}">CONFIRMAR UBICACIÓN ✅</button></div></div>`;
  S.mapa = L_.map("pm", { zoomControl: false }).setView([m.lat, m.lon], 16);
  L_.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(S.mapa);
  $("#mq").onkeydown = e => { if (e.key === "Enter") buscarDir(); };
  if (navigator.geolocation && !S.me) locate(true);
}
function locate(silencioso) {
  if (!navigator.geolocation) return toast("Tu navegador no permite ubicación");
  navigator.geolocation.getCurrentPosition(p => { if (S.mapa) S.mapa.setView([p.coords.latitude, p.coords.longitude], 17); }, () => { if (!silencioso) toast("No se pudo obtener tu ubicación. Actívala en Ajustes o ubícate en el mapa."); }, { enableHighAccuracy: true, timeout: 10000 });
}
async function buscarDir() {
  const q = $("#mq").value.trim(); if (!q) return;
  try {
    const c = S.mapa.getCenter(), r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=hn&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "es" } });
    const j = await r.json(); if (!j.length) return toast("No encontramos esa dirección");
    S.mapa.setView([+j[0].lat, +j[0].lon], 17);
  } catch { toast("No se pudo buscar. Revisa tu conexión."); }
}
async function confirmarUbi(destino) {
  const c = S.mapa.getCenter(), desc = $("#mdesc").value.trim();
  if (!desc) return toast("Describe tu dirección para el repartidor");
  const dir = { desc, lat: c.lat, lon: c.lng };
  S.mapa.remove(); S.mapa = null; layer.innerHTML = "";
  if (destino === "reg") { S.regDirs.push(dir); vAuth("registro2"); }
  else try { const dirs = [...(me().direcciones || []), dir]; await guardarDirs(dirs, dir); toast("Dirección guardada"); render(); } catch { toast("No se pudo guardar la dirección"); }
}

/* ---- Eliminar cuenta ---- */
function eliminarCuentaDialogo() {
  if (ls.get("pedidoActivoId")) return toast("Tienes un pedido en curso. Espera a que termine o cancélalo antes de eliminar tu cuenta.", 4500);
  modal(`<h2>¿Eliminar tu cuenta?</h2><p class="mu">Se borrarán tu perfil, teléfono, correo, contraseña, direcciones, historial de pedidos y mensajes del chat. Los pedidos en el local quedan anonimizados. Esta acción no se puede deshacer.</p><p class="b">Escribe tu contraseña para confirmar.</p><input id="delpass" type="password" placeholder="Tu contraseña" autocomplete="current-password"><button class="btn red" data-a="eliminarOk">Sí, eliminar</button><button class="btn mut" data-a="cerrarModal">Cancelar</button>`);
}
async function eliminarCuenta() {
  const pass = $("#delpass").value, u = auth.currentUser;
  if (!pass) return toast("Escribe tu contraseña");
  try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pass)); } catch { return toast("Contraseña incorrecta"); }
  cerrarModal(); toast("Eliminando cuenta...", 5000);
  const tel = me().telefono, fallos = [];
  try {
    const q = await getDocs(collection(db, "clientes", tel, "mis_pedidos"));
    for (const d of q.docs) {
      const { rId, pId } = d.data();
      try {
        if (rId && pId) {
          const pr = pedidoUrl(rId, pId), s = await getDoc(pr);
          if (s.exists()) {
            const ch = await getDocs(collection(pr, "chat")); await Promise.all(ch.docs.map(c => deleteDoc(c.ref)));
            await updateDoc(pr, { cliente_nombre: "Cliente eliminado", cliente_telefono: "", cliente_lat: 0, cliente_lon: 0, cliente_direccion_desc: "" });
          }
        }
        await deleteDoc(d.ref);
      } catch (e) { fallos.push(e); }
    }
    if (fallos.length) throw fallos[0];
    await deleteDoc(doc(db, "clientes", tel));
    const dup = await getDocs(query(collection(db, "clientes"), where("telefono", "==", tel))); await Promise.all(dup.docs.map(d => deleteDoc(d.ref)));
  } catch (e) { console.error(e); return toast(`No se pudo eliminar todo. Revisa tu conexión e intenta de nuevo, o escribe a ${CORREO}`, 6000); }
  try { await deleteUser(u); } catch { toast(`Se borraron tus datos, pero no se pudo cerrar tu acceso. Escribe a ${CORREO} para completar la eliminación.`, 7000); }
  await signOut(auth).catch(() => {}); try { localStorage.clear(); } catch {} toast("Cuenta eliminada", 4000);
}

/* ================= Consentimiento inicial ================= */
function consentimiento() {
  if (ls.get("consentimiento_v2") === "1") return;
  modal(`<h2>🛵 Bienvenido a Llevari</h2><p class="mu">Para funcionar, la app necesita estos permisos del navegador:</p>
    <p><b>📍 Ubicación</b><br><span class="mu">Para calcular la distancia y el costo de envío, y para que el repartidor llegue a tu dirección. Solo se usa mientras tienes la app abierta.</span></p>
    <p><b>📷 Cámara y 🖼️ Fotos</b><br><span class="mu">Para tomar o elegir una foto y enviarla en el chat con el repartidor. Solo accede a la foto que tú eliges.</span></p>
    <p class="mu small">Guardamos tu nombre, teléfono, correo, direcciones y pedidos para darte el servicio. Puedes eliminar tu cuenta cuando quieras desde la pestaña Cuenta.</p>
    <span class="link" data-a="legalPub" data-v="terminos">📜 Leer Términos y Condiciones</span><span class="link" data-a="legalPub" data-v="politica">📄 Leer Política de Privacidad</span>
    <label class="chk"><input type="checkbox" id="cons"><span>Soy mayor de 18 años y acepto los Términos y Condiciones, la Política de Privacidad y el uso de ubicación, cámara y fotos como se explica arriba.</span></label>
    <button class="btn" id="consok" disabled>Aceptar y continuar</button>`);
  const ck = $("#cons"), ok = $("#consok");
  ck.onchange = () => ok.disabled = !ck.checked;
  ok.onclick = () => { ls.set("consentimiento_v2", "1"); cerrarModal(); };
}

/* ================= Eventos (delegación) ================= */
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-a]"); if (!el) { if (ev.target.id === "confirmar") confirmarPedido(); return; }
  const a = el.dataset.a, v = el.dataset.v, i = el.dataset.i, id = el.dataset.id;
  switch (a) {
    case "tab": cerrarCapas(); go(v); break;
    case "back": cerrarCapas(); history.length > 1 ? history.back() : go("inicio", {}, true); break;
    case "login": iniciarSesion(); break;
    case "logout": cerrarCapas(); unsubAll(["locales", "seg"]); primeraLocales = true; S.restaurantes = []; await signOut(auth); break;
    case "recuperar": recuperar(); break;
    case "authmodo": vAuth(v); break;
    case "regpaso1": regPaso1(); break;
    case "regfinal": regFinal(); break;
    case "regdel": S.regDirs.splice(+i, 1); vAuth("registro2"); break;
    case "legalPub": legalPublico(v); break;
    case "legal": go("legal", { doc: v }); break;
    case "cerrarModal": cerrarModal(); break;
    case "reintentar": S.errLocales = false; render(); break;
    case "abrirLocal": abrirLocal(id); break;
    case "cat": S.catSel = v; vMenu(); break;
    case "plato": abrirPlato(S.menu.items[+i]); break;
    case "otroPlato": abrirPlato(S.menu.items[+i]); break;
    case "cerrarPlato": layer.innerHTML = ""; break;
    case "quitar": { const c = getCarrito(); c.splice(+i, 1); setCarrito(c); render(); } break;
    case "pedirLocal": pedirDesdeCarrito(id); break;
    case "masLocal": { const r = S.restaurantes.find(x => x.id === id); if (r) { await abrirLocal(id); } else toast("Ese local ya no está disponible"); } break;
    case "modal": case "modal_": break;
    case "irDirs": cerrarCapas(); go("direcciones"); break;
    case "usarDir": { const d = (me().direcciones.length ? me().direcciones : [])[+i]; if (d) { try { await guardarDirs(me().direcciones, d); toast("Dirección actualizada"); vDirecciones(); } catch { toast("No se pudo actualizar"); } } } break;
    case "delDir": { const dirs = [...me().direcciones]; dirs.splice(+i, 1); try { await guardarDirs(dirs, dirs.find(d => d.desc === me().dir_desc) || dirs[0]); vDirecciones(); } catch { toast("No se pudo borrar"); } } break;
    case "mapaNuevaDir": mapaNuevaDir(v); break;
    case "cerrarMapa": if (S.mapa) { S.mapa.remove(); S.mapa = null; } layer.innerHTML = ""; break;
    case "locate": locate(false); break;
    case "buscarDir": buscarDir(); break;
    case "confirmarUbi": confirmarUbi(v); break;
    case "verPedido": go("seguimiento", { rId: el.dataset.r, pId: el.dataset.p }); break;
    case "fpedidos": S.filtroPedidos = +i; vPedidos(); break;
    case "cerrarSeg": cerrarSeg(); break;
    case "cancelar": cancelarPedido(); break;
    case "abrirChat": abrirChat(); break;
    case "cerrarChat": unsubAll(["chat"]); layer.innerHTML = ""; break;
    case "chatSug": chatMsg({ texto: el.textContent }).catch(() => toast("No se pudo enviar")); break;
    case "chatEnviar": chatEnviar(); break;
    case "adjuntar": $("#cfile").click(); break;
    case "emoToggle": emoOn = !emoOn; $("#emo").classList.toggle("hidden", !emoOn); break;
    case "emoCat": emoCat = +i; pintarEmojis(); break;
    case "emo": { const inp = $("#cmsg"); inp.value += el.textContent; } break;
    case "verImg": verImagen(el.src); break;
    case "eliminar": eliminarCuentaDialogo(); break;
    case "eliminarOk": eliminarCuenta(); break;
  }
  if (a === "modal") { S.modalidad = v; vServicio(); }
});

/* ================= Arranque ================= */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
consentimiento();
