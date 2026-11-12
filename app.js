/* =========================================================================
 * LLEVARI - CLIENTE WEB COMPLETO Y CORREGIDO
 * ========================================================================= */

// 1. CONFIGURACIÓN FIREBASE (llevari)
const firebaseConfig = {
  apiKey: "AIzaSyDzzaUVgYblBrrHhizKBGry4RovYsDFFck",
  authDomain: "llevari.firebaseapp.com",
  projectId: "llevari",
  storageBucket: "llevari.firebasestorage.app",
  messagingSenderId: "219910137529",
  appId: "1:219910137529:web:9e8fab72d2db39d89add68"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

// 2. ESTADO GLOBAL
const KM_MIN = 2, KM_MAX = 20;
let cfgTopePct = 35, cfgEnvioMax = 30, cfgGanancia = 5, cfgExtraPct = 3, cfgMinimoLargo = 100, cfgKmMinimo = 5;
let cfgPagoKm = [40, 50, 55, 60, 64, 70, 76, 82, 88, 95, 102, 109, 116, 123, 130, 137, 144, 151, 158];

let miNombre = localStorage.getItem("nombre") || "";
let miTelefono = localStorage.getItem("telefono") || "";
let miCiudad = localStorage.getItem("ciudad") || "Choluteca";
let miLat = parseFloat(localStorage.getItem("lat")) || 13.3024;
let miLon = parseFloat(localStorage.getItem("lon")) || -87.1921;
let miDireccionDesc = localStorage.getItem("dir_desc") || "";

let pedidoActivoId = localStorage.getItem("pedidoActivoId") || "";
let restIdSeleccionadoTemp = localStorage.getItem("restIdActivo") || "";
let rNombreTemp = localStorage.getItem("rNombreActivo") || "";
let restauranteLatTemp = parseFloat(localStorage.getItem("restLatActivo")) || (miLat + 0.003);
let restauranteLonTemp = parseFloat(localStorage.getItem("restLonActivo")) || (miLon + 0.003);

let tempMapaLat = miLat, tempMapaLon = miLon;
let listaDireccionesReg = [];
let indiceDireccionSeleccionada = -1;
let tabActualIndex = 0;
let filtroPedidos = 0;

let platoTemp = "";
let precioPlatoTemp = 0.0;
let imgPlatoTemp = "";
let modalidadDelivery = true;
let tipoServicioElegido = "DELIVERY";
let carritoRestPendiente = null;

let mapPicker = null, mapTracking = null;
let markerRest = null, markerCli = null, markerDrv = null;
let seguimientoListener = null, tarifasListener = null;
let listaPublicitariaGlobal = [];
let todosLosProductosCache = [];
let sliderIndexActual = 0;
let sliderTimer = null;
let cacheKmRuta = {};

// 3. FÓRMULA DE TARIFAS Y DISTANCIA
function calcularDistanciaKm(l1, lo1, l2, lo2) {
  const r = 6371.0;
  const dLa = (l2 - l1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(l1 * Math.PI / 180) * Math.cos(l2 * Math.PI / 180) *
            Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return r * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function kmRuta(rLat, rLon, cLat, cLon) {
  const k = `${rLat.toFixed(4)},${rLon.toFixed(4)}>${cLat.toFixed(4)},${cLon.toFixed(4)}`;
  if (cacheKmRuta[k]) return cacheKmRuta[k];
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${cLon},${cLat}?overview=false`);
    const j = await res.json();
    if (j.code === "Ok") {
      const dist = j.routes[0].distance / 1000.0;
      cacheKmRuta[k] = dist;
      return dist;
    }
  } catch (e) {}
  return calcularDistanciaKm(rLat, rLon, cLat, cLon) * 1.3;
}

function calcularTarifa(kmReal, subtotal) {
  const kmCobro = Math.max(KM_MIN, Math.min(KM_MAX, Math.ceil(kmReal)));
  const pago = cfgPagoKm[kmCobro - KM_MIN] || 40;
  const cubrir = pago + cfgGanancia;
  const envio = Math.min(cubrir, cfgEnvioMax);
  const base = cubrir - envio;
  const minimo = kmCobro >= cfgKmMinimo ? cfgMinimoLargo : 0;
  const maximo = Math.round(subtotal * cfgTopePct / 100.0);
  const holgura = Math.max(0, maximo - base);
  const extra = Math.min(holgura, Math.round(subtotal * cfgExtraPct / 100.0));
  const aumento = base + extra;
  const ganancia = cfgGanancia + extra;
  return { kmCobro, pago, envio, base, minimo, extra, aumento, ganancia };
}

function kmHaciaSync(rLat, rLon) {
  if (!rLat || !rLon) { rLat = miLat + 0.003; rLon = miLon + 0.003; }
  const k = `${rLat.toFixed(4)},${rLon.toFixed(4)}>${miLat.toFixed(4)},${miLon.toFixed(4)}`;
  return cacheKmRuta[k] || (calcularDistanciaKm(rLat, rLon, miLat, miLon) * 1.3);
}

function precioVisible(precioBase, rLat, rLon) {
  const t = calcularTarifa(kmHaciaSync(rLat, rLon), Math.round(precioBase));
  return precioBase + t.aumento;
}

function envioPara(rLat, rLon) {
  return calcularTarifa(kmHaciaSync(rLat, rLon), 0).envio;
}

function formatearImagen(imgStr) {
  if (!imgStr) return "";
  if (imgStr.startsWith("http") || imgStr.startsWith("data:")) return imgStr;
  return `data:image/jpeg;base64,${imgStr}`;
}

// 4. ESCUCHA DE TARIFAS
function escucharTarifas() {
  db.collection("configuracion").doc("tarifas").onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    if (d.tope_aumento_pct) cfgTopePct = d.tope_aumento_pct;
    if (d.envio_visible_max) cfgEnvioMax = d.envio_visible_max;
    if (d.ganancia_pedido) cfgGanancia = d.ganancia_pedido;
    if (d.ganancia_extra_pct) cfgExtraPct = d.ganancia_extra_pct;
    if (d.pedido_minimo) cfgMinimoLargo = d.pedido_minimo;
    if (d.km_pedido_minimo) cfgKmMinimo = d.km_pedido_minimo;
    if (Array.isArray(d.pago_km) && d.pago_km.length === (KM_MAX - KM_MIN + 1)) {
      cfgPagoKm = d.pago_km;
    }
  });
}

// 5. INICIALIZACIÓN DE INTERFAZ & NAVEGACIÓN
window.addEventListener("DOMContentLoaded", () => {
  escucharTarifas();
  bindUIEvents();

  auth.onAuthStateChanged(user => {
    if (user && miTelefono) {
      mostrarAppPrincipal();
      if (pedidoActivoId) {
        abrirPantallaSeguimientoEnVivo();
      }
    } else {
      mostrarPantallaLogin();
    }
  });
});

function bindUIEvents() {
  document.querySelectorAll(".nav-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => cambiarTab(parseInt(btn.getAttribute("data-tab"))));
  });

  const btnSalir = document.getElementById("btnNavSalir");
  if (btnSalir) {
    btnSalir.addEventListener("click", () => {
      auth.signOut();
      localStorage.clear();
      miTelefono = "";
      mostrarPantallaLogin();
    });
  }

  const colUbi = document.getElementById("colUbi");
  if (colUbi) colUbi.addEventListener("click", mostrarSelectorUbicaciones);

  const btnCart = document.getElementById("btnHeaderCarrito");
  if (btnCart) btnCart.addEventListener("click", () => cambiarTab(1));

  const etBuscador = document.getElementById("etBuscador");
  if (etBuscador) {
    let buscadorTimeout = null;
    etBuscador.addEventListener("input", () => {
      clearTimeout(buscadorTimeout);
      buscadorTimeout = setTimeout(() => {
        const q = etBuscador.value.trim().toLowerCase();
        filtrarResultados(q);
      }, 350);
    });
  }

  const btnLog = document.getElementById("btnIniciarSesion");
  if (btnLog) btnLog.addEventListener("click", iniciarSesion);

  const lnkOlv = document.getElementById("lnkOlvidoPin");
  if (lnkOlv) lnkOlv.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("layoutLogin").classList.add("hidden");
    document.getElementById("layoutRecuperar").classList.remove("hidden");
  });

  const lnkVol = document.getElementById("lnkVolverLogin");
  if (lnkVol) lnkVol.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("layoutRecuperar").classList.add("hidden");
    document.getElementById("layoutLogin").classList.remove("hidden");
  });

  const btnRec = document.getElementById("btnRecEnviar");
  if (btnRec) btnRec.addEventListener("click", enviarRecuperacion);

  const lnkReg = document.getElementById("lnkIrRegistro");
  if (lnkReg) lnkReg.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("layoutLogin").classList.add("hidden");
    document.getElementById("layoutRegistro").classList.remove("hidden");
  });

  const lnkRegLog = document.getElementById("lnkRegVolverLog");
  if (lnkRegLog) lnkRegLog.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("layoutRegistro").classList.add("hidden");
    document.getElementById("layoutLogin").classList.remove("hidden");
  });

  const btnSigu = document.getElementById("btnRegPasoSiguiente");
  if (btnSigu) btnSigu.addEventListener("click", validarPaso1Registro);

  const lnkRegP1 = document.getElementById("lnkRegVolverPaso1");
  if (lnkRegP1) lnkRegP1.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("layoutRegPaso2").classList.add("hidden");
    document.getElementById("layoutRegPaso1").classList.remove("hidden");
  });

  const btnMapaDir = document.getElementById("btnRegNuevaDirMapa");
  if (btnMapaDir) btnMapaDir.addEventListener("click", abrirMapaNuevaDireccion);

  const btnConfUbi = document.getElementById("btnConfirmarUbiMapa");
  if (btnConfUbi) btnConfUbi.addEventListener("click", () => {
    document.getElementById("modalDetalleDir").classList.remove("hidden");
  });

  const btnGuardarDir = document.getElementById("btnGuardarDirModal");
  if (btnGuardarDir) btnGuardarDir.addEventListener("click", guardarDetalleDireccion);

  const btnCerrMap = document.getElementById("btnCerrarMapa");
  if (btnCerrMap) btnCerrMap.addEventListener("click", volverDeMapa);

  const btnRegFin = document.getElementById("btnRegistrarmeFinal");
  if (btnRegFin) btnRegFin.addEventListener("click", finalizarRegistro);

  const btnVolvServ = document.getElementById("btnVolverServicio");
  if (btnVolvServ) btnVolvServ.addEventListener("click", () => {
    document.getElementById("layoutTipoServicio").classList.add("hidden");
    document.getElementById("layoutAppMain").classList.remove("hidden");
  });

  const lblDel = document.getElementById("svLblDelivery");
  if (lblDel) lblDel.addEventListener("click", () => alternarModalidadServicio(true));

  const lblPic = document.getElementById("svLblPickup");
  if (lblPic) lblPic.addEventListener("click", () => alternarModalidadServicio(false));

  const btnConfPed = document.getElementById("svBtnConfirmar");
  if (btnConfPed) btnConfPed.addEventListener("click", confirmarCreacionPedido);

  const btnCerrSeg = document.getElementById("bCerrarSeg");
  if (btnCerrSeg) btnCerrSeg.addEventListener("click", cerrarPantallaSeguimiento);

  const btnCancPed = document.getElementById("bCancelarPedido");
  if (btnCancPed) btnCancPed.addEventListener("click", cancelarPedidoActivo);

  const btnProc = document.getElementById("btnProc");
  if (btnProc) btnProc.addEventListener("click", () => {
    filtroPedidos = 0;
    btnProc.classList.add("active");
    document.getElementById("btnEnt").classList.remove("active");
    cargarHistorial();
  });

  const btnEnt = document.getElementById("btnEnt");
  if (btnEnt) btnEnt.addEventListener("click", () => {
    filtroPedidos = 1;
    btnEnt.classList.add("active");
    document.getElementById("btnProc").classList.remove("active");
    cargarHistorial();
  });

  const btnCloseMod = document.getElementById("btnCloseModalPlato");
  if (btnCloseMod) btnCloseMod.addEventListener("click", () => {
    document.getElementById("modalPlatoPro").classList.add("hidden");
  });

  const btnCerrUbi = document.getElementById("btnModalCerrarUbi");
  if (btnCerrUbi) btnCerrUbi.addEventListener("click", () => {
    document.getElementById("modalSelectorUbicaciones").classList.add("hidden");
  });
}

// 6. FLUJO DE PANTALLAS
function mostrarPantallaLogin() {
  document.getElementById("layoutAuth").classList.remove("hidden");
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutTipoServicio").classList.add("hidden");
  document.getElementById("layoutSeguimiento").classList.add("hidden");
  document.getElementById("layoutMapa").classList.add("hidden");
}

function mostrarAppPrincipal() {
  document.getElementById("layoutAuth").classList.add("hidden");
  document.getElementById("layoutMapa").classList.add("hidden");
  document.getElementById("layoutAppMain").classList.remove("hidden");
  actualizarCabecera();
  cambiarTab(0);
}

function actualizarCabecera() {
  const primer = miNombre.trim().split(" ")[0];
  const tvSal = document.getElementById("tvSaludo");
  const tvUbi = document.getElementById("tvUbicacion");
  if (tvSal) tvSal.textContent = primer ? `Hola, ${primer} 👋 • Entregar en` : "Entregar en";
  if (tvUbi) tvUbi.textContent = `📍 ${miCiudad}${miDireccionDesc ? ' • ' + miDireccionDesc : ''} ⌄`;
}

function cambiarTab(idx) {
  tabActualIndex = idx;
  document.querySelectorAll(".nav-item[data-tab]").forEach(el => {
    el.classList.toggle("active", parseInt(el.getAttribute("data-tab")) === idx);
  });
  document.querySelectorAll(".tab-view").forEach((tab, i) => {
    tab.classList.toggle("active", i === idx);
  });
  actualizarBadgeCarrito();

  if (idx === 0) cargarInicioPrincipal();
  else if (idx === 1) dibujarCarrito();
  else if (idx === 2) cargarHistorial();
}

// 7. AUTH Y REGISTRO
async function iniciarSesion() {
  const email = document.getElementById("etLogTelefono").value.trim().toLowerCase();
  const pass = document.getElementById("etLogPin").value.trim();
  if (!email || !pass) return alert("Escribe tu correo y contraseña");

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    const snap = await db.collection("clientes").where("correo", "==", email).get();
    if (snap.empty) {
      await auth.signOut();
      return alert("No encontramos tu perfil de cliente.");
    }
    const doc = snap.docs[0];
    const data = doc.data();
    miNombre = data.nombre || "";
    miTelefono = data.telefono || doc.id;
    miCiudad = data.ciudad || "Choluteca";
    miLat = data.latitud || 13.3024;
    miLon = data.longitud || -87.1921;
    miDireccionDesc = data.direccion_desc || "";

    localStorage.setItem("nombre", miNombre);
    localStorage.setItem("telefono", miTelefono);
    localStorage.setItem("ciudad", miCiudad);
    localStorage.setItem("lat", miLat);
    localStorage.setItem("lon", miLon);
    localStorage.setItem("dir_desc", miDireccionDesc);

    mostrarAppPrincipal();
  } catch (err) {
    alert("Correo o contraseña incorrectos");
  }
}

async function enviarRecuperacion() {
  const c = document.getElementById("etRecCorreo").value.trim();
  if (!c) return alert("Escribe tu correo");
  try {
    await auth.sendPasswordResetEmail(c);
    const msg = document.getElementById("tvRecEstado");
    if (msg) {
      msg.textContent = "✅ Si el correo está registrado, te enviamos el enlace. Revisa Spam.";
      msg.classList.remove("hidden");
    }
  } catch (e) {
    alert("Error enviando recuperación: " + e.message);
  }
}

async function validarPaso1Registro() {
  const n = document.getElementById("etRegNombre").value.trim();
  const c = document.getElementById("etRegCorreo").value.trim().toLowerCase();
  const telNum = document.getElementById("etRegTelefono").value.trim();
  const p = document.getElementById("etRegPin").value;
  const cb = document.getElementById("cbAcepto").checked;

  if (!n || !c || !telNum || !p) return alert("Completa todos los campos");
  if (!cb) return alert("Debes aceptar los términos y la política");
  if (p.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");

  const telF = document.getElementById("spRegPais").value + telNum;
  const docTel = await db.collection("clientes").doc(telF).get();
  if (docTel.exists) return alert("Teléfono ya registrado");

  const snapEmail = await db.collection("clientes").where("correo", "==", c).get();
  if (!snapEmail.empty) return alert("Correo ya registrado");

  document.getElementById("layoutRegPaso1").classList.add("hidden");
  document.getElementById("layoutRegPaso2").classList.remove("hidden");
}

function abrirMapaNuevaDireccion() {
  document.getElementById("layoutAuth").classList.add("hidden");
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutMapa").classList.remove("hidden");
  initMapPicker(tempMapaLat, tempMapaLon);
}

function volverDeMapa() {
  document.getElementById("layoutMapa").classList.add("hidden");
  if (auth.currentUser && miTelefono) {
    document.getElementById("layoutAppMain").classList.remove("hidden");
  } else {
    document.getElementById("layoutAuth").classList.remove("hidden");
  }
}

function guardarDetalleDireccion() {
  const etiqueta = document.querySelector('input[name="rbTipoDir"]:checked').value;
  const desc = document.getElementById("etDescDireccion").value.trim();
  const dir = { etiqueta, desc, lat: tempMapaLat, lon: tempMapaLon };
  listaDireccionesReg.push(dir);
  indiceDireccionSeleccionada = listaDireccionesReg.length - 1;

  document.getElementById("modalDetalleDir").classList.add("hidden");
  volverDeMapa();
  actualizarListaDireccionesReg();
}

function actualizarListaDireccionesReg() {
  const c = document.getElementById("contDireccionesReg");
  if (!c) return;
  c.innerHTML = "";
  listaDireccionesReg.forEach((dir, i) => {
    const sel = (i === indiceDireccionSeleccionada);
    const item = document.createElement("div");
    item.className = "card card-row";
    item.style.padding = "10px 14px";
    item.style.border = sel ? "2px solid var(--c-primary)" : "1px solid #E4DEF5";
    item.style.background = sel ? "var(--c-primary-light)" : "#fff";
    item.innerHTML = `
      <input type="radio" name="rbDirItem" ${sel ? "checked" : ""} style="accent-color: var(--c-primary); margin-right: 12px;" />
      <div style="flex:1">
        <h4 style="font-size:15px">${dir.etiqueta}</h4>
        ${dir.desc ? `<p class="sub-muted">${dir.desc}</p>` : ""}
      </div>
    `;
    item.onclick = () => {
      indiceDireccionSeleccionada = i;
      actualizarListaDireccionesReg();
    };
    c.appendChild(item);
  });
  const btnFin = document.getElementById("btnRegistrarmeFinal");
  if (btnFin) btnFin.disabled = indiceDireccionSeleccionada < 0;
}

async function finalizarRegistro() {
  if (indiceDireccionSeleccionada < 0) return;
  const n = document.getElementById("etRegNombre").value.trim();
  const c = document.getElementById("etRegCorreo").value.trim().toLowerCase();
  const t = document.getElementById("spRegPais").value + document.getElementById("etRegTelefono").value.trim();
  const p = document.getElementById("etRegPin").value;
  const ciudad = document.getElementById("spRegCiudad").value;
  const idioma = document.getElementById("spRegIdioma").value;

  const dA = listaDireccionesReg[indiceDireccionSeleccionada];
  miLat = dA.lat; miLon = dA.lon; miDireccionDesc = dA.desc; miCiudad = ciudad;

  try {
    await auth.createUserWithEmailAndPassword(c, p);
    const cli = {
      nombre: n, correo: c, telefono: t, ciudad, idioma,
      latitud: miLat, longitud: miLon, direccion_desc: miDireccionDesc,
      direcciones: listaDireccionesReg, indice_dir_activa: indiceDireccionSeleccionada,
      consentimiento_version: "v2", consentimiento_fecha: new Date().toISOString()
    };
    await db.collection("clientes").doc(t).set(cli);
    miNombre = n; miTelefono = t;
    localStorage.setItem("nombre", n);
    localStorage.setItem("telefono", t);
    localStorage.setItem("ciudad", ciudad);
    localStorage.setItem("lat", miLat);
    localStorage.setItem("lon", miLon);
    localStorage.setItem("dir_desc", miDireccionDesc);
    mostrarAppPrincipal();
  } catch (err) {
    alert("Error al crear cuenta: " + err.message);
  }
}

// 8. MAPLIBRE GL: PICKER
function initMapPicker(lat, lon) {
  if (!mapPicker) {
    mapPicker = new maplibregl.Map({
      container: 'mapContainerPick',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [lon, lat],
      zoom: 16.5,
      attributionControl: false
    });

    mapPicker.on('move', () => {
      const c = mapPicker.getCenter();
      tempMapaLat = c.lat; tempMapaLon = c.lng;
    });

    const btnMiUbi = document.getElementById("btnMiUbi");
    if (btnMiUbi) {
      btnMiUbi.onclick = () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            mapPicker.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 17.5 });
          });
        }
      };
    }
  } else {
    mapPicker.setCenter([lon, lat]);
  }
}

// 9. INICIO Y CATÁLOGO
async function cargarInicioPrincipal() {
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = `
    <div class="empty-box">
      <div class="empty-emoji">🛵</div>
      <p style="font-weight:700">Preparando tus antojos...</p>
    </div>
  `;


  let snapR;
  try {
    snapR = await restaurantesRapido();
    try { await precargarRutasWeb(snapR.docs.map(d => d.data()).filter(r => !r.ciudad || String(r.ciudad).toLowerCase() === miCiudad.toLowerCase()).map(r => ({ lat: r.latitud, lon: r.longitud })), 2000); } catch (e) {}
  } catch (e) {
    cont.innerHTML = '<div class="empty-box"><div class="empty-emoji">⚠️</div><p style="font-weight:700">No se pudieron cargar los locales</p><p class="empty-text">' + e.message + '</p></div>';
    return;
  }
  cont.innerHTML = "";

  if (pedidoActivoId) {
    const banner = document.createElement("div");
    banner.id = "bannerActivo";
    banner.className = "card card-row";
    banner.style.background = "linear-gradient(to right, var(--c-accent), var(--c-accent-dark))";
    banner.style.color = "#fff";
    banner.style.margin = "14px 16px 0";
    banner.style.cursor = "pointer";
    banner.innerHTML = `
      <div class="cat-chip-ico" style="background:rgba(255,255,255,0.2)">🛵</div>
      <div style="flex:1; padding-left: 12px">
        <h4 style="font-size:16px">¡Pedido en proceso!</h4>
        <span style="font-size:13px; color:#FFE2B8">${rNombreTemp}</span>
      </div>
      <span style="font-size:20px">➔</span>
    `;
    banner.onclick = abrirPantallaSeguimientoEnVivo;
    cont.appendChild(banner);
  }

  const heroSlider = document.createElement("div");
  heroSlider.className = "hero-slider-wrap";
  heroSlider.innerHTML = `
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <span class="hero-tag">⚡ DESTACADO</span>
      <div class="hero-title" id="heroTitle">¡Pide tus antojos!</div>
      <div class="hero-sub" id="heroSub">Entrega rápida en ${miCiudad}</div>
    </div>
  `;
  cont.appendChild(heroSlider);
  iniciarSliderPublicitario();
  revisarPedidoActivo();

  const bigRow = document.createElement("div");
  bigRow.style.display = "flex";
  bigRow.style.gap = "12px";
  bigRow.style.padding = "10px 16px 0";
  bigRow.innerHTML = `
    <div class="cat-big" style="background: linear-gradient(135deg, #FFF1DC, #FFD6A0);" onclick="alert('Súper pronto ✨')">
      <div class="cat-big-icon-wrap">🛒</div>
      <span style="font-weight:700; margin-top:8px">Súper</span>
    </div>
    <div class="cat-big" style="background: linear-gradient(135deg, #EDE9FE, #D2C2FA);" onclick="verTodosLosRestaurantes()">
      <div class="cat-big-icon-wrap">🍔</div>
      <span style="font-weight:700; margin-top:8px">Restaurantes</span>
    </div>
  `;
  cont.appendChild(bigRow);

  const secHead = document.createElement("div");
  secHead.className = "section-header";
  secHead.innerHTML = `<h3>Los mejores restaurantes</h3><span class="section-link" onclick="verTodosLosRestaurantes()">Ver todo ➔</span>`;
  cont.appendChild(secHead);

  const bestRow = document.createElement("div");
  bestRow.className = "horizontal-scroller";
  cont.appendChild(bestRow);

  todosLosProductosCache = [];
  listaPublicitariaGlobal = [];

  snapR.forEach(doc => {
    const r = doc.data();
    if (r.ciudad && r.ciudad.toLowerCase() !== miCiudad.toLowerCase()) return;
    const rLat = r.latitud || 0, rLon = r.longitud || 0;
    const cerrado = (r.estado || "").toUpperCase() === "CERRADO";
    const envio = envioPara(rLat, rLon);
    const logoSrc = formatearImagen(r.logoUrl);

    const card = document.createElement("div");
    card.className = "rest-card-big";
    card.innerHTML = `
      <div class="rest-card-cover">
        ${logoSrc ? `<img src="${logoSrc}" class="img-fill" />` : '🍽️'}
        <span class="badge-status ${cerrado ? 'cerrado' : 'abierto'}">${cerrado ? '🛑 CERRADO' : '🟢 ABIERTO'}</span>
        <span class="badge-fee">🛵 L. ${envio}</span>
      </div>
      <div class="rest-card-body">
        <div style="flex:1">
          <h4 style="font-size:16px; font-weight:700">${r.nombre}</h4>
          <span class="sub-muted">${cerrado ? 'No disponible' : '⏱ 20-35 min • 🛵 L. ' + envio}</span>
        </div>
      </div>
    `;
    card.onclick = () => {
      if (cerrado) return alert("Este local está cerrado actualmente 🛑");
      abrirMenuRestaurante(doc.id, r.nombre, rLat, rLon, r.logoUrl);
    };
    bestRow.appendChild(card);

    colaProductos(() => db.collection("restaurantes").doc(doc.id).collection("productos").get()).then(pSnap => {
      pSnap.forEach(pd => {
        const pData = pd.data();
        if (pData.nombre && pData.precio > 0) {
          const itemProd = {
            rId: doc.id, rNom: r.nombre, rLat, rLon, rCerrado: cerrado,
            pNom: pData.nombre, pDesc: pData.descripcion || "",
            pPrec: pData.precio, pImg: formatearImagen(pData.imagenUrl || r.logoUrl),
            pOps: pData.opciones || ""
          };
          todosLosProductosCache.push(itemProd);
        }
      });
    });
  });
}

function verTodosLosRestaurantes() {
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = `
    <div class="section-header">
      <button class="circle-btn back-btn" onclick="cargarInicioPrincipal()">❮</button>
      <h3 style="flex:1; margin-left:14px">Todos los locales</h3>
    </div>
    <div id="gridTodosLocales" class="grid-2"></div>
  `;
  const grid = document.getElementById("gridTodosLocales");
  db.collection("restaurantes").get().then(snap => {
    snap.forEach(doc => {
      const r = doc.data();
      if (r.ciudad && r.ciudad.toLowerCase() !== miCiudad.toLowerCase()) return;
      const rLat = r.latitud || 0, rLon = r.longitud || 0;
      const cerrado = (r.estado || "").toUpperCase() === "CERRADO";
      const logoSrc = formatearImagen(r.logoUrl);
      const card = document.createElement("div");
      card.className = "rest-card-grid";
      card.innerHTML = `
        <div class="rest-card-cover">
          ${logoSrc ? `<img src="${logoSrc}" class="img-fill" />` : '🍽️'}
          <span class="badge-status ${cerrado ? 'cerrado' : 'abierto'}">${cerrado ? '🛑 CERRADO' : '🟢 ABIERTO'}</span>
        </div>
        <div class="rest-card-body">
          <h4>${r.nombre}</h4>
          <span class="sub-muted">🛵 L. ${envioPara(rLat, rLon)}</span>
        </div>
      `;
      card.onclick = () => {
        if (cerrado) return alert("Este local está cerrado actualmente 🛑");
        abrirMenuRestaurante(doc.id, r.nombre, rLat, rLon, r.logoUrl);
      };
      grid.appendChild(card);
    });
  });
}

// 10. MENÚ DE UN RESTAURANTE
async function abrirMenuRestaurante(rId, rNom, rLat, rLon, logoUrl) {
  restIdSeleccionadoTemp = rId;
  rNombreTemp = rNom;
  restauranteLatTemp = rLat;
  restauranteLonTemp = rLon;

  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = `
    <div class="section-header">
      <button class="circle-btn back-btn" onclick="cargarInicioPrincipal()">❮</button>
      <div style="flex:1; margin-left: 14px">
        <h3 style="font-size:18px">${rNom}</h3>
        <span class="sub-muted">🛵 Envío L. ${envioPara(rLat, rLon)}</span>
      </div>
    </div>
    <div id="listMenuPlatos" style="margin-top:10px"></div>
  `;

  const list = document.getElementById("listMenuPlatos");
  const snap = await db.collection("restaurantes").doc(rId).collection("productos").get();
  if (snap.empty) {
    list.innerHTML = `<div class="empty-box"><p>No hay platos registrados</p></div>`;
    return;
  }

  snap.forEach(doc => {
    const p = doc.data();
    const finalPrice = precioVisible(p.precio, rLat, rLon);
    const imgSrc = formatearImagen(p.imagenUrl || logoUrl);
    const row = document.createElement("div");
    row.className = "product-row-card";
    row.innerHTML = `
      <div class="product-info-left">
        <div>
          <h4>${p.nombre}</h4>
          <p>${p.descripcion || ''}</p>
        </div>
        <div class="product-price">L. ${finalPrice.toFixed(2)}</div>
      </div>
      <div class="product-thumb-box">
        ${imgSrc ? `<img src="${imgSrc}" class="img-fill" />` : '🍽️'}
        <button class="btn-plus-abs">+</button>
      </div>
    `;
    row.onclick = () => mostrarPlatoPro(rId, rNom, p.nombre, p.descripcion || "", p.precio, imgSrc, p.opciones || "", rLat, rLon);
    list.appendChild(row);
  });
}

// 11. MODAL DETALLE DE PLATO
let currentDishQty = 1;
let currentDishBasePrice = 0;
let currentDishData = {};

function mostrarPlatoPro(rId, rNom, plato, desc, baseP, imgD, opStr, rLat, rLon) {
  currentDishQty = 1;
  currentDishBasePrice = baseP;
  currentDishData = { rId, rNom, plato, desc, baseP, imgD, opStr, rLat, rLon };

  document.getElementById("modalDishTitle").textContent = plato;
  document.getElementById("modalDishDesc").textContent = desc;
  document.getElementById("modalHeroRestChip").textContent = "🏪 " + rNom;
  document.getElementById("txtDishQty").textContent = "1";

  const heroImg = document.getElementById("modalHeroImg");
  if (imgD) {
    heroImg.src = imgD;
    heroImg.classList.remove("hidden");
  } else {
    heroImg.classList.add("hidden");
  }

  recalcularModalPlato();

  document.getElementById("btnDishMinus").onclick = () => {
    if (currentDishQty > 1) {
      currentDishQty--;
      document.getElementById("txtDishQty").textContent = currentDishQty;
      recalcularModalPlato();
    }
  };
  document.getElementById("btnDishPlus").onclick = () => {
    currentDishQty++;
    document.getElementById("txtDishQty").textContent = currentDishQty;
    recalcularModalPlato();
  };

  document.getElementById("btnDishAddToCart").onclick = () => {
    agregarAlCarrito(rId, rNom, `${currentDishQty}x ${plato}`, currentDishBasePrice * currentDishQty, "", imgD, rLat, rLon);
    document.getElementById("modalPlatoPro").classList.add("hidden");
  };

  document.getElementById("btnDishOrderNow").onclick = () => {
    carritoRestPendiente = null;
    platoTemp = `${currentDishQty}x ${plato}`;
    precioPlatoTemp = currentDishBasePrice * currentDishQty;
    imgPlatoTemp = imgD;
    document.getElementById("modalPlatoPro").classList.add("hidden");
    abrirPantallaTipoServicio();
  };

  document.getElementById("modalPlatoPro").classList.remove("hidden");
}

function recalcularModalPlato() {
  const sub = currentDishBasePrice * currentDishQty;
  const t = calcularTarifa(kmHaciaSync(currentDishData.rLat, currentDishData.rLon), Math.round(sub));
  const totProd = sub + t.aumento;
  const total = totProd + t.envio;

  document.getElementById("modalDishPrice").textContent = `L. ${(totProd / currentDishQty).toFixed(2)} c/u`;
  document.getElementById("modalDishSubtotal").textContent = `L. ${totProd}`;
  document.getElementById("btnDishOrderNow").textContent = `Pedir • L. ${total}`;
}

// 12. CARRITO
function agregarAlCarrito(rId, rNom, nombre, precioTotal, opciones, img, lat, lon) {
  const item = `${rId}||${rNom}||${nombre}||${precioTotal.toFixed(2)}||${opciones}||${img || ''}||${lat}||${lon};;`;
  const curr = localStorage.getItem("carrito") || "";
  localStorage.setItem("carrito", curr + item);
  actualizarBadgeCarrito();
  alert("🛒 Agregado al carrito");
}

function actualizarBadgeCarrito() {
  const car = localStorage.getItem("carrito") || "";
  const count = car.split(";;").filter(x => x.trim()).length;
  const badgeLbl = document.getElementById("lblNavCarrito");
  if (badgeLbl) badgeLbl.textContent = count > 0 ? `Carrito (${count})` : "Carrito";
}

function dibujarCarrito() {
  const cont = document.getElementById("contCarrito");
  if (!cont) return;
  cont.innerHTML = "";
  const car = localStorage.getItem("carrito") || "";
  const items = car.split(";;").filter(x => x.trim());

  if (!items.length) {
    cont.innerHTML = `
      <div class="empty-box">
        <div class="empty-emoji">🛒</div>
        <h3>Tu carrito está vacío</h3>
        <p class="empty-text">Agrega platillos desde tus locales favoritos</p>
      </div>
    `;
    return;
  }

  const grupos = {};
  items.forEach((it, idx) => {
    const p = it.split("||");
    if (p.length < 5) return;
    const rId = p[0], rNom = p[1], pNom = p[2], prc = parseFloat(p[3]), ops = p[4];
    if (!grupos[rId]) grupos[rId] = { rNom, subtotal: 0, items: [] };
    grupos[rId].subtotal += prc;
    grupos[rId].items.push({ idx, pNom, prc, ops });
  });

  Object.keys(grupos).forEach(rId => {
    const g = grupos[rId];
    const cardG = document.createElement("div");
    cardG.className = "card";
    cardG.innerHTML = `<h4>${g.rNom}</h4><p class="sub-muted">Subtotal: L. ${g.subtotal.toFixed(2)}</p>`;
    cont.appendChild(cardG);
  });
}

// 13. ELECCIÓN DE SERVICIO
function abrirPantallaTipoServicio() {
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutTipoServicio").classList.remove("hidden");
  document.getElementById("svNombreRest").textContent = rNombreTemp;
  document.getElementById("svItemNombre").textContent = platoTemp;
  alternarModalidadServicio(true);
}

function alternarModalidadServicio(deliv) {
  modalidadDelivery = deliv;
  tipoServicioElegido = deliv ? "DELIVERY" : "PICKUP";

  const ind = document.getElementById("svInd");
  const btnDel = document.getElementById("svLblDelivery");
  const btnPic = document.getElementById("svLblPickup");

  if (ind) ind.style.transform = deliv ? "translateX(0%)" : "translateX(100%)";
  if (btnDel) btnDel.classList.toggle("active", deliv);
  if (btnPic) btnPic.classList.toggle("active", !deliv);

  const sub = Math.round(precioPlatoTemp);
  const t = calcularTarifa(kmHaciaSync(restauranteLatTemp, restauranteLonTemp), sub);
  const prods = sub + (deliv ? t.aumento : 0);
  const total = deliv ? (prods + t.envio) : sub;

  document.getElementById("svItemPrecio").textContent = `L. ${prods}`;
  const fProd = document.querySelector("#svFilaProd .val");
  if (fProd) fProd.textContent = `L. ${prods}`;

  const filaEnvio = document.getElementById("svFilaEnvio");
  if (filaEnvio) {
    filaEnvio.style.display = deliv ? "flex" : "none";
    filaEnvio.querySelector(".val").textContent = `L. ${t.envio}`;
  }

  const lblTot = document.getElementById("svFilaTotalLbl");
  if (lblTot) lblTot.textContent = deliv ? "Total a pagar al repartidor" : "Total a pagar en el local";
  const valTot = document.getElementById("svTotalPagarVal");
  if (valTot) valTot.textContent = `L. ${total}`;

  const btnConf = document.getElementById("svBtnConfirmar");
  if (btnConf) btnConf.textContent = `Confirmar pedido • L. ${total}`;
}

// 14. CREACIÓN DE PEDIDO EN FIRESTORE
async function confirmarCreacionPedido() {
  document.getElementById("layoutTipoServicio").classList.add("hidden");
  const animScreen = document.getElementById("layoutAnimacion");
  if (animScreen) animScreen.classList.remove("hidden");

  const deliv = modalidadDelivery;
  const sub = Math.round(precioPlatoTemp);
  const t = calcularTarifa(kmHaciaSync(restauranteLatTemp, restauranteLonTemp), sub);
  const envio = deliv ? t.envio : 0.0;
  const aumento = deliv ? t.aumento : 0.0;
  const total = sub + aumento + envio;

  const pedData = {
    estado: "NUEVO",
    subtotal: precioPlatoTemp,
    costo_envio: envio,
    aumento: aumento,
    total: total,
    km_cobro: deliv ? t.kmCobro : 0,
    pago_motorista: deliv ? t.pago : 0.0,
    ganancia: deliv ? t.ganancia : 0.0,
    nombre_plato: platoTemp,
    fecha: fechaApp(),
    hora_creacion: horaCreacionApp(),
    cliente_nombre: miNombre,
    cliente_telefono: miTelefono,
    cliente_lat: miLat,
    cliente_lon: miLon,
    cliente_direccion_desc: miDireccionDesc,
    restaurante_nombre: rNombreTemp,
    restaurante_lat: restauranteLatTemp,
    restaurante_lon: restauranteLonTemp,
    tipo_servicio: tipoServicioElegido,
    metodo_pago: "EFECTIVO",
    repartidor_nombre: "",
    repartidor_lat: 0.0,
    repartidor_lon: 0.0,
    repartidor_bearing: 0.0,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const colPed = db.collection("restaurantes").doc(restIdSeleccionadoTemp).collection("pedidos");
    const docRef = await crearPedidoConId(restIdSeleccionadoTemp, pedData);
    pedidoActivoId = docRef.id;

    await db.collection("clientes").doc(miTelefono).collection("mis_pedidos").doc(pedidoActivoId).set({
      rId: restIdSeleccionadoTemp,
      pId: pedidoActivoId,
      ...pedData
    });

    localStorage.setItem("pedidoActivoId", pedidoActivoId);
    localStorage.setItem("restIdActivo", restIdSeleccionadoTemp);
    localStorage.setItem("rNombreActivo", rNombreTemp);

    if (carritoRestPendiente) {
      const carArr = (localStorage.getItem("carrito") || "").split(";;").filter(x => x.trim() && !x.startsWith(carritoRestPendiente + "||"));
      localStorage.setItem("carrito", carArr.join(";;") + (carArr.length ? ";;" : ""));
      carritoRestPendiente = null;
    }

    setTimeout(() => {
      if (animScreen) animScreen.classList.add("hidden");
      abrirPantallaSeguimientoEnVivo();
    }, 2500);

  } catch (e) {
    if (animScreen) animScreen.classList.add("hidden");
    alert("Error al crear el pedido: " + e.message);
  }
}

// 15. SEGUIMIENTO EN VIVO
function abrirPantallaSeguimientoEnVivo() {
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutSeguimiento").classList.remove("hidden");
  document.getElementById("tvNombreRestauranteSeguimiento").textContent = rNombreTemp;

  initTrackingMap();

  if (seguimientoListener) seguimientoListener();
  seguimientoListener = db.collection("restaurantes").doc(restIdSeleccionadoTemp)
    .collection("pedidos").doc(pedidoActivoId)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      const d = doc.data();
      const es = (d.estado || d.status || "NUEVO").toUpperCase();

      if (["ENTREGADO", "COMPLETADO", "FINALIZADO", "CANCELADO"].includes(es)) {
        localStorage.removeItem("pedidoActivoId");
        pedidoActivoId = "";
        alert(es.includes("CANCEL") ? "❌ Pedido Cancelado" : "🎉 ¡Pedido finalizado!");
        cerrarPantallaSeguimiento();
        return;
      }

      const sub = d.subtotal || 0, aum = d.aumento || 0, env = d.costo_envio || 0, tot = d.total || 0;
      const pick = (d.tipo_servicio || "").toUpperCase() === "PICKUP";
      const cobEl = document.getElementById("tvCobroSeguimiento");
      if (cobEl) {
        cobEl.textContent = pick
          ? `💵 Pagas en local: L. ${tot.toFixed(2)}`
          : `💵 Pagas al repartidor: L. ${tot.toFixed(2)} (prod L. ${(sub + aum).toFixed(2)} + envío L. ${env.toFixed(2)})`;
      }

      const rN = d.repartidor_nombre || "";
      const tieneRep = rN && !rN.toLowerCase().includes("buscando");
      const rLa = d.repartidor_lat || 0, rLo = d.repartidor_lon || 0;
      const tieneGps = (rLa !== 0 && rLo !== 0);

      const stEl = document.getElementById("tvEstadoSeguimiento");
      const infEl = document.getElementById("tvInfoRepartidor");

      if (es === "NUEVO" || es === "PENDIENTE") {
        if (stEl) { stEl.textContent = "Enviado al local"; stEl.style.color = "#E11D48"; }
        if (infEl) infEl.textContent = "Esperando confirmación...";
      } else if (es === "ACEPTADO") {
        if (stEl) { stEl.textContent = "Preparando tu pedido"; stEl.style.color = "#D97706"; }
        if (infEl) infEl.textContent = "Cocinando 👨‍🍳";
      } else if (es === "EN_CAMINO") {
        if (stEl) { stEl.textContent = "🛵 En camino"; stEl.style.color = "#059669"; }
        if (infEl) infEl.textContent = `${rN} lleva tu pedido`;
      }

      actualizarMarcadoresTracking(restauranteLatTemp, restauranteLonTemp, miLat, miLon, rLa, rLo, rN, tieneRep && tieneGps);
    });
}

function initTrackingMap() {
  if (!mapTracking) {
    mapTracking = new maplibregl.Map({
      container: 'mapTracking',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [miLon, miLat],
      zoom: 14.5,
      attributionControl: false
    });
  }
}

function actualizarMarcadoresTracking(rLa, rLo, cLa, cLo, dLa, dLo, dN, showDrv) {
  if (!mapTracking) return;
  if (!markerRest && rLa && rLo) markerRest = new maplibregl.Marker().setLngLat([rLo, rLa]).addTo(mapTracking);
  if (!markerCli && cLa && cLo) markerCli = new maplibregl.Marker().setLngLat([cLo, cLa]).addTo(mapTracking);
  if (showDrv && dLa && dLo) {
    if (!markerDrv) markerDrv = new maplibregl.Marker().setLngLat([dLo, dLa]).addTo(mapTracking);
    else markerDrv.setLngLat([dLo, dLa]);
  }
}

function cerrarPantallaSeguimiento() {
  if (seguimientoListener) { seguimientoListener(); seguimientoListener = null; }
  document.getElementById("layoutSeguimiento").classList.add("hidden");
  document.getElementById("layoutAppMain").classList.remove("hidden");
  cambiarTab(0);
}

async function cancelarPedidoActivo() {
  if (!confirm("¿Deseas cancelar tu pedido?")) return;
  try {
    await db.collection("restaurantes").doc(restIdSeleccionadoTemp)
      .collection("pedidos").doc(pedidoActivoId).update({ estado: "CANCELADO" });
    alert("Pedido cancelado");
    cerrarPantallaSeguimiento();
  } catch (e) {
    alert("No se pudo cancelar el pedido: " + e.message);
  }
}

// 16. HISTORIAL DE PEDIDOS
async function cargarHistorial() {
  const c = document.getElementById("listContHistorial");
  if (!c) return;
  c.innerHTML = `<div class="empty-box"><p>Cargando pedidos...</p></div>`;
  const snap = await db.collection("clientes").doc(miTelefono).collection("mis_pedidos").get();

  if (snap.empty) {
    c.innerHTML = `<div class="empty-box"><p>Aún no tienes pedidos registrados.</p></div>`;
    return;
  }

  c.innerHTML = "";
  for (const doc of snap.docs) {
    const d = doc.data();
    const rDoc = await db.collection("restaurantes").doc(d.rId).collection("pedidos").doc(d.pId).get();
    if (!rDoc.exists) continue;
    const rData = rDoc.data();
    const es = (rData.estado || "NUEVO").toUpperCase();
    const finalizado = ["ENTREGADO", "COMPLETADO", "FINALIZADO", "CANCELADO"].includes(es);

    if ((filtroPedidos === 0 && !finalizado) || (filtroPedidos === 1 && finalizado)) {
      const card = document.createElement("div");
      card.className = "card card-row";
      card.style.margin = "0 0 12px";
      card.innerHTML = `
        <div style="flex:1">
          <h4 style="font-size:15px">${rData.restaurante_nombre} • L. ${rData.total}</h4>
          <p class="sub-muted">${rData.nombre_plato}</p>
          <span style="font-size:12px; font-weight:700; color:${es.includes("CANCEL") ? '#DC2626' : (finalizado ? '#059669' : '#D97706')}">${es}</span>
        </div>
        <span style="font-size:18px; color:var(--c-primary)">➔</span>
      `;
      card.onclick = () => {
        if (!finalizado) {
          pedidoActivoId = d.pId;
          restIdSeleccionadoTemp = d.rId;
          rNombreTemp = rData.restaurante_nombre;
          restauranteLatTemp = rData.restaurante_lat;
          restauranteLonTemp = rData.restaurante_lon;
          abrirPantallaSeguimientoEnVivo();
        } else {
          alert(`Detalles:\nRestaurante: ${rData.restaurante_nombre}\nTotal: L. ${rData.total}\nFecha: ${rData.fecha}`);
        }
      };
      c.appendChild(card);
    }
  }
}

// 17. UBICACIONES
async function mostrarSelectorUbicaciones() {
  const modal = document.getElementById("modalSelectorUbicaciones");
  const list = document.getElementById("listaMisUbicaciones");
  modal.classList.remove("hidden");
  list.innerHTML = "Cargando...";

  const doc = await db.collection("clientes").doc(miTelefono).get();
  if (!doc.exists) return;
  const dirs = doc.data().direcciones || [];
  list.innerHTML = "";

  dirs.forEach((d) => {
    const sel = (Math.abs(d.lat - miLat) < 0.0001 && Math.abs(d.lon - miLon) < 0.0001);
    const item = document.createElement("div");
    item.className = "card card-row";
    item.style.padding = "10px 14px";
    item.style.border = sel ? "2px solid var(--c-primary)" : "1px solid #E4DEF5";
    item.innerHTML = `
      <input type="radio" name="rbUbis" ${sel ? "checked" : ""} style="accent-color: var(--c-primary); margin-right: 12px;" />
      <div style="flex:1">
        <h4 style="font-size:15px">${d.etiqueta}</h4>
        ${d.desc ? `<p class="sub-muted">${d.desc}</p>` : ""}
      </div>
    `;
    item.onclick = async () => {
      miLat = d.lat; miLon = d.lon; miDireccionDesc = d.desc || d.etiqueta;
      localStorage.setItem("lat", miLat);
      localStorage.setItem("lon", miLon);
      localStorage.setItem("dir_desc", miDireccionDesc);
      await db.collection("clientes").doc(miTelefono).update({ latitud: miLat, longitud: miLon, direccion_desc: miDireccionDesc });
      actualizarCabecera();
      modal.classList.add("hidden");
      cargarInicioPrincipal();
    };
    list.appendChild(item);
  });
}

// 18. BUSCADOR EN VIVO
function filtrarResultados(q) {
  if (!q) {
    cargarInicioPrincipal();
    return;
  }
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = `<h3 style="padding: 16px 16px 8px;">Resultados para “${q}”</h3><div id="resBuscadorList"></div>`;
  const list = document.getElementById("resBuscadorList");

  const matches = todosLosProductosCache.filter(p =>
    p.pNom.toLowerCase().includes(q) ||
    p.rNom.toLowerCase().includes(q) ||
    p.pDesc.toLowerCase().includes(q)
  );

  if (!matches.length) {
    list.innerHTML = `
      <div class="empty-box">
        <div class="empty-emoji">🔍</div>
        <p class="empty-text">No encontramos platos o locales con ese nombre.</p>
      </div>
    `;
    return;
  }

  matches.forEach(p => {
    const finalPrice = precioVisible(p.pPrec, p.rLat, p.rLon);
    const row = document.createElement("div");
    row.className = "product-row-card";
    row.innerHTML = `
      <div class="product-info-left">
        <div>
          <h4>${p.pNom}</h4>
          <p class="sub-muted">De: ${p.rNom} • 🛵 Envío L. ${envioPara(p.rLat, p.rLon)}</p>
        </div>
        <div class="product-price">L. ${finalPrice.toFixed(2)}</div>
      </div>
      <div class="product-thumb-box">
        ${p.pImg ? `<img src="${p.pImg}" class="img-fill" />` : '🍽️'}
        <button type="button" class="btn-plus-abs">+</button>
      </div>
    `;
    row.onclick = () => mostrarPlatoPro(p.rId, p.rNom, p.pNom, p.pDesc, p.pPrec, p.pImg, p.pOps, p.rLat, p.rLon);
    list.appendChild(row);
  });
}


function fechaApp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return p(d.getDate()) + "/" + M[d.getMonth()] + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function horaCreacionApp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

async function crearPedidoConId(rId, m) {
  const resRef = db.collection("restaurantes").doc(rId);
  const col = resRef.collection("pedidos");
  const pedRef = col.doc();
  try {
    const q = await col.orderBy("id_numerico", "desc").limit(1).get();
    let base = 1000;
    if (!q.empty) { const x = q.docs[0].data().id_numerico; if (x > base) base = x; }
    const nuevo = await db.runTransaction(async tr => {
      const r = await tr.get(resRef);
      const c = (r.data() || {}).contador_pedidos || 0;
      const n = Math.max(c, base) + 1;
      tr.update(resRef, { contador_pedidos: n });
      tr.set(pedRef, Object.assign({}, m, { id_numerico: n }));
      return n;
    });
    m.id_numerico = nuevo;
    return pedRef;
  } catch (e) {
    alert("ID no asignado: " + e.message);
    return await col.add(m);
  }
}


async function revisarPedidoActivo() {
  if (!miTelefono) return;
  try {
    const snap = await db.collection("clientes").doc(miTelefono).collection("mis_pedidos").get();
    const finales = ["ENTREGADO", "COMPLETADO", "FINALIZADO", "CANCELADO"];
    const res = await Promise.all(snap.docs.map(async d => {
      const p = d.data();
      if (!p.rId || !p.pId) return null;
      try {
        const r = await db.collection("restaurantes").doc(p.rId).collection("pedidos").doc(p.pId).get();
        if (!r.exists) return null;
        const x = r.data();
        const est = (x.estado || "").toUpperCase();
        if (est && !finales.includes(est)) return { rId: p.rId, pId: p.pId, nombre: x.restaurante_nombre || "Restaurante", lat: x.restaurante_lat, lon: x.restaurante_lon };
      } catch (e) {}
      return null;
    }));
    const act = res.find(x => x);
    const viejo = document.getElementById("bannerActivo");
    if (!act) {
      pedidoActivoId = "";
      localStorage.removeItem("pedidoActivoId");
      if (viejo) viejo.remove();
      return;
    }
    pedidoActivoId = act.pId; restIdSeleccionadoTemp = act.rId; rNombreTemp = act.nombre;
    if (act.lat) restauranteLatTemp = act.lat;
    if (act.lon) restauranteLonTemp = act.lon;
    localStorage.setItem("pedidoActivoId", pedidoActivoId);
    localStorage.setItem("restIdActivo", restIdSeleccionadoTemp);
    localStorage.setItem("rNombreActivo", rNombreTemp);
    const cont = document.getElementById("contRestaurantes");
    if (viejo || !cont || !cont.querySelector(".hero-slider-wrap")) return;
    const b = document.createElement("div");
    b.id = "bannerActivo";
    b.className = "card card-row";
    b.style.background = "linear-gradient(to right, var(--c-accent), var(--c-accent-dark))";
    b.style.color = "#fff";
    b.style.margin = "14px 16px 0";
    b.style.cursor = "pointer";
    b.innerHTML = '<div class="cat-chip-ico" style="background:rgba(255,255,255,0.2)">🛵</div><div style="flex:1; padding-left: 12px"><h4 style="font-size:16px">¡Pedido en proceso!</h4><span style="font-size:13px; color:#FFE2B8">' + act.nombre + '</span></div><span style="font-size:20px">➔</span>';
    b.onclick = abrirPantallaSeguimientoEnVivo;
    cont.insertBefore(b, cont.firstChild);
  } catch (e) {}
}

// ===== BANNER PUBLICITARIO INTELIGENTE =====
function slogansPlato(n) {
  n = (n || "").toLowerCase();
  if (n.includes("hamburguesa") || n.includes("burger")) return ["¡Gran antojo! 🍔", "Jugosa maravilla."];
  if (n.includes("pizza")) return ["¡Para compartir! 🍕", "Con mucho queso."];
  if (n.includes("pollo") || n.includes("alitas")) return ["¡Crujiente! 🍗", "Perfecto hoy."];
  if (n.includes("taco") || n.includes("nacho")) return ["¡Sabor! 🌮", "Explosión en tu boca."];
  if (n.includes("postre") || n.includes("pastel") || n.includes("helado")) return ["¡Endulza tu día! 🍰", "Toque dulce."];
  return ["¡Pídelo ahora! ✨", "Descubre sabor."];
}

function mezclar(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function armarListaPublicitaria() {
  const base = todosLosProductosCache.filter(p => !p.rCerrado && p.pPrec > 0);
  const grupos = {};
  base.forEach(p => { (grupos[p.rId] = grupos[p.rId] || []).push(p); });
  const cols = mezclar(Object.keys(grupos).map(k => mezclar(grupos[k].slice())));
  const platos = [];
  let hay = true;
  while (hay && platos.length < 12) {
    hay = false;
    for (const g of cols) {
      if (g.length && platos.length < 12) { platos.push(g.shift()); hay = true; }
    }
  }
  const lista = platos.map(p => {
    const sl = slogansPlato(p.pNom);
    const precio = Math.round(precioVisible(p.pPrec, p.rLat, p.rLon));
    return { tipo: "plato", titulo: sl[0], sub1: p.pNom + " • L. " + precio, sub2: sl[1] + " " + p.rNom, img: p.pImg, datos: p };
  });
  const porPrecio = {};
  base.forEach(p => { (porPrecio[p.pPrec] = porPrecio[p.pPrec] || []).push(p); });
  const combos = mezclar(Object.keys(porPrecio).filter(k => porPrecio[k].length >= 2)).slice(0, 2);
  combos.forEach(k => {
    const p = porPrecio[k][0];
    const it = { tipo: "precio", precio: parseFloat(k), titulo: "¡Super Combo! 🌟", sub1: "Descubre platillos desde L. " + Math.round(parseFloat(k)), sub2: "", img: p.pImg };
    lista.splice(Math.floor(Math.random() * (lista.length + 1)), 0, it);
  });
  return lista;
}

function pintarBanner(wrap, it, idx, total) {
  wrap.innerHTML = "";
  if (it.img) {
    const im = document.createElement("img");
    im.className = "hero-bg-img";
    im.onerror = () => im.remove();
    im.src = it.img;
    wrap.appendChild(im);
    im.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }], { duration: 6000, fill: "forwards" });
  }
  const ov = document.createElement("div");
  ov.className = "hero-overlay";
  wrap.appendChild(ov);
  const c = document.createElement("div");
  c.className = "hero-content";
  const tag = document.createElement("span"); tag.className = "hero-tag"; tag.textContent = "⚡ DESTACADO";
  const t = document.createElement("div"); t.className = "hero-title"; t.textContent = it.titulo;
  const s1 = document.createElement("div"); s1.className = "hero-sub"; s1.textContent = it.sub1;
  c.appendChild(tag); c.appendChild(t); c.appendChild(s1);
  if (it.sub2) {
    const s2 = document.createElement("div"); s2.className = "hero-sub"; s2.style.opacity = "0.85"; s2.textContent = it.sub2;
    c.appendChild(s2);
  }
  const cta = document.createElement("div"); cta.className = "hero-cta"; cta.textContent = "Pedir ahora ➔";
  c.appendChild(cta);
  wrap.appendChild(c);
  const dots = document.createElement("div");
  dots.style.cssText = "position:absolute;bottom:12px;left:18px;display:flex;gap:5px;z-index:3";
  const n = Math.min(Math.max(total, 1), 6);
  for (let i = 0; i < n; i++) {
    const d = document.createElement("span");
    const act = i === (idx % n);
    d.style.cssText = "height:6px;border-radius:4px;width:" + (act ? 20 : 6) + "px;background:" + (act ? "#FF8A00" : "rgba(255,255,255,0.5)");
    dots.appendChild(d);
  }
  wrap.appendChild(dots);
  wrap.onclick = () => {
    if (it.tipo === "precio") mostrarPlatosPorPrecio(it.precio);
    else {
      const p = it.datos;
      mostrarPlatoPro(p.rId, p.rNom, p.pNom, p.pDesc, p.pPrec, p.pImg, p.pOps, p.rLat, p.rLon);
    }
  };
  wrap.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 450 });
}

function iniciarSliderPublicitario() {
  if (sliderTimer) clearTimeout(sliderTimer);
  sliderIndexActual = 0;
  let lista = [], ultimoN = -1;
  const tick = () => {
    const wrap = document.querySelector(".hero-slider-wrap");
    if (!wrap || !wrap.isConnected) { sliderTimer = null; return; }
    if (wrap.offsetParent === null) { sliderTimer = setTimeout(tick, 1500); return; }
    if (todosLosProductosCache.length !== ultimoN) {
      ultimoN = todosLosProductosCache.length;
      lista = armarListaPublicitaria();
    }
    if (!lista.length) { sliderTimer = setTimeout(tick, 800); return; }
    const idx = sliderIndexActual % lista.length;
    pintarBanner(wrap, lista[idx], idx, lista.length);
    sliderIndexActual++;
    sliderTimer = setTimeout(tick, 5000);
  };
  tick();
}

function mostrarPlatosPorPrecio(pO) {
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = '<div class="section-header"><button class="circle-btn back-btn" onclick="cargarInicioPrincipal()">❮</button><div style="flex:1; margin-left:14px"><h3 style="font-size:18px">Especiales desde L. ' + Math.round(pO) + '</h3><span class="sub-muted">Precio final según tu distancia</span></div></div><div id="listPrecioEsp" style="margin-top:10px"></div>';
  const list = document.getElementById("listPrecioEsp");
  const items = todosLosProductosCache.filter(p => p.pPrec === pO);
  if (!items.length) { list.innerHTML = '<div class="empty-box"><p>No encontramos platillos con este precio.</p></div>'; return; }
  items.forEach(p => {
    const row = document.createElement("div");
    row.className = "product-row-card";
    row.innerHTML = '<div class="product-info-left"><div><h4>' + p.pNom + '</h4><p class="sub-muted">De: ' + p.rNom + ' • 🛵 Envío L. ' + envioPara(p.rLat, p.rLon) + '</p></div><div class="product-price">L. ' + precioVisible(p.pPrec, p.rLat, p.rLon).toFixed(2) + '</div></div><div class="product-thumb-box">' + (p.pImg ? '<img src="' + p.pImg + '" class="img-fill" />' : '🍽️') + '<button type="button" class="btn-plus-abs">+</button></div>';
    row.onclick = () => mostrarPlatoPro(p.rId, p.rNom, p.pNom, p.pDesc, p.pPrec, p.pImg, p.pOps, p.rLat, p.rLon);
    list.appendChild(row);
  });
}

// ===== AJUSTES, AVISOS Y CARRITO =====
const LEGAL_TERMINOS = "Última actualización: 30 de octubre de 2026\n\nAl crear una cuenta y usar Llevari aceptas estos términos.\n\n1. EL SERVICIO\nLlevari conecta clientes, locales y repartidores. Los productos son preparados y vendidos por cada local; el reparto lo realiza un repartidor independiente.\n\n2. CUENTA\nDebes tener al menos 18 años y dar datos verdaderos. Eres responsable de tu contraseña y de lo que ocurra con tu cuenta.\n\n3. PEDIDOS Y PRECIOS\nEl precio de cada producto que ves en la app incluye un pequeño ajuste por el servicio de entrega, que varía según la distancia. El costo de envío se muestra por separado y el resumen del pedido te da el desglose y el total antes de confirmar. Para ciertas distancias puede aplicar un pedido mínimo. Un pedido queda confirmado cuando lo envías y el local lo acepta.\n\n4. PAGO\nEl pago se realiza en efectivo, al repartidor (delivery) o en el local (retiro). Debes tener el monto disponible al momento de la entrega.\n\n5. CANCELACIONES\nPuedes cancelar mientras el local no haya aceptado tu pedido. Una vez aceptado, podría no ser posible. Los pedidos rechazados repetidamente en la puerta pueden resultar en la suspensión de tu cuenta.\n\n6. ENTREGA\nLos tiempos son estimados y pueden variar por tráfico, clima o demanda. Debes estar disponible en la dirección indicada y que esta sea correcta.\n\n7. CONDUCTA\nNo está permitido el trato abusivo hacia repartidores o locales, enviar contenido ofensivo o ilegal en el chat, ni dar datos falsos o usar la app con fines fraudulentos. Podemos suspender cuentas que incumplan.\n\n8. RESPONSABILIDAD\nCada local responde por la calidad, ingredientes y alérgenos de sus productos. Llevari no se hace responsable por retrasos ajenos a su control. Informa cualquier problema al correo de soporte.\n\n9. ELIMINACIÓN DE CUENTA\nPuedes eliminar tu cuenta cuando quieras desde la app. Se aplica lo indicado en la Política de Privacidad.\n\n10. CAMBIOS Y LEY APLICABLE\nPodemos modificar estos términos; si el cambio es importante te pediremos aceptarlos de nuevo. Se rigen por las leyes de Honduras.\n\n11. CONTACTO\npharethd@gmail.com";
const LEGAL_POLITICA = "Última actualización: 30 de octubre de 2026\n\nResponsable: Llevari (contacto: pharethd@gmail.com).\n\nLlevari (\"la app\") es una aplicación de pedidos a domicilio y retiro en local. Esta política explica qué datos recopilamos, para qué los usamos, con quién los compartimos y cómo puedes eliminarlos.\n\n1. DATOS QUE RECOPILAMOS\n• Cuenta: nombre, correo, teléfono, contraseña (la gestiona Firebase Authentication; nosotros no la vemos ni la guardamos en texto), ciudad e idioma.\n• Ubicación: tu ubicación precisa (GPS) y las direcciones que guardas, para calcular distancia y costo de envío y para que el repartidor llegue a ti. La ubicación de entrega se guarda en cada pedido.\n• Fotos: imágenes que envías en el chat con el repartidor (cámara o galería). Solo las ven tú y el repartidor de ese pedido. La cámara se solicita únicamente cuando tocas el botón 📷.\n• Pedidos y mensajes: historial de pedidos, montos y chat con el repartidor.\n• Fecha y versión de los términos que aceptaste.\n\n2. PARA QUÉ USAMOS TUS DATOS\n• Crear y proteger tu cuenta.\n• Procesar y entregar tus pedidos.\n• Calcular tarifas y mostrar el seguimiento en el mapa, incluida la ubicación en vivo del repartidor mientras tu pedido está en camino.\n• Permitir la comunicación con el repartidor.\n• Brindarte soporte.\n\n3. CON QUIÉN SE COMPARTEN\n• Con el local: tu nombre y tu pedido.\n• Con el repartidor asignado: nombre, teléfono, dirección y ubicación de entrega, y el chat.\n• Proveedores técnicos: Google Firebase (autenticación y almacenamiento de datos) y servicios de mapas y rutas: OpenStreetMap/Nominatim (búsqueda de direcciones), OSRM (rutas y distancias), OpenFreeMap (mapa), Esri (imagen satelital) y unpkg (librería del mapa). Estos servicios pueden recibir tu dirección IP y las coordenadas que consultas.\nNo vendemos tus datos a terceros.\n\n4. UBICACIÓN\nSolo usamos tu ubicación mientras usas la app. Puedes negar el permiso y ubicar tu dirección manualmente en el mapa.\n\n5. CONSERVACIÓN\nGuardamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta borramos tu perfil, direcciones, historial y mensajes del chat. Los pedidos registrados por el local se conservan sin tu nombre, teléfono ni ubicación, por razones contables.\n\n6. TUS DERECHOS\nPuedes ver, corregir o eliminar tus datos. Para eliminar tu cuenta usa \"Eliminar mi cuenta\" dentro de la app (ícono ⚙️ en la pantalla principal) o escríbenos al correo de contacto y la eliminaremos por ti.\n\n7. SEGURIDAD\nAplicamos medidas razonables para proteger tu información, pero ningún sistema es 100% seguro. No compartas tu contraseña con nadie.\n\n8. MENORES DE EDAD\nLa app es solo para mayores de 18 años y al registrarte confirmas que lo eres. No recopilamos datos de menores a sabiendas.\n\n9. CAMBIOS\nPodemos actualizar esta política. Publicaremos la nueva versión en la app y te pediremos aceptarla de nuevo si el cambio es importante.\n\n10. CONTACTO\npharethd@gmail.com";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  let t = document.getElementById("toastMsg");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastMsg";
    t.style.cssText = "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86%;background:rgba(31,27,46,0.94);color:#fff;padding:12px 18px;border-radius:22px;font-size:14px;font-weight:600;z-index:200;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,0.3);transition:opacity .25s;opacity:0;pointer-events:none";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = "0"; }, 2800);
}

function crearModalAjustes() {
  let m = document.getElementById("modalAjustes");
  if (m) return m;
  m = document.createElement("div");
  m.id = "modalAjustes";
  m.className = "modal-backdrop-alert hidden";
  m.onclick = e => { if (e.target === m) m.classList.add("hidden"); };
  document.getElementById("appRoot").appendChild(m);
  return m;
}

function abrirAjustes() {
  const m = crearModalAjustes();
  m.innerHTML = '<div class="dialog-card">' +
    '<h3 style="margin-bottom:4px">Ajustes ⚙️</h3>' +
    '<p class="card-desc" style="margin-bottom:16px">Información legal de LLEVARI.</p>' +
    '<button class="btn btn-outline-primary" id="ajTer" style="margin-bottom:12px">📜 Términos y Condiciones</button>' +
    '<button class="btn btn-outline-primary" id="ajPol" style="margin-bottom:12px">📄 Política de Privacidad</button>' +
    '<button class="btn btn-muted" id="ajCer">CERRAR</button></div>';
  document.getElementById("ajTer").onclick = () => verLegal("Términos y Condiciones", LEGAL_TERMINOS);
  document.getElementById("ajPol").onclick = () => verLegal("Política de Privacidad", LEGAL_POLITICA);
  document.getElementById("ajCer").onclick = () => m.classList.add("hidden");
  m.classList.remove("hidden");
}

function verLegal(titulo, texto) {
  const m = crearModalAjustes();
  m.innerHTML = '<div class="dialog-card" style="display:flex;flex-direction:column;max-height:82vh">' +
    '<h3 style="margin-bottom:12px">' + esc(titulo) + '</h3>' +
    '<div style="flex:1;overflow-y:auto;white-space:pre-wrap;font-size:13.5px;line-height:1.5;color:var(--c-text);margin-bottom:14px">' + esc(texto || "Este documento no está disponible por el momento.") + '</div>' +
    '<button class="btn btn-primary" id="legVol">❮ Volver</button></div>';
  document.getElementById("legVol").onclick = abrirAjustes;
  m.classList.remove("hidden");
}

const btnCfgHeader = document.getElementById("btnHeaderConfig");
if (btnCfgHeader) btnCfgHeader.onclick = abrirAjustes;

function leerCarrito() {
  return (localStorage.getItem("carrito") || "").split(";;").filter(x => x.trim()).map(raw => {
    const p = raw.split("||");
    if (p.length < 5) return null;
    return { raw: raw, rId: p[0], rNom: p[1], nombre: p[2], precio: parseFloat(p[3]) || 0, ops: p[4], img: p[5] || "", lat: parseFloat(p[6]) || 0, lon: parseFloat(p[7]) || 0 };
  }).filter(Boolean);
}

function guardarCarrito(items) {
  localStorage.setItem("carrito", items.map(i => i.raw).join(";;") + (items.length ? ";;" : ""));
}

function agregarAlCarrito(rId, rNom, nombre, precioTotal, opciones, img, lat, lon) {
  const lim = s => String(s == null ? "" : s).replace(/\|/g, "/").replace(/;/g, ",");
  if (!lat || !lon) { lat = miLat + 0.003; lon = miLon + 0.003; }
  const imagen = (img && img.length < 150000) ? img : "";
  const armar = im => [lim(rId), lim(rNom), lim(nombre), Number(precioTotal).toFixed(2), lim(opciones), im, lat, lon].join("||") + ";;";
  const curr = localStorage.getItem("carrito") || "";
  try {
    localStorage.setItem("carrito", curr + armar(imagen));
  } catch (e) {
    try { localStorage.setItem("carrito", curr + armar("")); }
    catch (e2) { toast("No se pudo guardar en el carrito"); return; }
  }
  actualizarBadgeCarrito();
  toast("🛒 Agregado al carrito");
}

function mostrarTabInicioSinRecargar() {
  tabActualIndex = 0;
  document.querySelectorAll(".nav-item[data-tab]").forEach(el => {
    el.classList.toggle("active", parseInt(el.getAttribute("data-tab")) === 0);
  });
  document.querySelectorAll(".tab-view").forEach((t, i) => t.classList.toggle("active", i === 0));
}

function dibujarCarrito() {
  const cont = document.getElementById("contCarrito");
  if (!cont) return;
  actualizarBadgeCarrito();
  cont.innerHTML = "";
  const items = leerCarrito();
  if (!items.length) {
    cont.innerHTML = '<div class="empty-box"><div class="empty-emoji">🛒</div><h3>Tu carrito está vacío</h3><p class="empty-text">Agrega platillos desde tus locales favoritos</p></div>';
    return;
  }

  const grupos = {};
  items.forEach((it, idx) => {
    it.idx = idx;
    const g = grupos[it.rId] = grupos[it.rId] || { rId: it.rId, rNom: it.rNom, lat: it.lat, lon: it.lon, subtotal: 0, items: [] };
    g.subtotal += it.precio;
    g.items.push(it);
  });
  const lista = Object.values(grupos);

  const tit = document.createElement("div");
  tit.style.padding = "0 4px 14px";
  tit.innerHTML = '<h2 style="font-size:26px">Tu carrito</h2><span class="sub-muted">' + items.length + (items.length === 1 ? " producto" : " productos") + (lista.length > 1 ? " • " + lista.length + " locales" : "") + '</span>';
  cont.appendChild(tit);

  lista.forEach(g => {
    const t = calcularTarifa(kmHaciaSync(g.lat, g.lon), Math.round(g.subtotal));
    const total = g.subtotal + t.aumento + t.envio;
    const falta = t.minimo > 0 && Math.round(g.subtotal) < t.minimo;

    const head = document.createElement("div");
    head.className = "card card-row";
    head.style.cssText = "padding:14px;margin-bottom:12px";
    head.innerHTML = '<div class="logo-box"><span>🏪</span></div>' +
      '<div style="flex:1;padding:0 10px;min-width:0"><h4 style="font-size:16px">' + esc(g.rNom) + '</h4>' +
      '<span class="sub-muted">⏱ Recibes en 20-35 min</span><br>' +
      '<span style="font-size:12px;font-weight:700;color:var(--c-primary-dark)">🛵 Envío L. ' + t.envio + '</span></div>' +
      '<div class="moto-badge">🛵</div>';
    cont.appendChild(head);

    g.items.forEach(it => {
      const visible = it.precio + (g.subtotal > 0 ? t.aumento * it.precio / g.subtotal : 0);
      const row = document.createElement("div");
      row.className = "card card-row";
      row.style.cssText = "padding:12px;margin-bottom:12px";
      row.innerHTML = '<div class="logo-box item-box"><span>🍽️</span></div>' +
        '<div style="flex:1;padding:0 10px;min-width:0"><h4 style="font-size:15px">' + esc(it.nombre) + '</h4>' +
        (it.ops ? '<p class="sub-muted" style="margin-top:3px">' + esc(it.ops) + '</p>' : '') +
        '<div style="font-weight:800;color:var(--c-primary-dark);margin-top:6px">L. ' + visible.toFixed(2) + '</div></div>' +
        '<button class="circle-btn" style="background:#FEE2E2;color:#DC2626">🗑</button>';
      if (it.img) {
        const box = row.querySelector(".logo-box");
        const im = document.createElement("img");
        im.className = "img-fill";
        im.onload = () => { const sp = box.querySelector("span"); if (sp) sp.remove(); };
        im.onerror = () => im.remove();
        im.src = it.img;
        box.appendChild(im);
      }
      row.querySelector("button").onclick = () => {
        const arr = leerCarrito();
        arr.splice(it.idx, 1);
        guardarCarrito(arr);
        dibujarCarrito();
      };
      cont.appendChild(row);
    });

    if (falta) {
      const w = document.createElement("div");
      w.className = "alert-box-warning";
      w.style.margin = "0 0 12px";
      w.textContent = "⚠️ Pedido mínimo para delivery: L. " + t.minimo + " (te faltan L. " + (t.minimo - Math.round(g.subtotal)) + ")";
      cont.appendChild(w);
    }

    const b1 = document.createElement("button");
    b1.className = "btn btn-warning";
    b1.style.marginBottom = "10px";
    if (falta) b1.style.opacity = "0.55";
    b1.textContent = "PEDIR ESTE LOCAL ➔ L. " + total.toFixed(2);
    b1.onclick = () => pedirDesdeCarrito(g.rId);
    cont.appendChild(b1);

    const b2 = document.createElement("button");
    b2.className = "btn btn-outline-primary";
    b2.style.marginBottom = "22px";
    b2.textContent = "➕ Agregar más de este local";
    b2.onclick = () => { mostrarTabInicioSinRecargar(); abrirMenuRestaurante(g.rId, g.rNom, g.lat, g.lon, ""); };
    cont.appendChild(b2);
  });
}

let verificandoCarrito = false;
async function pedirDesdeCarrito(rId) {
  if (verificandoCarrito) return;
  const items = leerCarrito().filter(i => i.rId === rId);
  if (!items.length) return;
  verificandoCarrito = true;
  try {
    try {
      const d = await db.collection("restaurantes").doc(rId).get();
      if (d.exists && (d.data().estado || "").toUpperCase() === "CERRADO") { toast("🛑 Este local está cerrado ahora."); return; }
    } catch (e) { toast("No se pudo verificar el local. Revisa tu conexión."); return; }

    let sum = 0;
    items.forEach(i => { sum += i.precio; });
    const lat = items[0].lat || (miLat + 0.003), lon = items[0].lon || (miLon + 0.003);
    const t = calcularTarifa(kmHaciaSync(lat, lon), Math.round(sum));
    if (t.minimo > 0 && Math.round(sum) < t.minimo) {
      toast("Pedido mínimo para delivery: L. " + t.minimo + ". Te faltan L. " + (t.minimo - Math.round(sum)) + ". Agrega más productos.");
      return;
    }

    restIdSeleccionadoTemp = rId;
    rNombreTemp = items[0].rNom;
    platoTemp = items.map(i => i.nombre + (i.ops ? " (" + i.ops + ")" : "")).join("\n");
    precioPlatoTemp = sum;
    imgPlatoTemp = items[0].img;
    restauranteLatTemp = lat;
    restauranteLonTemp = lon;
    carritoRestPendiente = rId;
    abrirPantallaTipoServicio();
    const nom = document.getElementById("svItemNombre");
    if (nom) nom.style.whiteSpace = "pre-line";
  } finally {
    verificandoCarrito = false;
  }
}

// ===== MAPA DE UBICACION (igual que la app) + AGREGAR UBICACION =====
const ESTILO_CALLE = "https://tiles.openfreemap.org/styles/liberty";
const ESTILO_SAT = { version: 8, sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "© Esri", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } }, layers: [{ id: "sat", type: "raster", source: "sat" }] };
let mapaSat = false, meMarker = null, tRev = null, tSea = null, controlesMapaListos = false, agregandoDesdeApp = false;

function prepararControlesMapa() {
  if (controlesMapaListos) return;
  controlesMapaListos = true;
  const lay = document.getElementById("layoutMapa");
  const box = document.getElementById("mapSearch");
  const inp = document.getElementById("inputGeoSearch");
  const res = document.getElementById("geoResults");
  box.style.zIndex = "11";
  inp.placeholder = "🔍 Buscar calle, colonia o lugar";
  inp.style.cssText = "width:100%;padding:13px 16px;border:none;border-radius:16px;font-size:15px;background:#fff;box-shadow:0 4px 16px rgba(59,7,100,.25);outline:none;color:#1F1B2E";
  inp.addEventListener("input", () => {
    clearTimeout(tSea);
    const v = inp.value.trim();
    if (v.length < 3 || !mapPicker) { res.classList.add("hidden"); return; }
    tSea = setTimeout(() => {
      const c = mapPicker.getCenter(), k = 0.6;
      const vb = (c.lng - k) + "," + (c.lat + k) + "," + (c.lng + k) + "," + (c.lat - k);
      fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&viewbox=" + vb + "&q=" + encodeURIComponent(v))
        .then(r => r.json()).then(a => {
          res.innerHTML = "";
          if (!a.length) {
            const d0 = document.createElement("div");
            d0.textContent = "Sin resultados";
            res.appendChild(d0);
          } else {
            a.forEach(p => {
              const d1 = document.createElement("div");
              d1.textContent = p.display_name.split(",").slice(0, 3).join(",");
              d1.onclick = () => {
                mapPicker.flyTo({ center: [+p.lon, +p.lat], zoom: 18, duration: 700 });
                inp.value = "";
                res.classList.add("hidden");
              };
              res.appendChild(d1);
            });
          }
          res.classList.remove("hidden");
        }).catch(() => {});
    }, 450);
  });
  const bc = document.createElement("button");
  bc.id = "btnCapaMapa";
  bc.className = "map-fab-btn";
  bc.textContent = "🛰️";
  bc.style.cssText = "top:128px;bottom:auto;right:14px";
  bc.onclick = () => {
    if (!mapPicker) return;
    mapaSat = !mapaSat;
    mapPicker.setStyle(mapaSat ? ESTILO_SAT : ESTILO_CALLE);
    bc.textContent = mapaSat ? "🗺️" : "🛰️";
  };
  lay.appendChild(bc);
  document.getElementById("mapAddr").style.bottom = "150px";
  const fab = document.getElementById("btnMiUbi");
  fab.style.bottom = "205px";
  fab.onclick = () => irAMiUbicacion(false);
  document.getElementById("shadow").style.transition = "all .18s ease";
}

function ocultarResultadosGeo() {
  const res = document.getElementById("geoResults");
  if (res) res.classList.add("hidden");
  const inp = document.getElementById("inputGeoSearch");
  if (inp) inp.blur();
}

function levantarPin(on) {
  const p = document.getElementById("pin"), s = document.getElementById("shadow");
  if (p) p.classList.toggle("lift", on);
  if (s) { s.style.transform = on ? "scale(.6)" : ""; s.style.opacity = on ? ".5" : ""; }
}

function geocodificarCentro() {
  const el = document.getElementById("mapAddr");
  if (!mapPicker || !el) return;
  const c = mapPicker.getCenter();
  fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=" + c.lat + "&lon=" + c.lng)
    .then(r => r.json()).then(j => {
      if (!j || !j.display_name) throw 0;
      el.textContent = "📍 " + j.display_name.split(",").slice(0, 3).join(",").trim();
      el.classList.remove("hidden");
    }).catch(() => el.classList.add("hidden"));
}

function irAMiUbicacion(silencioso) {
  if (!navigator.geolocation || !mapPicker) { if (!silencioso) toast("Tu navegador no permite ubicación"); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    if (!mapPicker) return;
    const la = pos.coords.latitude, lo = pos.coords.longitude;
    if (meMarker) meMarker.setLngLat([lo, la]);
    else {
      const e = document.createElement("div");
      e.style.cssText = "width:18px;height:18px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)";
      meMarker = new maplibregl.Marker({ element: e }).setLngLat([lo, la]).addTo(mapPicker);
    }
    mapPicker.flyTo({ center: [lo, la], zoom: 17.5, duration: 800 });
  }, () => { if (!silencioso) toast("Enciende tu GPS y da permiso de ubicación"); }, { enableHighAccuracy: !silencioso, timeout: 10000, maximumAge: silencioso ? 60000 : 0 });
}

function initMapPicker(lat, lon) {
  prepararControlesMapa();
  if (!mapPicker) {
    mapPicker = new maplibregl.Map({ container: "mapContainerPick", style: ESTILO_CALLE, center: [lon, lat], zoom: 17, attributionControl: false });
    mapPicker.touchZoomRotate.enableRotation();
    mapPicker.on("movestart", () => { levantarPin(true); ocultarResultadosGeo(); });
    mapPicker.on("move", () => { const c = mapPicker.getCenter(); tempMapaLat = c.lat; tempMapaLon = c.lng; });
    mapPicker.on("moveend", () => { levantarPin(false); clearTimeout(tRev); tRev = setTimeout(geocodificarCentro, 500); });
  } else {
    mapPicker.resize();
    mapPicker.jumpTo({ center: [lon, lat], zoom: 17 });
  }
  setTimeout(() => { if (mapPicker) mapPicker.resize(); }, 150);
  geocodificarCentro();
}

function abrirMapaNuevaDireccion() {
  document.getElementById("layoutAuth").classList.add("hidden");
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutMapa").classList.remove("hidden");
  initMapPicker(tempMapaLat, tempMapaLon);
  irAMiUbicacion(true);
}

function volverDeMapa() {
  document.getElementById("layoutMapa").classList.add("hidden");
  if (agregandoDesdeApp) {
    agregandoDesdeApp = false;
    document.getElementById("layoutAppMain").classList.remove("hidden");
  } else {
    document.getElementById("layoutAuth").classList.remove("hidden");
  }
}

async function guardarDetalleDireccion() {
  const sel = document.querySelector('input[name="rbTipoDir"]:checked');
  const etiqueta = sel ? sel.value : "Casa";
  const campo = document.getElementById("etDescDireccion");
  const desc = campo.value.trim();
  const dir = { etiqueta, desc, lat: tempMapaLat, lon: tempMapaLon };
  document.getElementById("modalDetalleDir").classList.add("hidden");
  campo.value = "";
  if (agregandoDesdeApp) {
    volverDeMapa();
    await guardarNuevaUbicacionCuenta(dir);
    return;
  }
  listaDireccionesReg.push(dir);
  indiceDireccionSeleccionada = listaDireccionesReg.length - 1;
  volverDeMapa();
  actualizarListaDireccionesReg();
}

async function guardarNuevaUbicacionCuenta(dir) {
  if (!miTelefono) return;
  try {
    await db.collection("clientes").doc(miTelefono).update({ direcciones: firebase.firestore.FieldValue.arrayUnion(dir) });
    seleccionarUbicacion(dir.lat, dir.lon, dir.etiqueta, dir.desc, -1);
  } catch (e) {
    toast("No se pudo guardar la ubicación: " + e.message);
  }
}

function seleccionarUbicacion(lat, lon, etiqueta, desc, idx) {
  miLat = lat; miLon = lon;
  miDireccionDesc = (desc && desc.trim()) ? desc.trim() : etiqueta;
  localStorage.setItem("lat", miLat);
  localStorage.setItem("lon", miLon);
  localStorage.setItem("dir_desc", miDireccionDesc);
  const up = { latitud: miLat, longitud: miLon, direccion_desc: miDireccionDesc };
  if (idx >= 0) up.indice_dir_activa = idx;
  db.collection("clientes").doc(miTelefono).update(up).catch(() => {});
  actualizarCabecera();
  cambiarTab(tabActualIndex);
  toast("📍 Ubicación actualizada");
}

async function mostrarSelectorUbicaciones() {
  const modal = document.getElementById("modalSelectorUbicaciones");
  const list = document.getElementById("listaMisUbicaciones");
  modal.classList.remove("hidden");
  list.style.cssText = "max-height:40vh;overflow-y:auto;margin-bottom:12px";
  list.innerHTML = '<p class="sub-muted">Cargando...</p>';
  let dirs = [];
  try {
    const doc = await db.collection("clientes").doc(miTelefono).get();
    if (doc.exists) dirs = doc.data().direcciones || [];
  } catch (e) {
    list.innerHTML = '<p class="sub-muted" style="color:#DC2626">No se pudieron cargar tus ubicaciones.</p>';
    return;
  }
  list.innerHTML = "";
  const validas = dirs.map((d, i) => ({ d, i })).filter(x => x.d && x.d.lat && x.d.lon);
  if (!validas.length) { list.innerHTML = '<p class="sub-muted">Aún no tienes ubicaciones guardadas.</p>'; return; }
  validas.forEach(({ d, i }) => {
    const sel = Math.abs(d.lat - miLat) < 0.0001 && Math.abs(d.lon - miLon) < 0.0001;
    const ico = d.etiqueta === "Casa" ? "🏠" : d.etiqueta === "Trabajo" ? "💼" : "📍";
    const item = document.createElement("div");
    item.className = "card card-row";
    item.style.cssText = "padding:10px 14px;margin-bottom:10px;border:" + (sel ? "2px solid var(--c-primary)" : "1px solid #E4DEF5") + ";background:" + (sel ? "var(--c-primary-light)" : "#fff");
    item.innerHTML = '<input type="radio" ' + (sel ? "checked" : "") + ' style="accent-color: var(--c-primary); margin-right: 12px; pointer-events:none" /><div style="flex:1"><h4 style="font-size:15px">' + ico + " " + esc(d.etiqueta) + "</h4>" + (d.desc ? '<p class="sub-muted">' + esc(d.desc) + "</p>" : "") + "</div>";
    item.onclick = () => { modal.classList.add("hidden"); seleccionarUbicacion(d.lat, d.lon, d.etiqueta, d.desc, i); };
    list.appendChild(item);
  });
}

(function () {
  const bn = document.getElementById("btnModalNuevaUbi");
  if (bn) bn.onclick = () => {
    agregandoDesdeApp = true;
    document.getElementById("modalSelectorUbicaciones").classList.add("hidden");
    tempMapaLat = miLat; tempMapaLon = miLon;
    abrirMapaNuevaDireccion();
  };
  const mo = document.getElementById("modalSelectorUbicaciones");
  if (mo) mo.onclick = e => { if (e.target === mo) mo.classList.add("hidden"); };
})();

// ===== REGISTRO: VALIDACIONES =====
const LONG_TEL_PAIS = { "+504": 8, "+52": 10, "+503": 8, "+502": 8, "+1": 10 };
async function validarPaso1Registro() {
  const n = document.getElementById("etRegNombre").value.trim();
  const c = document.getElementById("etRegCorreo").value.trim().toLowerCase();
  const telNum = document.getElementById("etRegTelefono").value.trim();
  const p = document.getElementById("etRegPin").value;
  const cb = document.getElementById("cbAcepto").checked;
  const pais = document.getElementById("spRegPais").value;
  if (!n || !c || !telNum || !p) return alert("Completa todos los campos");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return alert("Correo inválido");
  const largo = LONG_TEL_PAIS[pais];
  if (!/^\d+$/.test(telNum) || (largo && telNum.length !== largo)) return alert("El número debe tener " + largo + " dígitos");
  if (p.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");
  if (!cb) return alert("Debes aceptar los términos y la política");
  try {
    const docTel = await db.collection("clientes").doc(pais + telNum).get();
    if (docTel.exists) return alert("Teléfono ya registrado");
    const snapEmail = await db.collection("clientes").where("correo", "==", c).get();
    if (!snapEmail.empty) return alert("Correo ya registrado");
  } catch (e) {
    return alert("No se pudo verificar tus datos. Revisa tu conexión.");
  }
  document.getElementById("layoutRegPaso1").classList.add("hidden");
  document.getElementById("layoutRegPaso2").classList.remove("hidden");
}

// ===== PEDIDOS: CARGA EN PARALELO =====
const ESTADOS_FINALES = ["ENTREGADO", "ENTREGADA", "COMPLETADO", "COMPLETADA", "FINALIZADO", "FINALIZADA", "TERMINADO", "TERMINADA", "DELIVERED", "CANCELADO", "CANCELADA"];

function etiquetaEstado(es) {
  if (es === "NUEVO" || es === "PENDIENTE") return ["⏳ Esperando restaurante", "#D97706"];
  if (es === "ACEPTADO") return ["👨‍🍳 Preparando tu orden", "#2563EB"];
  if (es === "EN_CAMINO" || es === "DESPACHADO") return ["🛵 En camino", "#059669"];
  if (es.indexOf("CANCEL") === 0) return ["❌ Cancelado", "#DC2626"];
  if (ESTADOS_FINALES.includes(es)) return ["✅ Entregado", "#475569"];
  return ["🛵 " + es, "#059669"];
}

async function cargarHistorial() {
  const c = document.getElementById("listContHistorial");
  if (!c) return;
  const miFiltro = filtroPedidos;
  c.innerHTML = '<div class="empty-box"><p>Cargando pedidos...</p></div>';
  let snap;
  try {
    snap = await db.collection("clientes").doc(miTelefono).collection("mis_pedidos").get();
  } catch (e) {
    c.innerHTML = '<div class="empty-box"><p>No se pudieron cargar tus pedidos.</p></div>';
    return;
  }
  if (snap.empty) { c.innerHTML = '<div class="empty-box"><p>Aún no tienes pedidos registrados.</p></div>'; return; }
  const res = await Promise.all(snap.docs.map(async doc => {
    const d = doc.data();
    if (!d.rId || !d.pId) return null;
    try {
      const r = await db.collection("restaurantes").doc(d.rId).collection("pedidos").doc(d.pId).get();
      return r.exists ? { d, r: r.data() } : null;
    } catch (e) { return null; }
  }));
  if (miFiltro !== filtroPedidos) return;
  const filas = res.filter(Boolean).map(x => {
    const es = (x.r.estado || "NUEVO").toUpperCase();
    return Object.assign(x, { es, fin: ESTADOS_FINALES.includes(es) });
  }).filter(x => miFiltro === 0 ? !x.fin : x.fin);
  c.innerHTML = "";
  if (!filas.length) {
    c.innerHTML = '<div class="empty-box"><p>' + (miFiltro === 0 ? "No tienes pedidos en curso ahora." : "Aún no tienes pedidos finalizados.") + "</p></div>";
    return;
  }
  filas.sort((a, b) => (b.r.id_numerico || 0) - (a.r.id_numerico || 0));
  filas.forEach(x => {
    const r = x.r, et = etiquetaEstado(x.es);
    const card = document.createElement("div");
    card.className = "card card-row";
    card.style.margin = "0 0 12px";
    card.style.cursor = "pointer";
    card.innerHTML = '<div style="flex:1;min-width:0"><h4 style="font-size:15px">' + esc(r.restaurante_nombre) + " • L. " + Number(r.total || 0).toFixed(2) + '</h4><p class="sub-muted" style="white-space:pre-line;margin:3px 0 8px">' + esc(r.nombre_plato) + '</p><span style="font-size:12px;font-weight:700;color:' + et[1] + '">' + et[0] + '</span></div><span style="font-size:18px;color:var(--c-primary)">➔</span>';
    card.onclick = () => {
      if (!x.fin) {
        pedidoActivoId = x.d.pId;
        restIdSeleccionadoTemp = x.d.rId;
        rNombreTemp = r.restaurante_nombre;
        restauranteLatTemp = r.restaurante_lat || miLat;
        restauranteLonTemp = r.restaurante_lon || miLon;
        localStorage.setItem("pedidoActivoId", pedidoActivoId);
        localStorage.setItem("restIdActivo", restIdSeleccionadoTemp);
        localStorage.setItem("rNombreActivo", rNombreTemp);
        abrirPantallaSeguimientoEnVivo();
      } else {
        alert("Restaurante: " + r.restaurante_nombre + "\nFecha: " + (r.fecha || "") + "\nEstado: " + x.es + "\n\n" + (r.nombre_plato || "") + "\n\nProductos: L. " + (Number(r.subtotal || 0) + Number(r.aumento || 0)).toFixed(2) + "\nEnvío: L. " + Number(r.costo_envio || 0).toFixed(2) + "\nTotal: L. " + Number(r.total || 0).toFixed(2));
      }
    };
    c.appendChild(card);
  });
}


// ===== LEGAL EN VENTANA MODAL =====
function verLegal(titulo, texto, desdeAjustes) {
  const m = crearModalAjustes();
  const volver = desdeAjustes !== false;
  m.innerHTML = '<div class="dialog-card" style="display:flex;flex-direction:column;max-height:82vh">' +
    '<h3 style="margin-bottom:12px">' + esc(titulo) + '</h3>' +
    '<div style="flex:1;overflow-y:auto;white-space:pre-wrap;font-size:13.5px;line-height:1.5;color:var(--c-text);margin-bottom:14px">' + esc(texto || "Este documento no está disponible por el momento.") + '</div>' +
    '<button class="btn btn-primary" id="legVol">' + (volver ? "❮ Volver" : "CERRAR") + '</button></div>';
  document.getElementById("legVol").onclick = volver ? abrirAjustes : () => m.classList.add("hidden");
  m.classList.remove("hidden");
}

function filaLinksLegales(centrado) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;justify-content:" + (centrado ? "center" : "flex-start") + ";gap:6px 14px;margin:12px 0";
  [["📜 Términos y Condiciones", "Términos y Condiciones", LEGAL_TERMINOS], ["📄 Política de Privacidad", "Política de Privacidad", LEGAL_POLITICA]].forEach(x => {
    const a = document.createElement("a");
    a.href = "javascript:void(0)";
    a.textContent = x[0];
    a.style.cssText = "color:#2563EB;font-size:13px;text-decoration:none";
    a.onclick = e => { e.preventDefault(); verLegal(x[1], x[2], false); };
    row.appendChild(a);
  });
  return row;
}

(function () {
  const lg = document.getElementById("layoutLogin");
  if (lg) lg.appendChild(filaLinksLegales(true));
  const bs = document.getElementById("btnRegPasoSiguiente");
  if (bs && bs.parentNode) bs.parentNode.insertBefore(filaLinksLegales(false), bs);
})();

// ===== CUENTA Y LEGAL (igual que la app) =====
const CORREO_SOPORTE = "pharethd@gmail.com";

function abrirAjustes() {
  const m = crearModalAjustes();
  m.innerHTML = '<div class="dialog-card">' +
    '<h3 style="margin-bottom:4px">Cuenta y legal ⚙️</h3>' +
    '<p class="card-desc" style="margin-bottom:16px">Información legal y de tu cuenta.</p>' +
    '<button class="btn btn-primary" id="ajPol" style="margin-bottom:10px">📄 Política de Privacidad</button>' +
    '<button class="btn btn-primary" id="ajTer" style="margin-bottom:10px">📜 Términos y Condiciones</button>' +
    '<button class="btn btn-blue" id="ajCon" style="margin-bottom:10px">✉️ Contacto y soporte</button>' +
    '<p class="sub-muted" style="margin:8px 0 12px;line-height:1.4">Si eliminas tu cuenta se borran tu perfil, direcciones, historial de pedidos y mensajes del chat. Los pedidos en los registros del local se conservan solo de forma anonimizada.</p>' +
    '<button class="btn btn-danger" id="ajEli" style="margin-bottom:10px">🗑 Eliminar mi cuenta</button>' +
    '<button class="btn btn-muted" id="ajCer">CERRAR</button></div>';
  document.getElementById("ajPol").onclick = () => verLegal("Política de Privacidad", LEGAL_POLITICA, true);
  document.getElementById("ajTer").onclick = () => verLegal("Términos y Condiciones", LEGAL_TERMINOS, true);
  document.getElementById("ajCon").onclick = () => { window.location.href = "mailto:" + CORREO_SOPORTE + "?subject=" + encodeURIComponent("Soporte Llevari"); };
  document.getElementById("ajEli").onclick = confirmarEliminarCuenta;
  document.getElementById("ajCer").onclick = () => m.classList.add("hidden");
  m.classList.remove("hidden");
}

function confirmarEliminarCuenta() {
  if (!miTelefono) { toast("No hay sesión iniciada"); return; }
  if (pedidoActivoId || localStorage.getItem("pedidoActivoId")) {
    toast("Tienes un pedido en curso. Espera a que termine o cancélalo antes de eliminar tu cuenta.");
    return;
  }
  const u = auth.currentUser;
  if (!u || !u.email) { toast("Cierra sesión, vuelve a entrar e intenta de nuevo."); return; }
  const m = crearModalAjustes();
  m.innerHTML = '<div class="dialog-card">' +
    '<h3 style="margin-bottom:8px">¿Eliminar tu cuenta?</h3>' +
    '<p class="card-desc" style="margin-bottom:14px">Se borrarán tu perfil, teléfono, correo, contraseña, direcciones, historial de pedidos y mensajes del chat. Los pedidos en el local quedan anonimizados. Esta acción no se puede deshacer.<br><br>Escribe tu contraseña para confirmar.</p>' +
    '<div class="input-group"><input type="password" id="elPass" placeholder="Tu contraseña" /></div>' +
    '<button class="btn btn-danger" id="elOk" style="margin-bottom:10px">Sí, eliminar</button>' +
    '<button class="btn btn-muted" id="elNo">Cancelar</button></div>';
  document.getElementById("elNo").onclick = abrirAjustes;
  document.getElementById("elOk").onclick = () => {
    const p = document.getElementById("elPass").value;
    if (!p) { toast("Escribe tu contraseña"); return; }
    eliminarCuentaWeb(u, p);
  };
  m.classList.remove("hidden");
}

let eliminandoCuenta = false;
async function eliminarCuentaWeb(u, pass) {
  if (eliminandoCuenta) return;
  eliminandoCuenta = true;
  const tel = miTelefono;
  try {
    try {
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pass));
    } catch (e) { toast("Contraseña incorrecta"); return; }
    toast("Eliminando cuenta...");
    try {
      const snap = await db.collection("clientes").doc(tel).collection("mis_pedidos").get();
      await Promise.all(snap.docs.map(async d => {
        const x = d.data();
        if (x.rId && x.pId) {
          const pr = db.collection("restaurantes").doc(x.rId).collection("pedidos").doc(x.pId);
          const s = await pr.get();
          if (s.exists) {
            const ch = await pr.collection("chat").get();
            await Promise.all(ch.docs.map(c => c.ref.delete()));
            await pr.update({ cliente_nombre: "Cliente eliminado", cliente_telefono: "", cliente_lat: 0, cliente_lon: 0, cliente_direccion_desc: "" });
          }
        }
        await d.ref.delete();
      }));
      await db.collection("clientes").doc(tel).delete();
      const q = await db.collection("clientes").where("telefono", "==", tel).get();
      await Promise.all(q.docs.map(d => d.ref.delete()));
      await u.delete();
    } catch (e) {
      toast("No se pudo eliminar todo. Revisa tu conexión e intenta de nuevo, o escribe a " + CORREO_SOPORTE);
      return;
    }
    crearModalAjustes().classList.add("hidden");
    try { await auth.signOut(); } catch (e) {}
    localStorage.clear();
    miTelefono = ""; miNombre = ""; pedidoActivoId = "";
    mostrarPantallaLogin();
    toast("Cuenta eliminada");
  } finally {
    eliminandoCuenta = false;
  }
}

// ===== PRECIOS POR RUTA REAL (igual que la app) =====
const promesasRuta = {};
const rutasFallidas = {};
const colaRutas = [];
const MAX_RUTAS_SIMULTANEAS = 3;
let rutasEnCurso = 0;
let temporizadorRefrescoKm = null;

function claveRutaKm(rLat, rLon) {
  return rLat.toFixed(4) + "," + rLon.toFixed(4) + ">" + miLat.toFixed(4) + "," + miLon.toFixed(4);
}

function kmGuardado(k) {
  if (cacheKmRuta[k]) return cacheKmRuta[k];
  try {
    const g = parseFloat(localStorage.getItem("kmruta_" + k));
    if (g > 0) { cacheKmRuta[k] = g; return g; }
  } catch (e) {}
  return 0;
}

function kmHaciaSync(rLat, rLon) {
  rLat = Number(rLat); rLon = Number(rLon);
  if (!rLat || !rLon) { rLat = miLat + 0.003; rLon = miLon + 0.003; }
  const k = claveRutaKm(rLat, rLon);
  const g = kmGuardado(k);
  if (g) return g;
  pedirKmRutaWeb(k, rLat, rLon);
  return calcularDistanciaKm(rLat, rLon, miLat, miLon) * 1.3;
}

function pedirKmRutaWeb(k, rLat, rLon) {
  if (kmGuardado(k)) return Promise.resolve(true);
  const f = rutasFallidas[k];
  if (f && Date.now() - f < 300000) return Promise.resolve(false);
  if (promesasRuta[k]) return promesasRuta[k];
  const cLat = miLat, cLon = miLon;
  const p = new Promise(resolve => {
    colaRutas.push(async () => {
      let ok = false;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch("https://router.project-osrm.org/route/v1/driving/" + rLon + "," + rLat + ";" + cLon + "," + cLat + "?overview=false", { signal: ctrl.signal });
        const j = await res.json();
        if (j.code === "Ok" && j.routes && j.routes.length) {
          const km = j.routes[0].distance / 1000;
          cacheKmRuta[k] = km;
          try { localStorage.setItem("kmruta_" + k, String(km)); } catch (e) {}
          ok = true;
        }
      } catch (e) {}
      clearTimeout(to);
      if (!ok) rutasFallidas[k] = Date.now();
      delete promesasRuta[k];
      resolve(ok);
      if (ok) {
        clearTimeout(temporizadorRefrescoKm);
        temporizadorRefrescoKm = setTimeout(refrescarPorRutas, 700);
      }
    });
  });
  promesasRuta[k] = p;
  procesarColaRutas();
  return p;
}

function procesarColaRutas() {
  while (rutasEnCurso < MAX_RUTAS_SIMULTANEAS && colaRutas.length) {
    const t = colaRutas.shift();
    rutasEnCurso++;
    t().finally(() => { rutasEnCurso--; procesarColaRutas(); });
  }
}

async function precargarRutasWeb(lista, maxMs) {
  const ps = [];
  lista.forEach(r => {
    const la = Number(r.lat), lo = Number(r.lon);
    if (!la || !lo) return;
    ps.push(pedirKmRutaWeb(claveRutaKm(la, lo), la, lo));
  });
  if (!ps.length) return;
  await Promise.race([Promise.all(ps), new Promise(r => setTimeout(r, maxMs))]);
}

function refrescarPorRutas() {
  if (!miTelefono) return;
  const modal = document.getElementById("modalPlatoPro");
  if (modal && !modal.classList.contains("hidden")) { try { recalcularModalPlato(); } catch (e) {} return; }
  const sv = document.getElementById("layoutTipoServicio");
  if (sv && !sv.classList.contains("hidden")) { alternarModalidadServicio(modalidadDelivery); return; }
  const app = document.getElementById("layoutAppMain");
  if (!app || app.classList.contains("hidden")) return;
  if (tabActualIndex === 1) dibujarCarrito();
}

const _abrirMenuOrig = abrirMenuRestaurante;
abrirMenuRestaurante = async function (rId, rNom, rLat, rLon, logoUrl) {
  if (rLat && rLon) { try { await precargarRutasWeb([{ lat: rLat, lon: rLon }], 2500); } catch (e) {} }
  return _abrirMenuOrig(rId, rNom, rLat, rLon, logoUrl);
};

// ===== SERVICIO: MINIMO, TARJETA Y LOCAL CERRADO =====
const _alternarOrig = alternarModalidadServicio;
alternarModalidadServicio = function (deliv) {
  if (deliv === false) { toast("💳 Pago con tarjeta: próximamente disponible"); return; }
  _alternarOrig(true);
  const sub = Math.round(precioPlatoTemp);
  const t = calcularTarifa(kmHaciaSync(restauranteLatTemp, restauranteLonTemp), sub);
  const falta = t.minimo > 0 && sub < t.minimo;
  const av = document.getElementById("svAviso");
  if (av) {
    if (falta) { av.textContent = "⚠️ Pedido mínimo para delivery: L. " + t.minimo + " (te faltan L. " + (t.minimo - sub) + ")"; av.classList.remove("hidden"); }
    else av.classList.add("hidden");
  }
  const bc = document.getElementById("svBtnConfirmar");
  if (bc) bc.style.opacity = falta ? "0.55" : "1";
};

(function () {
  const lp = document.getElementById("svLblPickup");
  if (lp) lp.style.opacity = "0.5";
})();

const _confirmarOrig = confirmarCreacionPedido;
confirmarCreacionPedido = async function () {
  if (modalidadDelivery) {
    const sub = Math.round(precioPlatoTemp);
    const t = calcularTarifa(kmHaciaSync(restauranteLatTemp, restauranteLonTemp), sub);
    if (t.minimo > 0 && sub < t.minimo) {
      toast("Pedido mínimo para delivery a tu distancia: L. " + t.minimo + ". Te faltan L. " + (t.minimo - sub) + ".");
      return;
    }
  }
  try {
    const d = await db.collection("restaurantes").doc(restIdSeleccionadoTemp).get();
    if (d.exists && String(d.data().estado || "").toUpperCase() === "CERRADO") {
      toast("🛑 Este local está cerrado ahora. No se envió tu pedido.");
      document.getElementById("layoutTipoServicio").classList.add("hidden");
      document.getElementById("layoutAppMain").classList.remove("hidden");
      cambiarTab(0);
      return;
    }
  } catch (e) {
    toast("No se pudo verificar el local. Revisa tu conexión.");
    return;
  }
  return _confirmarOrig();
};

// ===== SEGUIMIENTO EN VIVO (igual que la app) =====
let segMarkerRest = null, segMarkerCli = null, segMarkerDrv = null;
let segUserMoved = false, segLineKey = "", segLastView = "", segCache = null;
let segMapListo = false, segPend = null, segIntervalo = null, segTextoBase = "";
let segDestino = "", segUltimaRuta = 0;

function numSeg(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  return 0;
}

function ubicacionRepartidorSeg(d) {
  let la = 0, lo = 0;
  ["repartidor_ubicacion", "repartidor_location", "ubicacion_repartidor"].forEach(c => {
    const g = d[c];
    if ((!la || !lo) && g && typeof g.latitude === "number" && typeof g.longitude === "number") { la = g.latitude; lo = g.longitude; }
  });
  if (!la || !lo) {
    la = 0; lo = 0;
    ["repartidor_lat", "repartidor_latitud", "rep_lat"].forEach(c => { if (!la) la = numSeg(d[c]); });
    ["repartidor_lon", "repartidor_lng", "repartidor_longitud", "rep_lon"].forEach(c => { if (!lo) lo = numSeg(d[c]); });
  }
  return [la, lo];
}

function marcadorSeg(emoji, label, lng, lat) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center";
  let lbl = null;
  if (label) {
    lbl = document.createElement("div");
    lbl.textContent = label;
    lbl.style.cssText = "background:#1E1E1E;color:#fff;border:1.5px solid #E91E63;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;margin-bottom:3px;white-space:nowrap";
    el.appendChild(lbl);
  }
  const c = document.createElement("div");
  c.textContent = emoji;
  c.style.cssText = "width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid #E91E63;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 8px rgba(0,0,0,.3)";
  el.appendChild(c);
  const m = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 17] }).setLngLat([lng, lat]).addTo(mapTracking);
  m._lbl = lbl;
  return m;
}

function moverMarcadorSeg(m, lng, lat, ms) {
  const s = m.getLngLat(), t0 = performance.now();
  if (m._raf) cancelAnimationFrame(m._raf);
  const paso = t => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    m.setLngLat([s.lng + (lng - s.lng) * e, s.lat + (lat - s.lat) * e]);
    if (k < 1) m._raf = requestAnimationFrame(paso);
  };
  m._raf = requestAnimationFrame(paso);
}

function setLineaRuta(pts, dashed) {
  if (!segMapListo || !mapTracking) { segPend = [pts, dashed]; return; }
  mapTracking.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: pts } });
  mapTracking.setPaintProperty("route-line", "line-dasharray", dashed ? [0.5, 2] : null);
}

function rutaSeg(aLa, aLo, bLa, bLo) {
  const key = aLa.toFixed(4) + "," + aLo.toFixed(4) + ">" + bLa.toFixed(4) + "," + bLo.toFixed(4);
  if (key === segLineKey) return;
  const dest = bLa.toFixed(4) + "," + bLo.toFixed(4);
  const ahora = Date.now();
  if (dest === segDestino && ahora - segUltimaRuta < 8000) return;
  segDestino = dest; segUltimaRuta = ahora; segLineKey = key;
  fetch("https://router.project-osrm.org/route/v1/driving/" + aLo + "," + aLa + ";" + bLo + "," + bLa + "?overview=full&geometries=geojson")
    .then(r => r.json())
    .then(j => {
      if (key !== segLineKey) return;
      if (!j.routes || !j.routes.length) throw 0;
      setLineaRuta(j.routes[0].geometry.coordinates, false);
    })
    .catch(() => { if (key === segLineKey) setLineaRuta([[aLo, aLa], [bLo, bLa]], true); });
}

function ajustarVistaSeg() {
  if (!segCache || !mapTracking) return;
  const c = segCache;
  const b = new maplibregl.LngLatBounds();
  b.extend([c.cLo, c.cLa]);
  if (c.sD && c.dLa && c.dLo) b.extend([c.dLo, c.dLa]);
  if (!(c.sD && c.toC) && c.rLa && c.rLo) b.extend([c.rLo, c.rLa]);
  const key = b.toString();
  if (key === segLastView) return;
  segLastView = key;
  mapTracking.fitBounds(b, { padding: { top: 250, bottom: 100, left: 50, right: 50 }, maxZoom: 16.5, duration: 700 });
}

function actualizarSeguimientoMapa(rLa, rLo, cLa, cLo, dLa, dLo, dN, sD, toC) {
  if (!mapTracking) return;
  const hasD = !!(sD && dLa && dLo);
  segCache = { rLa: rLa, rLo: rLo, cLa: cLa, cLo: cLo, dLa: dLa, dLo: dLo, sD: hasD, toC: !!toC };
  if (rLa && rLo) { if (!segMarkerRest) segMarkerRest = marcadorSeg("🏪", "", rLo, rLa); else segMarkerRest.setLngLat([rLo, rLa]); }
  if (cLa && cLo) { if (!segMarkerCli) segMarkerCli = marcadorSeg("🏠", "Tú", cLo, cLa); else segMarkerCli.setLngLat([cLo, cLa]); }
  if (hasD) {
    const nm = dN ? dN.trim().split(" ")[0].toUpperCase() : "REPARTIDOR";
    if (!segMarkerDrv) segMarkerDrv = marcadorSeg("🛵", nm, dLo, dLa);
    else {
      if (segMarkerDrv._lbl && segMarkerDrv._lbl.textContent !== nm) segMarkerDrv._lbl.textContent = nm;
      moverMarcadorSeg(segMarkerDrv, dLo, dLa, 1200);
    }
    if (toC) rutaSeg(dLa, dLo, cLa, cLo);
    else if (rLa && rLo) rutaSeg(dLa, dLo, rLa, rLo);
  } else {
    if (segMarkerDrv) { if (segMarkerDrv._raf) cancelAnimationFrame(segMarkerDrv._raf); segMarkerDrv.remove(); segMarkerDrv = null; }
    if (rLa && rLo && cLa && cLo) rutaSeg(rLa, rLo, cLa, cLo);
  }
  if (!segUserMoved) ajustarVistaSeg();
}

function reiniciarMapaSeg() {
  [segMarkerRest, segMarkerCli, segMarkerDrv].forEach(m => { if (m) { if (m._raf) cancelAnimationFrame(m._raf); m.remove(); } });
  segMarkerRest = segMarkerCli = segMarkerDrv = null;
  segUserMoved = false; segLineKey = ""; segLastView = ""; segCache = null; segPend = null; segDestino = ""; segUltimaRuta = 0;
  if (segMapListo && mapTracking) {
    try { mapTracking.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] } }); } catch (e) {}
  }
}

function crearMapaSeguimiento() {
  if (mapTracking) { mapTracking.resize(); return; }
  mapTracking = new maplibregl.Map({ container: "mapTracking", style: "https://tiles.openfreemap.org/styles/positron", center: [miLon, miLat], zoom: 14.5, attributionControl: false });
  mapTracking.touchZoomRotate.enableRotation();
  mapTracking.on("dragstart", () => { segUserMoved = true; });
  mapTracking.on("zoomstart", e => { if (e.originalEvent) segUserMoved = true; });
  mapTracking.on("rotatestart", () => { segUserMoved = true; });
  mapTracking.on("load", () => {
    mapTracking.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } } });
    mapTracking.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.95 } });
    mapTracking.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#7C3AED", "line-width": 6 } });
    segMapListo = true;
    if (segPend) { const p = segPend; segPend = null; setLineaRuta(p[0], p[1]); }
  });
}

function botonRecentrarSeg() {
  if (document.getElementById("btnRecentrarSeg")) return;
  const b = document.createElement("button");
  b.id = "btnRecentrarSeg";
  b.className = "map-fab-btn";
  b.textContent = "🎯";
  b.style.cssText = "bottom:92px;right:16px";
  b.onclick = () => { segUserMoved = false; segLastView = ""; ajustarVistaSeg(); };
  document.getElementById("layoutSeguimiento").appendChild(b);
}

function detenerTimerSeg() {
  if (segIntervalo) { clearInterval(segIntervalo); segIntervalo = null; }
}

function iniciarTimerSeg(segundos, textoBase) {
  segTextoBase = textoBase;
  const clave = "timer_fin_" + pedidoActivoId;
  let fin = parseInt(localStorage.getItem(clave)) || 0;
  if (!fin) { fin = Date.now() + segundos * 1000; try { localStorage.setItem(clave, String(fin)); } catch (e) {} }
  detenerTimerSeg();
  const f = s => String(Math.floor(Math.abs(s) / 60)).padStart(2, "0") + ":" + String(Math.abs(s) % 60).padStart(2, "0");
  const pintar = () => {
    const el = document.getElementById("tvInfoRepartidor");
    if (!el) return;
    const diff = Math.round((fin - Date.now()) / 1000);
    el.textContent = segTextoBase + (diff > 0 ? " | ⏱ " + f(diff) : " | ⚠️ Demorado (+" + f(diff) + ")");
  };
  pintar();
  segIntervalo = setInterval(pintar, 1000);
}

function abrirPantallaSeguimientoEnVivo() {
  if (!pedidoActivoId || !restIdSeleccionadoTemp) { toast("No hay un pedido activo"); return; }
  document.getElementById("layoutAppMain").classList.add("hidden");
  document.getElementById("layoutSeguimiento").classList.remove("hidden");
  document.getElementById("tvNombreRestauranteSeguimiento").textContent = rNombreTemp;
  document.getElementById("tvEstadoSeguimiento").textContent = "Buscando ruta";
  document.getElementById("tvInfoRepartidor").textContent = "Espera un momento";
  const cobEl = document.getElementById("tvCobroSeguimiento");
  if (cobEl) { cobEl.textContent = ""; cobEl.style.whiteSpace = "pre-line"; }
  const chat = document.getElementById("btnAbrirChat");
  if (chat) chat.classList.add("hidden");
  detenerTimerSeg();
  crearMapaSeguimiento();
  reiniciarMapaSeg();
  botonRecentrarSeg();
  setTimeout(() => { if (mapTracking) mapTracking.resize(); }, 150);
  if (seguimientoListener) seguimientoListener();
  const idPed = pedidoActivoId;
  seguimientoListener = db.collection("restaurantes").doc(restIdSeleccionadoTemp).collection("pedidos").doc(idPed).onSnapshot(doc => {
    if (!doc.exists || idPed !== pedidoActivoId) return;
    const d = doc.data();
    const es = String(d.estado || d.status || d.estatus || "NUEVO").toUpperCase();
    if (ESTADOS_FINALES.includes(es)) {
      localStorage.removeItem("pedidoActivoId");
      localStorage.removeItem("restIdActivo");
      localStorage.removeItem("rNombreActivo");
      localStorage.removeItem("timer_fin_" + idPed);
      pedidoActivoId = "";
      toast(es.indexOf("CANCEL") === 0 ? "❌ Pedido cancelado" : "🎉 ¡Pedido finalizado!");
      cerrarPantallaSeguimiento();
      return;
    }
    const sb = numSeg(d.subtotal), au = numSeg(d.aumento), en = numSeg(d.costo_envio), to = numSeg(d.total);
    const pick = String(d.tipo_servicio || "").toUpperCase() === "PICKUP";
    if (cobEl) {
      cobEl.textContent = pick
        ? "💵 Pagas en el local: L. " + to.toFixed(2)
        : "💵 Pagas al repartidor: L. " + to.toFixed(2) + "\n(productos L. " + (sb + au).toFixed(2) + " + envío L. " + en.toFixed(2) + ")";
    }
    const rN = String(d.repartidor_nombre || "").trim();
    const asignado = rN !== "" && !/^buscando/i.test(rN);
    const ub = ubicacionRepartidorSeg(d);
    const rLa = ub[0], rLo = ub[1];
    const tieneGps = !!(rLa && rLo);
    const enNuevo = es === "NUEVO" || es === "PENDIENTE";
    const haciaCliente = es === "EN_CAMINO" || es === "DESPACHADO";
    const restLa = numSeg(d.restaurante_lat) || restauranteLatTemp, restLo = numSeg(d.restaurante_lon) || restauranteLonTemp;
    const cliLa = numSeg(d.cliente_lat) || miLat, cliLo = numSeg(d.cliente_lon) || miLon;
    actualizarSeguimientoMapa(restLa, restLo, cliLa, cliLo, rLa, rLo, rN, asignado && tieneGps && !enNuevo, haciaCliente);
    const stEl = document.getElementById("tvEstadoSeguimiento"), infEl = document.getElementById("tvInfoRepartidor");
    const dKm = tieneGps ? calcularDistanciaKm(rLa, rLo, cliLa, cliLo) : calcularDistanciaKm(restLa, restLo, cliLa, cliLo);
    if (enNuevo) {
      stEl.textContent = "Enviado al local"; stEl.style.color = "#E11D48";
      infEl.textContent = "Esperando confirmación...";
      detenerTimerSeg();
    } else if (es === "ACEPTADO") {
      stEl.textContent = "Preparando tu pedido"; stEl.style.color = "#D97706";
      infEl.textContent = "Cocinando 👨‍🍳 (El repartidor llegará pronto)";
      detenerTimerSeg();
    } else if (asignado && !haciaCliente) {
      stEl.textContent = "Repartidor asignado"; stEl.style.color = "#2563EB";
      infEl.textContent = rN + " va en camino al local." + (tieneGps ? "" : " (📡 sin señal GPS)");
      detenerTimerSeg();
    } else if (haciaCliente) {
      stEl.textContent = "🛵 En camino"; stEl.style.color = "#059669";
      const mE = Math.max(2, Math.round(dKm * 3 + 2));
      iniciarTimerSeg(mE * 60, tieneGps ? rN : rN + " • 📡 sin señal GPS");
    } else {
      stEl.textContent = "Pedido en proceso"; stEl.style.color = "#7C3AED";
      infEl.textContent = "Estado: " + es;
      detenerTimerSeg();
    }
  }, () => {});
}

function cerrarPantallaSeguimiento() {
  if (seguimientoListener) { seguimientoListener(); seguimientoListener = null; }
  detenerTimerSeg();
  document.getElementById("layoutSeguimiento").classList.add("hidden");
  document.getElementById("layoutAppMain").classList.remove("hidden");
  cambiarTab(0);
}

// ===== MI PERFIL =====
let perfilDirs = [];
let perfilEditIdx = -1;
let perfilDatos = {};

function inicialPerfil(n) {
  const c = String(n || "").trim().charAt(0);
  return c ? c.toUpperCase() : "👤";
}

function esActivaDir(x) {
  return !!x && Math.abs(x.lat - miLat) < 0.0001 && Math.abs(x.lon - miLon) < 0.0001;
}

const _abrirAjustesBase = abrirAjustes;
abrirAjustes = function () {
  _abrirAjustesBase();
  const card = document.querySelector("#modalAjustes .dialog-card");
  if (!card || document.getElementById("ajPerfil")) return;
  const b = document.createElement("button");
  b.id = "ajPerfil";
  b.className = "btn btn-warning";
  b.style.marginBottom = "10px";
  b.textContent = "👤 Mi perfil";
  b.onclick = abrirPerfil;
  card.insertBefore(b, card.querySelector("button"));
};
(function () {
  const bc = document.getElementById("btnHeaderConfig");
  if (bc) bc.onclick = abrirAjustes;
})();

async function abrirPerfil() {
  if (!miTelefono) { toast("No hay sesión iniciada"); return; }
  const m = crearModalAjustes();
  m.innerHTML = '<div class="dialog-card perfil-card"><div class="perfil-load">Cargando tu perfil...</div></div>';
  m.classList.remove("hidden");
  let d = {};
  try {
    const doc = await db.collection("clientes").doc(miTelefono).get();
    if (doc.exists) d = doc.data();
  } catch (e) {
    toast("No se pudo cargar tu perfil. Revisa tu conexión.");
    abrirAjustes();
    return;
  }
  perfilDirs = Array.isArray(d.direcciones) ? d.direcciones.slice() : [];
  perfilEditIdx = -1;
  pintarPerfil(d);
}

function pintarPerfil(d) {
  perfilDatos = d;
  const m = crearModalAjustes();
  const nombre = d.nombre || miNombre || "";
  const correo = d.correo || (auth.currentUser && auth.currentUser.email) || "—";
  const tel = d.telefono || miTelefono;
  const ciu = d.ciudad || miCiudad;
  const ciudades = ["Choluteca", "Tegucigalpa", "San Pedro Sula", "Comayagua"];
  if (ciudades.indexOf(ciu) < 0) ciudades.push(ciu);
  const idi = d.idioma || "Español";
  const opt = (arr, sel) => arr.map(t => '<option value="' + esc(t) + '"' + (t === sel ? " selected" : "") + ">" + esc(t) + "</option>").join("");
  m.innerHTML = '<div class="dialog-card perfil-card">' +
    '<div class="perfil-head"><div class="perfil-avatar" id="pfAvatar">' + esc(inicialPerfil(nombre)) + '</div>' +
    '<div class="perfil-nombre" id="pfHeadNombre">' + esc(nombre || "Mi perfil") + '</div>' +
    '<div class="perfil-correo">' + esc(correo) + '</div></div>' +
    '<div class="perfil-body">' +
    '<div class="perfil-sec">📋 Datos personales</div>' +
    '<label class="perfil-lbl">Nombre completo</label>' +
    '<input type="text" id="pfNombre" class="perfil-inp" value="' + esc(nombre) + '" />' +
    '<label class="perfil-lbl">Correo electrónico</label>' +
    '<div class="perfil-lock"><span>✉️ ' + esc(correo) + '</span><span>🔒</span></div>' +
    '<label class="perfil-lbl">Teléfono</label>' +
    '<div class="perfil-lock"><span>📱 ' + esc(tel) + '</span><span>🔒</span></div>' +
    '<label class="perfil-lbl">Ciudad</label>' +
    '<select id="pfCiudad" class="perfil-inp">' + opt(ciudades, ciu) + '</select>' +
    '<label class="perfil-lbl">Idioma de preferencia</label>' +
    '<select id="pfIdioma" class="perfil-inp">' + opt(["Español", "English"], idi) + '</select>' +
    '<button class="btn btn-primary" id="pfGuardar" style="margin-bottom:20px">GUARDAR CAMBIOS</button>' +
    '<div class="perfil-sec">📍 Mis ubicaciones</div>' +
    '<p class="sub-muted" style="margin:-6px 0 10px">Toca una para usarla en tus pedidos.</p>' +
    '<div id="pfDirs"></div>' +
    '<button class="btn btn-warning" id="pfNuevaDir" style="margin:4px 0 10px">+ Agregar ubicación</button>' +
    '<button class="btn btn-muted" id="pfVolver">❮ Volver</button>' +
    '</div></div>';
  document.getElementById("pfGuardar").onclick = guardarDatosPerfil;
  document.getElementById("pfVolver").onclick = abrirAjustes;
  document.getElementById("pfNuevaDir").onclick = () => {
    crearModalAjustes().classList.add("hidden");
    agregandoDesdeApp = true;
    tempMapaLat = miLat; tempMapaLon = miLon;
    abrirMapaNuevaDireccion();
  };
  pintarDirsPerfil();
}

function pintarDirsPerfil() {
  const cont = document.getElementById("pfDirs");
  if (!cont) return;
  cont.innerHTML = "";
  const validas = perfilDirs.map((x, i) => ({ x, i })).filter(o => o.x && o.x.lat && o.x.lon);
  if (!validas.length) {
    cont.innerHTML = '<p class="sub-muted" style="margin-bottom:10px">Aún no tienes ubicaciones guardadas.</p>';
    return;
  }
  validas.forEach(({ x, i }) => {
    const activa = esActivaDir(x);
    const et = x.etiqueta || "Otro";
    const ico = et === "Casa" ? "🏠" : et === "Trabajo" ? "💼" : "📍";
    const row = document.createElement("div");
    row.className = "perfil-dir" + (activa ? " activa" : "");
    if (i === perfilEditIdx) {
      row.style.cursor = "default";
      row.innerHTML = '<div class="perfil-dir-edit">' +
        '<select id="pfEdEt" class="perfil-inp">' + ["Casa", "Trabajo", "Otro"].map(t => "<option" + (t === et ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" +
        '<input type="text" id="pfEdDesc" class="perfil-inp" placeholder="Descripción (Ej. Casa verde, portón negro)" value="' + esc(x.desc || "") + '" />' +
        '<div class="perfil-dir-btns"><button class="btn btn-success" id="pfEdOk">Guardar</button><button class="btn btn-muted" id="pfEdNo">Cancelar</button></div></div>';
      cont.appendChild(row);
      row.querySelector("#pfEdOk").onclick = () => guardarEdicionDir(i);
      row.querySelector("#pfEdNo").onclick = () => { perfilEditIdx = -1; pintarDirsPerfil(); };
      return;
    }
    row.innerHTML = '<div class="perfil-dir-ico">' + ico + '</div>' +
      '<div class="perfil-dir-info"><div class="perfil-dir-top"><b>' + esc(et) + '</b>' + (activa ? '<span class="perfil-badge">Activa</span>' : "") + '</div>' +
      "<small>" + esc(x.desc || "Sin descripción") + "</small></div>" +
      '<button class="perfil-mini" data-a="ed">✏️</button><button class="perfil-mini" data-a="del">🗑</button>';
    row.onclick = () => usarDirPerfil(i);
    row.querySelector('[data-a="ed"]').onclick = e => { e.stopPropagation(); perfilEditIdx = i; pintarDirsPerfil(); };
    row.querySelector('[data-a="del"]').onclick = e => { e.stopPropagation(); borrarDirPerfil(i); };
    cont.appendChild(row);
  });
}

function usarDirPerfil(i) {
  const x = perfilDirs[i];
  if (!x) return;
  seleccionarUbicacion(x.lat, x.lon, x.etiqueta, x.desc, i);
  pintarDirsPerfil();
}

async function guardarEdicionDir(i) {
  const et = document.getElementById("pfEdEt").value;
  const desc = document.getElementById("pfEdDesc").value.trim();
  const eraActiva = esActivaDir(perfilDirs[i]);
  const nuevas = perfilDirs.map((x, k) => k === i ? Object.assign({}, x, { etiqueta: et, desc: desc }) : x);
  try {
    await db.collection("clientes").doc(miTelefono).update({ direcciones: nuevas });
  } catch (e) { toast("No se pudo guardar: " + e.message); return; }
  perfilDirs = nuevas;
  perfilEditIdx = -1;
  if (eraActiva) {
    miDireccionDesc = desc || et;
    localStorage.setItem("dir_desc", miDireccionDesc);
    db.collection("clientes").doc(miTelefono).update({ direccion_desc: miDireccionDesc }).catch(() => {});
    actualizarCabecera();
  }
  pintarDirsPerfil();
  toast("✅ Ubicación actualizada");
}

async function borrarDirPerfil(i) {
  const validas = perfilDirs.filter(x => x && x.lat && x.lon);
  if (validas.length <= 1) { toast("Debes tener al menos una ubicación guardada"); return; }
  const x = perfilDirs[i];
  if (!confirm("¿Eliminar la ubicación \"" + (x.etiqueta || "Otro") + (x.desc ? " • " + x.desc : "") + "\"?")) return;
  const eraActiva = esActivaDir(x);
  const nuevas = perfilDirs.filter((_, k) => k !== i);
  const payload = { direcciones: nuevas };
  if (!eraActiva) {
    const ai = nuevas.findIndex(z => esActivaDir(z));
    if (ai >= 0) payload.indice_dir_activa = ai;
  }
  try {
    await db.collection("clientes").doc(miTelefono).update(payload);
  } catch (e) { toast("No se pudo eliminar: " + e.message); return; }
  perfilDirs = nuevas;
  perfilEditIdx = -1;
  if (eraActiva) {
    const o = nuevas.find(z => z && z.lat && z.lon);
    if (o) seleccionarUbicacion(o.lat, o.lon, o.etiqueta, o.desc, nuevas.indexOf(o));
  }
  pintarDirsPerfil();
  toast("🗑 Ubicación eliminada");
}

async function guardarDatosPerfil() {
  const n = document.getElementById("pfNombre").value.trim().replace(/\s+/g, " ");
  const c = document.getElementById("pfCiudad").value;
  const idi = document.getElementById("pfIdioma").value;
  if (n.length < 2) { toast("Escribe tu nombre completo"); return; }
  const btn = document.getElementById("pfGuardar");
  btn.disabled = true;
  try {
    await db.collection("clientes").doc(miTelefono).update({ nombre: n, ciudad: c, idioma: idi });
  } catch (e) {
    toast("No se pudo guardar: " + e.message);
    btn.disabled = false;
    return;
  }
  const cambioCiudad = c !== miCiudad;
  miNombre = n; miCiudad = c;
  localStorage.setItem("nombre", n);
  localStorage.setItem("ciudad", c);
  actualizarCabecera();
  perfilDatos = Object.assign({}, perfilDatos, { nombre: n, ciudad: c, idioma: idi });
  const hn = document.getElementById("pfHeadNombre"), av = document.getElementById("pfAvatar");
  if (hn) hn.textContent = n;
  if (av) av.textContent = inicialPerfil(n);
  btn.disabled = false;
  toast("✅ Perfil actualizado");
  if (cambioCiudad) cambiarTab(tabActualIndex);
}


// ===== CARGA RAPIDA =====
let ultimaRevalidacionRest = 0;
let ultimoRefrescoRest = 0;

function firmaRest(snap) {
  return snap.docs.map(d => {
    const x = d.data() || {};
    return [d.id, x.nombre, x.estado, x.latitud, x.longitud, String(x.logoUrl || "").length].join(":");
  }).sort().join("|");
}

async function restaurantesRapido() {
  colaProd.length = 0;
  const col = db.collection("restaurantes");
  let cache = null;
  try {
    const c = await col.get({ source: "cache" });
    if (!c.empty) cache = c;
  } catch (e) {}
  if (!cache) {
    ultimaRevalidacionRest = Date.now();
    return await col.get();
  }
  if (Date.now() - ultimaRevalidacionRest < 60000) return cache;
  ultimaRevalidacionRest = Date.now();
  col.get().then(srv => {
    if (firmaRest(srv) === firmaRest(cache)) return;
    if (Date.now() - ultimoRefrescoRest < 60000) return;
    ultimoRefrescoRest = Date.now();
    const cont = document.getElementById("contRestaurantes");
    const q = document.getElementById("etBuscador");
    if (tabActualIndex === 0 && cont && cont.querySelector(".hero-slider-wrap") && !(q && q.value.trim())) cargarInicioPrincipal();
  }).catch(() => {});
  return cache;
}

const colaProd = [];
let prodEnCurso = 0;

function colaProductos(fn) {
  return new Promise((resolve, reject) => {
    colaProd.push(() => {
      fn().then(resolve, reject).finally(() => { prodEnCurso--; siguienteProd(); });
    });
    siguienteProd();
  });
}

function siguienteProd() {
  while (prodEnCurso < 2 && colaProd.length) {
    prodEnCurso++;
    colaProd.shift()();
  }
}

function conMapLibre(fn) {
  return function () {
    if (window.maplibregl) return fn.apply(this, arguments);
    toast("Cargando mapa...");
    const self = this, args = arguments;
    document.addEventListener("maplibre-listo", () => fn.apply(self, args), { once: true });
  };
}
abrirPantallaSeguimientoEnVivo = conMapLibre(abrirPantallaSeguimientoEnVivo);
abrirMapaNuevaDireccion = conMapLibre(abrirMapaNuevaDireccion);

// ===== TARIFAS EN VIVO (igual que la app) =====
function firmaTarifasWeb() {
  return [cfgTopePct, cfgEnvioMax, cfgGanancia, cfgExtraPct, cfgMinimoLargo, cfgKmMinimo, cfgPagoKm.join(",")].join("|");
}

function aplicarTarifasWeb(d) {
  const n = (v, def) => typeof v === "number" ? v : def;
  cfgTopePct = n(d.tope_aumento_pct, cfgTopePct);
  cfgEnvioMax = n(d.envio_visible_max, cfgEnvioMax);
  cfgGanancia = n(d.ganancia_pedido, cfgGanancia);
  cfgExtraPct = n(d.ganancia_extra_pct, cfgExtraPct);
  cfgMinimoLargo = n(d.pedido_minimo, cfgMinimoLargo);
  cfgKmMinimo = n(d.km_pedido_minimo, cfgKmMinimo);
  if (Array.isArray(d.pago_km) && d.pago_km.length === KM_MAX - KM_MIN + 1 && d.pago_km.every(x => typeof x === "number")) cfgPagoKm = d.pago_km;
}

function refrescarPorTarifas() {
  if (!miTelefono) return;
  const modal = document.getElementById("modalPlatoPro");
  if (modal && !modal.classList.contains("hidden")) { try { recalcularModalPlato(); } catch (e) {} return; }
  const sv = document.getElementById("layoutTipoServicio");
  if (sv && !sv.classList.contains("hidden")) { alternarModalidadServicio(true); return; }
  const app = document.getElementById("layoutAppMain");
  if (!app || app.classList.contains("hidden")) return;
  if (tabActualIndex === 1) { dibujarCarrito(); return; }
  if (tabActualIndex !== 0) return;
  const q = document.getElementById("etBuscador");
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  if (q && q.value.trim()) { filtrarResultados(q.value.trim().toLowerCase()); return; }
  if (document.getElementById("listMenuPlatos")) { abrirMenuRestaurante(restIdSeleccionadoTemp, rNombreTemp, restauranteLatTemp, restauranteLonTemp, ""); return; }
  if (document.getElementById("gridTodosLocales")) { verTodosLosRestaurantes(); return; }
  if (cont.querySelector(".hero-slider-wrap")) cargarInicioPrincipal();
}

function escucharTarifas() {
  let timer = null;
  db.collection("configuracion").doc("tarifas").onSnapshot(doc => {
    if (!doc.exists) return;
    const antes = firmaTarifasWeb();
    aplicarTarifasWeb(doc.data());
    if (antes !== firmaTarifasWeb()) {
      clearTimeout(timer);
      timer = setTimeout(refrescarPorTarifas, 400);
    }
  });
}

const _confirmarTarifas = confirmarCreacionPedido;
confirmarCreacionPedido = async function () {
  const total = () => {
    const sub = Math.round(precioPlatoTemp);
    const t = calcularTarifa(kmHaciaSync(restauranteLatTemp, restauranteLonTemp), sub);
    return modalidadDelivery ? sub + t.aumento + t.envio : sub;
  };
  const antes = total();
  try {
    const d = await db.collection("configuracion").doc("tarifas").get({ source: "server" });
    if (d.exists) aplicarTarifasWeb(d.data());
  } catch (e) {
    toast("No se pudieron verificar las tarifas. Revisa tu conexión.");
    return;
  }
  if (total() !== antes) {
    toast("Las tarifas cambiaron. Revisa el nuevo total y confirma de nuevo.");
    alternarModalidadServicio(true);
    return;
  }
  return _confirmarTarifas();
};

// ===== MODAL DE PLATO: OPCIONES Y RECOMENDACIONES (igual que la app) =====
let currentDishExtra = 0;
let dishToken = 0;

function parsearOpciones(opStr) {
  const grupos = [];
  if (!opStr || !String(opStr).trim()) return grupos;
  String(opStr).split("/").forEach(g => {
    const pt = g.split(":");
    if (pt.length < 2) return;
    const nombre = pt[0].trim();
    let hayCosto = false;
    const ops = [];
    pt[1].split(",").forEach(o => {
      let nO = o.trim();
      if (!nO) return;
      let precio = 0;
      if (nO.indexOf("+") >= 0) {
        const se = nO.split("+");
        nO = se[0].trim();
        const v = parseFloat(String(se[1]).replace(/[^0-9.]/g, ""));
        if (!isNaN(v)) { if (v > 0) hayCosto = true; precio = v; }
      }
      ops.push({ nombre: nO, precio: precio });
    });
    if (hayCosto) ops.unshift({ nombre: "No gracias", precio: 0 });
    if (ops.length) grupos.push({ nombre: nombre, ops: ops });
  });
  return grupos;
}

function actualizarExtrasPlato() {
  let ex = 0;
  document.querySelectorAll("#modalDishOptions .option-row.sel").forEach(r => { ex += parseFloat(r.getAttribute("data-extra")) || 0; });
  currentDishExtra = ex;
}

function opcionesElegidasTexto() {
  const partes = [];
  document.querySelectorAll("#modalDishOptions .option-group-card").forEach(g => {
    const sel = g.querySelector(".option-row.sel");
    if (!sel) return;
    const nom = sel.getAttribute("data-nom") || "";
    if (nom.toLowerCase() !== "no gracias") partes.push(g.getAttribute("data-grupo") + ": " + nom);
  });
  return partes.join(" / ");
}

function recalcularModalPlato() {
  const u = currentDishBasePrice + currentDishExtra;
  const sub = Math.round(u * currentDishQty);
  const t = calcularTarifa(kmHaciaSync(currentDishData.rLat, currentDishData.rLon), sub);
  const totProd = sub + t.aumento;
  const total = totProd + t.envio;
  document.getElementById("modalDishPrice").textContent = "L. " + (totProd / currentDishQty).toFixed(2) + (currentDishQty > 1 ? " c/u" : "");
  document.getElementById("modalDishSubtotal").textContent = "L. " + totProd;
  document.getElementById("btnDishOrderNow").textContent = "Pedir • L. " + total;
}

function refrescarCantidadPlato() {
  document.getElementById("txtDishQty").textContent = currentDishQty;
  recalcularModalPlato();
}

function mostrarPlatoPro(rId, rNom, plato, desc, baseP, imgD, opStr, rLat, rLon) {
  dishToken++;
  const token = dishToken;
  currentDishQty = 1;
  currentDishBasePrice = Number(baseP) || 0;
  currentDishExtra = 0;
  currentDishData = { rId: rId, rNom: rNom, plato: plato, desc: desc, baseP: currentDishBasePrice, imgD: imgD, opStr: opStr, rLat: rLat, rLon: rLon };

  document.getElementById("modalDishTitle").textContent = plato;
  document.getElementById("modalDishDesc").textContent = desc || "";
  document.getElementById("modalHeroRestChip").textContent = "🏪 " + rNom;
  document.getElementById("txtDishQty").textContent = "1";

  const heroImg = document.getElementById("modalHeroImg");
  heroImg.onerror = () => heroImg.classList.add("hidden");
  if (imgD) { heroImg.src = imgD; heroImg.classList.remove("hidden"); }
  else { heroImg.removeAttribute("src"); heroImg.classList.add("hidden"); }

  const cont = document.getElementById("modalDishOptions");
  cont.innerHTML = "";
  parsearOpciones(opStr).forEach(g => {
    const card = document.createElement("div");
    card.className = "option-group-card";
    card.setAttribute("data-grupo", g.nombre);
    const head = document.createElement("div");
    head.className = "opt-head";
    const h = document.createElement("h4");
    h.textContent = g.nombre;
    const bd = document.createElement("span");
    bd.className = "opt-badge";
    bd.textContent = "Obligatorio";
    head.appendChild(h); head.appendChild(bd);
    card.appendChild(head);
    const sb = document.createElement("p");
    sb.className = "opt-sub";
    sb.textContent = "Selecciona una opción";
    card.appendChild(sb);
    g.ops.forEach((o, i) => {
      const row = document.createElement("div");
      row.className = "option-row" + (i === 0 ? " sel" : "");
      row.setAttribute("data-extra", String(o.precio));
      row.setAttribute("data-nom", o.nombre);
      const rd = document.createElement("span");
      rd.className = "opt-radio";
      const nm = document.createElement("span");
      nm.className = "opt-name";
      nm.textContent = o.nombre;
      row.appendChild(rd); row.appendChild(nm);
      if (o.precio > 0) {
        const pr = document.createElement("span");
        pr.className = "opt-price";
        pr.textContent = "+ L. " + o.precio.toFixed(2);
        row.appendChild(pr);
      }
      row.onclick = () => {
        card.querySelectorAll(".option-row").forEach(x => x.classList.remove("sel"));
        row.classList.add("sel");
        actualizarExtrasPlato();
        recalcularModalPlato();
      };
      card.appendChild(row);
    });
    cont.appendChild(card);
  });

  document.getElementById("btnDishMinus").onclick = () => { if (currentDishQty > 1) { currentDishQty--; refrescarCantidadPlato(); } };
  document.getElementById("btnDishPlus").onclick = () => { currentDishQty++; refrescarCantidadPlato(); };

  document.getElementById("btnDishAddToCart").onclick = () => {
    const u = (currentDishBasePrice + currentDishExtra) * currentDishQty;
    agregarAlCarrito(rId, rNom, currentDishQty + "x " + plato, u, opcionesElegidasTexto(), imgD, rLat, rLon);
    document.getElementById("modalPlatoPro").classList.add("hidden");
  };

  document.getElementById("btnDishOrderNow").onclick = () => {
    const ops = opcionesElegidasTexto();
    carritoRestPendiente = null;
    restIdSeleccionadoTemp = rId;
    rNombreTemp = rNom;
    imgPlatoTemp = imgD;
    platoTemp = currentDishQty + "x " + plato + (ops ? " (" + ops + ")" : "");
    precioPlatoTemp = (currentDishBasePrice + currentDishExtra) * currentDishQty;
    restauranteLatTemp = (rLat && rLon) ? rLat : (miLat + 0.003);
    restauranteLonTemp = (rLat && rLon) ? rLon : (miLon + 0.003);
    document.getElementById("modalPlatoPro").classList.add("hidden");
    abrirPantallaTipoServicio();
  };

  recalcularModalPlato();
  document.getElementById("modalPlatoPro").classList.remove("hidden");
  document.getElementById("modalPlatoScroll").scrollTop = 0;
  cargarSugerenciasPlato(token);
}

async function cargarSugerenciasPlato(token) {
  const d = currentDishData;
  let items = todosLosProductosCache.filter(p => p.rId === d.rId).map(p => ({ pNom: p.pNom, pDesc: p.pDesc || "", pPrec: Number(p.pPrec) || 0, pImg: p.pImg || "", pOps: p.pOps || "" }));
  if (items.length < 2) {
    try {
      const snap = await db.collection("restaurantes").doc(d.rId).collection("productos").get();
      items = [];
      snap.forEach(doc => {
        const x = doc.data();
        items.push({ pNom: x.nombre, pDesc: x.descripcion || "", pPrec: Number(x.precio) || 0, pImg: formatearImagen(x.imagenUrl), pOps: x.opciones || "" });
      });
    } catch (e) { return; }
  }
  if (token !== dishToken) return;
  const vistos = {};
  const lista = items.filter(p => {
    if (!p.pNom || p.pNom === d.plato || p.pPrec <= 0 || vistos[p.pNom]) return false;
    vistos[p.pNom] = true;
    return true;
  }).slice(0, 4);
  if (!lista.length) return;
  const cont = document.getElementById("modalDishOptions");
  if (!cont || document.getElementById("dishSugs")) return;
  const wrap = document.createElement("div");
  wrap.id = "dishSugs";
  const tt = document.createElement("div");
  tt.className = "sug-title";
  tt.textContent = "Otras personas lo combinaron con";
  wrap.appendChild(tt);
  lista.forEach(s => {
    const row = document.createElement("div");
    row.className = "sug-row";
    const th = document.createElement("div");
    th.className = "sug-thumb";
    th.textContent = "🍽️";
    if (s.pImg) {
      const im = document.createElement("img");
      im.onerror = () => im.remove();
      im.src = s.pImg;
      th.appendChild(im);
    }
    const info = document.createElement("div");
    info.className = "sug-info";
    const nb = document.createElement("b");
    nb.textContent = s.pNom;
    const pv = document.createElement("span");
    pv.textContent = "L. " + Math.round(precioVisible(s.pPrec, d.rLat, d.rLon));
    info.appendChild(nb); info.appendChild(pv);
    const bt = document.createElement("button");
    bt.className = "sug-plus";
    bt.textContent = "+";
    row.appendChild(th); row.appendChild(info); row.appendChild(bt);
    row.onclick = () => mostrarPlatoPro(d.rId, d.rNom, s.pNom, s.pDesc, s.pPrec, s.pImg, s.pOps, d.rLat, d.rLon);
    wrap.appendChild(row);
  });
  cont.appendChild(wrap);
}

// ===== SALIR DENTRO DE AJUSTES =====
const _abrirAjustesSinSalir = abrirAjustes;
abrirAjustes = function () {
  _abrirAjustesSinSalir();
  const card = document.querySelector("#modalAjustes .dialog-card");
  if (!card || document.getElementById("ajSalir")) return;
  const b = document.createElement("button");
  b.id = "ajSalir";
  b.className = "btn btn-blue";
  b.style.marginBottom = "10px";
  b.textContent = "🚪 Cerrar sesión";
  b.onclick = () => {
    const m = document.getElementById("modalAjustes");
    if (m) m.classList.add("hidden");
    auth.signOut();
    localStorage.clear();
    miTelefono = "";
    mostrarPantallaLogin();
  };
  card.insertBefore(b, document.getElementById("ajCer"));
};
(function () {
  const bc = document.getElementById("btnHeaderConfig");
  if (bc) bc.onclick = abrirAjustes;
})();

// ===== VIDA JS 3: toque con onda y rebote =====
(function () {
  const ondas = new Map();
  function clicable(el) {
    let t = null;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) return null;
      if (n.tagName === "BUTTON" || n.tagName === "A") { t = n; break; }
      if (getComputedStyle(n).cursor === "pointer") t = n;
      else if (t) break;
    }
    return t;
  }
  document.addEventListener("pointerdown", e => {
    if (!clicable(e.target)) return;
    const r = document.createElement("div");
    r.className = "v-onda";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    ondas.set(e.pointerId, r);
    r.addEventListener("animationend", () => r.remove());
  }, true);
  document.addEventListener("pointercancel", e => {
    const r = ondas.get(e.pointerId);
    if (r) { r.remove(); ondas.delete(e.pointerId); }
  }, true);
  document.addEventListener("pointerup", e => ondas.delete(e.pointerId), true);
  document.addEventListener("click", e => {
    const t = clicable(e.target);
    if (!t) return;
    t.classList.remove("v-tocado");
    void t.offsetWidth;
    t.classList.add("v-tocado");
    setTimeout(() => t.classList.remove("v-tocado"), 420);
  }, true);
  document.addEventListener("contextmenu", e => {
    if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault();
  });
})();

// ===== BUSCADOR NUEVO: inicio (locales + platos) y dentro de local (solo sus platos) =====
const _vNorm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const _vCoincide = (texto, palabras) => { const t = _vNorm(texto); return palabras.every(w => t.includes(w)); };
const _vPalabras = q => _vNorm(q).split(/\s+/).filter(Boolean);
let _vLocales = null, _vLocalesT = 0, _vMenuId = null, _vBusqSeq = 0;
const _vMenuItems = {};
const _vSugerencias = ["Buscar locales y platos…", "🍔 Hamburguesas, 🍕 pizza…", "¿Qué se te antoja hoy?", "🌮 Tacos, 🍗 pollo, 🥤 bebidas…"];
let _vSugIdx = 0;

function _vResaltar(texto, palabras) {
  const chars = Array.from(String(texto == null ? "" : texto));
  let norm = "";
  const map = [];
  chars.forEach((c, i) => {
    const b = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (let k = 0; k < b.length; k++) { norm += b[k]; map.push(i); }
  });
  const marca = new Array(chars.length).fill(false);
  palabras.forEach(w => {
    if (!w) return;
    let p = norm.indexOf(w);
    while (p !== -1) { for (let k = p; k < p + w.length; k++) marca[map[k]] = true; p = norm.indexOf(w, p + w.length); }
  });
  let out = "", abierto = false;
  chars.forEach((c, i) => {
    if (marca[i] && !abierto) { out += '<mark class="v-hl">'; abierto = true; }
    if (!marca[i] && abierto) { out += "</mark>"; abierto = false; }
    out += esc(c);
  });
  return abierto ? out + "</mark>" : out;
}

function _vSyncX() {
  const row = document.getElementById("searchRow"), et = document.getElementById("etBuscador");
  if (row && et) row.classList.toggle("v-con-texto", !!et.value);
}

function _vPonerBuscador(enLocal, nombre) {
  const et = document.getElementById("etBuscador");
  if (!et) return;
  et.placeholder = enLocal ? "Buscar platos en " + nombre : _vSugerencias[_vSugIdx];
  const row = document.getElementById("searchRow");
  if (row) {
    row.classList.toggle("v-busq-local", !!enLocal);
    const ic = row.querySelector(".search-icon-badge");
    if (ic) ic.textContent = enLocal ? "🍽️" : "🔍";
  }
  _vSyncX();
}

async function _vLocalesBusqueda() {
  if (_vLocales && Date.now() - _vLocalesT < 60000) return _vLocales;
  const col = db.collection("restaurantes");
  let snap = null;
  try { const c = await col.get({ source: "cache" }); if (!c.empty) snap = c; } catch (e) {}
  if (!snap) snap = await col.get();
  const lista = [];
  snap.forEach(doc => {
    const r = doc.data();
    if (r.ciudad && String(r.ciudad).toLowerCase() !== miCiudad.toLowerCase()) return;
    lista.push({ id: doc.id, nombre: r.nombre || "", lat: r.latitud || 0, lon: r.longitud || 0, cerrado: (r.estado || "").toUpperCase() === "CERRADO", logo: r.logoUrl || "" });
  });
  _vLocales = lista;
  _vLocalesT = Date.now();
  return lista;
}

async function _vProductosLocal(rId) {
  if (_vMenuItems[rId]) return _vMenuItems[rId];
  let items = todosLosProductosCache.filter(p => p.rId === rId);
  if (!items.length) {
    const snap = await db.collection("restaurantes").doc(rId).collection("productos").get();
    items = [];
    snap.forEach(d => {
      const p = d.data();
      if (p.nombre) items.push({ rId: rId, rNom: rNombreTemp, rLat: restauranteLatTemp, rLon: restauranteLonTemp, pNom: p.nombre, pDesc: p.descripcion || "", pPrec: p.precio, pImg: formatearImagen(p.imagenUrl || ""), pOps: p.opciones || "" });
    });
  }
  _vMenuItems[rId] = items;
  return items;
}

function _vFilaPlato(p, conLocal, palabras) {
  const row = document.createElement("div");
  row.className = "product-row-card";
  const precio = precioVisible(p.pPrec, p.rLat, p.rLon);
  const sub = conLocal
    ? '<p class="sub-muted">De: ' + _vResaltar(p.rNom, palabras) + " • 🛵 Envío L. " + envioPara(p.rLat, p.rLon) + "</p>"
    : "<p>" + _vResaltar(p.pDesc, palabras) + "</p>";
  row.innerHTML = '<div class="product-info-left"><div><h4>' + _vResaltar(p.pNom, palabras) + "</h4>" + sub + '</div><div class="product-price">L. ' + precio.toFixed(2) + '</div></div><div class="product-thumb-box">' + (p.pImg ? '<img src="' + p.pImg + '" class="img-fill" />' : "🍽️") + '<button type="button" class="btn-plus-abs">+</button></div>';
  row.onclick = () => mostrarPlatoPro(p.rId, p.rNom, p.pNom, p.pDesc, p.pPrec, p.pImg, p.pOps, p.rLat, p.rLon);
  return row;
}

async function _vBuscarEnLocal(q) {
  const rId = restIdSeleccionadoTemp;
  const seq = ++_vBusqSeq;
  let items = [];
  try { items = await _vProductosLocal(rId); } catch (e) {}
  const list = document.getElementById("listMenuPlatos");
  if (seq !== _vBusqSeq || !list) return;
  const palabras = _vPalabras(q);
  const res = palabras.length ? items.filter(p => _vCoincide(p.pNom + " " + p.pDesc, palabras)) : items;
  list.innerHTML = "";
  if (!res.length) {
    list.innerHTML = '<div class="empty-box"><div class="empty-emoji">🔍</div><p class="empty-text">Este local no tiene platos con “' + esc(q) + "”.</p></div>";
    return;
  }
  if (palabras.length) {
    const h = document.createElement("div");
    h.className = "v-res-head";
    h.innerHTML = "<span>Platos en <b>" + esc(rNombreTemp) + "</b></span><em>" + res.length + (res.length === 1 ? " plato" : " platos") + "</em>";
    list.appendChild(h);
  }
  res.forEach(p => list.appendChild(_vFilaPlato(p, false, palabras)));
}

filtrarResultados = async function (q) {
  if (document.getElementById("listMenuPlatos")) return _vBuscarEnLocal(q);
  if (!q) { cargarInicioPrincipal(); return; }
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  const seq = ++_vBusqSeq;
  const palabras = _vPalabras(q);
  let locales = [];
  try { locales = await _vLocalesBusqueda(); } catch (e) {}
  if (seq !== _vBusqSeq || document.getElementById("listMenuPlatos")) return;
  const locs = locales.filter(l => _vCoincide(l.nombre, palabras));
  const prods = todosLosProductosCache
    .filter(p => _vCoincide(p.pNom + " " + p.pDesc + " " + p.rNom, palabras))
    .sort((a, b) => (_vCoincide(b.pNom, palabras) ? 1 : 0) - (_vCoincide(a.pNom, palabras) ? 1 : 0));
  cont.innerHTML = '<div class="v-res-head"><span>Resultados para <b>“' + esc(q) + "”</b></span><em>" + locs.length + (locs.length === 1 ? " local" : " locales") + " · " + prods.length + (prods.length === 1 ? " plato" : " platos") + "</em></div>";
  if (!locs.length && !prods.length) {
    cont.insertAdjacentHTML("beforeend", '<div class="empty-box"><div class="empty-emoji">🔍</div><p class="empty-text">No encontramos locales ni platos con ese nombre.</p></div>');
    return;
  }
  if (locs.length) {
    cont.insertAdjacentHTML("beforeend", '<div class="v-sec">🏪 Locales</div><div class="grid-2" id="vResLocales"></div>');
    const grid = document.getElementById("vResLocales");
    locs.forEach(l => {
      const logoSrc = formatearImagen(l.logo);
      const card = document.createElement("div");
      card.className = "rest-card-grid";
      card.innerHTML = '<div class="rest-card-cover">' + (logoSrc ? '<img src="' + logoSrc + '" class="img-fill" />' : "🍽️") + '<span class="badge-status ' + (l.cerrado ? "cerrado" : "abierto") + '">' + (l.cerrado ? "🛑 CERRADO" : "🟢 ABIERTO") + '</span></div><div class="rest-card-body"><h4>' + _vResaltar(l.nombre, palabras) + '</h4><span class="sub-muted">🛵 L. ' + envioPara(l.lat, l.lon) + "</span></div>";
      card.onclick = () => {
        if (l.cerrado) return alert("Este local está cerrado actualmente 🛑");
        abrirMenuRestaurante(l.id, l.nombre, l.lat, l.lon, l.logo);
      };
      grid.appendChild(card);
    });
  }
  if (prods.length) {
    cont.insertAdjacentHTML("beforeend", '<div class="v-sec">🍽️ Platos</div><div id="vResPlatos"></div>');
    const lista = document.getElementById("vResPlatos");
    prods.slice(0, 60).forEach(p => lista.appendChild(_vFilaPlato(p, true, palabras)));
  }
};

const _vAbrirMenuBase = abrirMenuRestaurante;
abrirMenuRestaurante = async function (rId, rNom, rLat, rLon, logoUrl) {
  const et = document.getElementById("etBuscador");
  if (rId !== _vMenuId && et) et.value = "";
  delete _vMenuItems[rId];
  _vMenuId = rId;
  _vPonerBuscador(true, rNom);
  return _vAbrirMenuBase(rId, rNom, rLat, rLon, logoUrl);
};

const _vInicioBase = cargarInicioPrincipal;
cargarInicioPrincipal = function () {
  const et = document.getElementById("etBuscador");
  if (_vMenuId !== null && et) et.value = "";
  _vMenuId = null;
  _vPonerBuscador(false);
  return _vInicioBase.apply(this, arguments);
};

(function () {
  const row = document.getElementById("searchRow"), et = document.getElementById("etBuscador");
  if (!row || !et || document.getElementById("btnLimpiarBusq")) return;
  const x = document.createElement("button");
  x.id = "btnLimpiarBusq";
  x.type = "button";
  x.textContent = "✕";
  x.className = "v-busq-x";
  row.insertBefore(x, row.querySelector(".search-icon-badge"));
  et.setAttribute("enterkeyhint", "search");
  et.setAttribute("autocomplete", "off");
  et.placeholder = _vSugerencias[0];
  et.addEventListener("input", _vSyncX);
  et.addEventListener("keydown", e => { if (e.key === "Enter") { filtrarResultados(et.value.trim()); et.blur(); } });
  x.onclick = () => { et.value = ""; _vSyncX(); filtrarResultados(""); et.focus(); };
  setInterval(() => {
    if (_vMenuId !== null || et.value || document.activeElement === et) return;
    _vSugIdx = (_vSugIdx + 1) % _vSugerencias.length;
    et.placeholder = _vSugerencias[_vSugIdx];
    et.classList.remove("v-ph");
    void et.offsetWidth;
    et.classList.add("v-ph");
  }, 3600);
  et.classList.add("v-ph");
})();

// ===== BANNER INTELIGENTE =====
const BN_MS = 5500;
const _bnN = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const _bn = { gen: 0, lista: [], i: -1, timer: null, ini: 0, resta: BN_MS, pausa: false, ultGancho: "", rot: 0 };

const _bnGenericos = ["Pídelo y llega a tu puerta 🛵", "Hoy te mereces este gusto ✨", "Calientito y directo a ti 🔥", "Tu antojo, sin salir de casa 🏠"];
const _bnGanchos = [
  [/hambur|burger/, ["Jugosa y bien servida 🍔", "La clásica que nunca falla 🍔", "Para los que no se aguantan 🍔"]],
  [/pizza/, ["Queso estirado en cada bocado 🍕", "Compártela (o no) 🍕"]],
  [/pollo|alita|wing|nugget/, ["Doradito y crujiente 🍗", "Para chuparse los dedos 🍗"]],
  [/taco|nacho|burrito|baleada|pupusa|quesadilla/, ["Sabor de casa en cada mordida 🌮", "Antojo hondureño al instante 🌮"]],
  [/postre|pastel|helado|torta|dulce|brownie|flan|crepa/, ["Un gustito dulce te lo mereces 🍰", "Para endulzar tu día 🍰"]],
  [/cafe|frappe|malteada|batido|jugo|licuado|bebida|refresco|te frio/, ["Fresquito para acompañar 🥤", "Para refrescar el día 🥤"]],
  [/desayuno|huevo|tostada|panqueque|omelet/, ["Empieza el día con sabor ☀️", "El mejor inicio de día ☀️"]],
  [/sopa|caldo|mariscos|pescado|camaron|ceviche/, ["Directo del mar a tu mesa 🐟", "Sabroso y bien servido 🍲"]]
];

function _bnVistos() { try { return JSON.parse(localStorage.getItem("bn_vistos") || "{}") || {}; } catch (e) { return {}; } }
function _bnGuardar(v) {
  try {
    const ks = Object.keys(v);
    if (ks.length > 400) ks.forEach(k => { v[k] = Math.floor(v[k] / 2); if (!v[k]) delete v[k]; });
    localStorage.setItem("bn_vistos", JSON.stringify(v));
  } catch (e) {}
}

function _bnMomento() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return { id: "desayuno", tag: "☀️ PARA EL DESAYUNO", palabras: ["desayuno", "baleada", "huevo", "pan", "cafe", "jugo", "panqueque", "tostada", "omelet", "sandwich", "licuado"] };
  if (h >= 10 && h < 15) return { id: "almuerzo", tag: "🍽️ HORA DE ALMORZAR", palabras: ["almuerzo", "pollo", "carne", "arroz", "pescado", "res", "cerdo", "pasta", "sopa", "ensalada", "hamburguesa", "combo", "plato"] };
  if (h >= 15 && h < 19) return { id: "tarde", tag: "🧁 ANTOJO DE LA TARDE", palabras: ["postre", "helado", "pastel", "cafe", "frappe", "snack", "nacho", "papas", "malteada", "batido", "crepa", "dulce", "pan"] };
  return { id: "noche", tag: "🌙 CENA DE HOY", palabras: ["pizza", "hamburguesa", "taco", "alitas", "pollo", "burrito", "hot dog", "perro", "wings", "pupusa", "cena", "combo"] };
}

function _bnGancho(nombre) {
  const t = _bnN(nombre);
  let opts = _bnGenericos;
  for (const g of _bnGanchos) { if (g[0].test(t)) { opts = g[1]; break; } }
  let h = opts[Math.floor(Math.random() * opts.length)];
  if (h === _bn.ultGancho && opts.length > 1) h = opts[(opts.indexOf(h) + 1) % opts.length];
  _bn.ultGancho = h;
  return h;
}

function _bnArmar() {
  const base = todosLosProductosCache.filter(p => !p.rCerrado && p.pPrec > 0);
  if (!base.length) return [];
  const vistos = _bnVistos();
  const m = _bnMomento();
  const kP = p => p.rId + "|" + p.pNom;
  const kR = p => "r|" + p.rId;

  let min = Infinity;
  base.forEach(p => { min = Math.min(min, vistos[kP(p)] || 0); });
  if (isFinite(min) && min > 0) { base.forEach(p => { vistos[kP(p)] = (vistos[kP(p)] || 0) - min; }); _bnGuardar(vistos); }

  const pts = base.map(p => {
    const t = _bnN(p.pNom + " " + p.pDesc);
    const coincide = m.palabras.some(w => t.includes(w));
    let s = Math.random() * 1.3 - (vistos[kP(p)] || 0) * 1.6 - (vistos[kR(p)] || 0) * 0.25;
    if (coincide) s += 2;
    if (p.pImg) s += 0.7;
    return { p: p, s: s, coincide: coincide };
  }).sort((a, b) => b.s - a.s);

  const porRest = {}, usados = {}, elegidos = [];
  for (const x of pts) {
    if (elegidos.length >= 8) break;
    const n = porRest[x.p.rId] || 0, nom = _bnN(x.p.pNom).trim();
    if (n >= 2 || usados[nom]) continue;
    porRest[x.p.rId] = n + 1;
    usados[nom] = true;
    elegidos.push(x);
  }
  for (const x of pts) {
    if (elegidos.length >= Math.min(4, pts.length)) break;
    const nom = _bnN(x.p.pNom).trim();
    if (!elegidos.includes(x) && !usados[nom]) { usados[nom] = true; elegidos.push(x); }
  }

  const tagsRot = ["⭐ RECOMENDADO", "😋 PRUÉBALO", "🔥 SE ANTOJA"];
  const lista = elegidos.map(x => {
    const p = x.p;
    return {
      tipo: "plato", mom: x.coincide ? m.id : "",
      tag: x.coincide ? m.tag : tagsRot[(_bn.rot++) % tagsRot.length],
      titulo: p.pNom, sub: _bnGancho(p.pNom), rest: "🏪 " + p.rNom,
      precio: Math.round(precioVisible(p.pPrec, p.rLat, p.rLon)), envio: envioPara(p.rLat, p.rLon),
      img: p.pImg, datos: p, claves: [kP(p), kR(p)]
    };
  });

  const esp = [];
  const locales = {};
  base.forEach(p => {
    const l = locales[p.rId] = locales[p.rId] || { rId: p.rId, rNom: p.rNom, rLat: p.rLat, rLon: p.rLon, img: "", n: 0 };
    l.n++;
    if (!l.img && p.pImg) l.img = p.pImg;
  });
  const locs = Object.values(locales).map(l => Object.assign(l, { envio: envioPara(l.rLat, l.rLon) }));
  if (locs.length) {
    const envMin = Math.min(...locs.map(l => l.envio)), envMax = Math.max(...locs.map(l => l.envio));
    const barato = envMax > envMin;
    const pool = (barato ? locs.filter(l => l.envio === envMin) : locs.slice())
      .sort((a, b) => ((vistos["r|" + a.rId] || 0) - (vistos["r|" + b.rId] || 0)) || (Math.random() - 0.5));
    const l = pool[0];
    esp.push({
      tipo: barato ? "barato" : "local",
      tag: barato ? "🚀 ENVÍO MÁS BAJO" : "🏪 DESCUBRE",
      titulo: l.rNom,
      sub: barato ? "Envío solo L. " + l.envio : l.n + (l.n === 1 ? " plato" : " platos") + " para elegir",
      rest: "", envio: l.envio, img: l.img, datos: l, claves: ["r|" + l.rId]
    });
  }

  const vis = base.map(p => ({ p: p, v: Math.round(precioVisible(p.pPrec, p.rLat, p.rLon)) })).sort((a, b) => a.v - b.v);
  if (vis.length >= 4) {
    const b = vis.slice(0, 3).sort((a, c) => (vistos[kP(a.p)] || 0) - (vistos[kP(c.p)] || 0))[0];
    if (!lista.some(it => it.tipo === "plato" && _bnN(it.titulo).trim() === _bnN(b.p.pNom).trim())) {
      esp.push({
        tipo: "plato", mom: "", tag: "💸 LO MÁS ECONÓMICO", titulo: b.p.pNom, sub: "Buen precio, mucho sabor",
        rest: "🏪 " + b.p.rNom, precio: b.v, envio: envioPara(b.p.rLat, b.p.rLon), img: b.p.pImg, datos: b.p, claves: [kP(b.p), kR(b.p)]
      });
    }
  }
  const tope = [80, 100, 120, 150, 200, 250].find(t => vis.filter(x => x.v <= t).length >= 3);
  if (tope) {
    const sel = vis.filter(x => x.v <= tope);
    if (sel.length < vis.length) {
      esp.push({
        tipo: "hasta", tag: "🏷️ MENOS DE L. " + tope, titulo: "Platillos desde L. " + sel[0].v,
        sub: sel.length + " opciones a buen precio", rest: "", img: sel[0].p.pImg, tope: tope, datos: null, claves: []
      });
    }
  }
  esp.forEach((e, k) => lista.splice(Math.min(2 + k * 3, lista.length), 0, e));

  const rid = it => it.datos ? it.datos.rId : "";
  for (let i = 1; i < lista.length; i++) {
    if (rid(lista[i]) && rid(lista[i]) === rid(lista[i - 1])) {
      for (let j = i + 1; j < lista.length; j++) {
        if (rid(lista[j]) !== rid(lista[i - 1])) { const t = lista[i]; lista[i] = lista[j]; lista[j] = t; break; }
      }
    }
  }
  return lista;
}

function _bnEmoji(it) {
  const e = document.createElement("div");
  e.className = "bn-emoji";
  e.textContent = it.tipo === "plato" ? "🍽️" : it.tipo === "hasta" ? "🏷️" : it.tipo === "barato" ? "🛵" : "🏪";
  return e;
}

function _bnPintar(wrap, it, dir) {
  wrap.querySelectorAll(".hero-overlay, .hero-content, .hero-bg-img").forEach(n => n.remove());
  const viejo = wrap.querySelector(".bn-slide:not(.bn-out)");
  const s = document.createElement("div");
  s.className = "bn-slide" + (it.tipo !== "plato" ? " bn-t-" + it.tipo : "") + (it.mom && it.mom !== "almuerzo" ? " bn-m-" + it.mom : "");
  s.style.setProperty("--bn-dir", dir);
  if (it.img) {
    const im = document.createElement("img");
    im.className = "bn-img";
    im.alt = "";
    im.onerror = () => { im.remove(); s.insertBefore(_bnEmoji(it), s.firstChild); };
    im.src = it.img;
    s.appendChild(im);
  } else s.appendChild(_bnEmoji(it));
  const body = document.createElement("div");
  body.className = "bn-body";
  const add = (cls, txt) => { const d = document.createElement("div"); d.className = cls; d.textContent = txt; body.appendChild(d); return d; };
  const tg = document.createElement("span"); tg.className = "bn-tag"; tg.textContent = it.tag; body.appendChild(tg);
  add("bn-title", it.titulo);
  if (it.sub) add("bn-sub", it.sub);
  if (it.rest) add("bn-rest", it.rest);
  if (it.envio != null) {
    const ch = document.createElement("div"); ch.className = "bn-chips";
    ["🛵 Envío L. " + it.envio, "⏱ 20-35 min"].forEach(t => { const c = document.createElement("span"); c.textContent = t; ch.appendChild(c); });
    body.appendChild(ch);
  }
  add("bn-cta", it.tipo === "plato" ? "Pedir ahora ➔" : it.tipo === "hasta" ? "Ver platillos ➔" : "Ver menú ➔");
  s.appendChild(body);
  if (it.tipo === "plato" && it.precio) { const p = document.createElement("div"); p.className = "bn-price"; p.textContent = "L. " + it.precio; s.appendChild(p); }
  wrap.appendChild(s);
  if (viejo) { viejo.classList.add("bn-out"); viejo.style.setProperty("--bn-dir", dir); setTimeout(() => viejo.remove(), 450); }
}

function _bnDots(wrap, i, total) {
  let d = wrap.querySelector(".bn-dots");
  if (!d) { d = document.createElement("div"); d.className = "bn-dots"; wrap.appendChild(d); }
  d.innerHTML = "";
  for (let k = 0; k < total; k++) {
    const sg = document.createElement("span");
    sg.className = "bn-seg" + (k < i ? " hecho" : k === i ? " act" : "");
    const f = document.createElement("i");
    if (k === i) f.style.animationDuration = BN_MS + "ms";
    sg.appendChild(f);
    d.appendChild(sg);
  }
}

function _bnProgramar(wrap) {
  clearTimeout(_bn.timer);
  const gen = _bn.gen;
  _bn.ini = Date.now();
  _bn.timer = setTimeout(() => {
    if (gen !== _bn.gen || !wrap.isConnected) return;
    if (wrap.offsetParent === null || document.hidden) { _bn.resta = 1500; _bnProgramar(wrap); return; }
    _bnSiguiente(wrap, 1);
  }, _bn.resta);
}

function _bnMostrar(wrap, i, dir) {
  const it = _bn.lista[i];
  if (!it) return;
  _bn.i = i;
  _bnPintar(wrap, it, dir);
  _bnDots(wrap, i, _bn.lista.length);
  const v = _bnVistos();
  (it.claves || []).forEach(k => { v[k] = (v[k] || 0) + 1; });
  _bnGuardar(v);
  _bn.resta = BN_MS;
  _bnProgramar(wrap);
}

function _bnSiguiente(wrap, dir) {
  if (!wrap.isConnected) return;
  if (dir > 0) {
    if (_bn.i + 1 >= _bn.lista.length) {
      const ult = _bn.lista[_bn.i];
      const nueva = _bnArmar();
      if (nueva.length) {
        if (nueva.length > 1 && ult && nueva[0].datos && nueva[0].datos === ult.datos) { const t = nueva[0]; nueva[0] = nueva[1]; nueva[1] = t; }
        _bn.lista = nueva;
      }
      _bnMostrar(wrap, 0, 1);
      return;
    }
    _bnMostrar(wrap, _bn.i + 1, 1);
  } else {
    _bnMostrar(wrap, Math.max(0, _bn.i - 1), -1);
  }
}

function _bnPausar(wrap) {
  if (_bn.pausa) return;
  _bn.pausa = true;
  clearTimeout(_bn.timer);
  _bn.resta = Math.max(400, _bn.resta - (Date.now() - _bn.ini));
  wrap.classList.add("bn-pausa");
}

function _bnReanudar(wrap) {
  if (!_bn.pausa) return;
  _bn.pausa = false;
  wrap.classList.remove("bn-pausa");
  _bnProgramar(wrap);
}

function _bnTocar() {
  const it = _bn.lista[_bn.i];
  if (!it) return;
  const d = it.datos;
  if (it.tipo === "plato") mostrarPlatoPro(d.rId, d.rNom, d.pNom, d.pDesc, d.pPrec, d.pImg, d.pOps, d.rLat, d.rLon);
  else if (it.tipo === "hasta") mostrarPlatosHasta(it.tope);
  else abrirMenuRestaurante(d.rId, d.rNom, d.rLat, d.rLon, d.img);
}

function _bnGestos(wrap) {
  let x0 = 0, y0 = 0, t0 = 0, activo = false;
  wrap.addEventListener("pointerdown", e => { activo = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); _bnPausar(wrap); });
  const fin = e => {
    if (!activo) return;
    activo = false;
    _bnReanudar(wrap);
    if (e.type === "pointercancel") return;
    const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) { _bnSiguiente(wrap, dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 600) _bnTocar();
  };
  wrap.addEventListener("pointerup", fin);
  wrap.addEventListener("pointercancel", fin);
}

function mostrarPlatosHasta(tope) {
  const cont = document.getElementById("contRestaurantes");
  if (!cont) return;
  cont.innerHTML = '<div class="section-header"><button class="circle-btn back-btn" onclick="cargarInicioPrincipal()">❮</button><div style="flex:1; margin-left:14px"><h3 style="font-size:18px">Platillos hasta L. ' + tope + '</h3><span class="sub-muted">Precio final según tu distancia</span></div></div><div id="listPrecioEsp" style="margin-top:10px"></div>';
  const list = document.getElementById("listPrecioEsp");
  const items = todosLosProductosCache
    .filter(p => !p.rCerrado && p.pPrec > 0 && Math.round(precioVisible(p.pPrec, p.rLat, p.rLon)) <= tope)
    .sort((a, b) => precioVisible(a.pPrec, a.rLat, a.rLon) - precioVisible(b.pPrec, b.rLat, b.rLon));
  if (!items.length) { list.innerHTML = '<div class="empty-box"><p>No encontramos platillos en este rango.</p></div>'; return; }
  items.forEach(p => list.appendChild(_vFilaPlato(p, true, [])));
}

iniciarSliderPublicitario = function () {
  if (sliderTimer) { clearTimeout(sliderTimer); sliderTimer = null; }
  clearTimeout(_bn.timer);
  const gen = ++_bn.gen;
  _bn.pausa = false; _bn.lista = []; _bn.i = -1; _bn.resta = BN_MS;
  const wrap = document.querySelector(".hero-slider-wrap");
  if (!wrap) return;
  wrap.classList.add("bn-wrap");
  _bnGestos(wrap);
  let ultimoN = -1, intentos = 0;
  const espera = () => {
    if (gen !== _bn.gen || !wrap.isConnected) return;
    if (wrap.offsetParent === null) { setTimeout(espera, 1200); return; }
    const n = todosLosProductosCache.length;
    if (n === 0 || (n !== ultimoN && intentos < 8)) { ultimoN = n; if (n) intentos++; setTimeout(espera, 500); return; }
    const lista = _bnArmar();
    if (!lista.length) { setTimeout(espera, 800); return; }
    _bn.lista = lista;
    _bnMostrar(wrap, 0, 1);
  };
  espera();
};

// ===== BANNER TEXTOS POR PRODUCTO =====
function _bnClasif(txt, conBebidas) {
  const t = _bnN(txt);
  if (conBebidas) {
    if (/\b(frappe|malteada|batido|licuado|smoothie|granizada|iced)\b|\b(cafe|te|chocolate)\s+(frio|fria|helado|helada)\b/.test(t)) return "bebidaFria";
    if (/\bagua\b/.test(t)) return "agua";
    if (/\b(cerveza|michelada|vino|tequila|whisky|vodka|coctel|cocktail|margarita|ron)\b/.test(t)) return "alcohol";
  }
  if (/hambur|burger/.test(t)) return "hamburguesa";
  if (/pizza/.test(t)) return "pizza";
  if (/pollo|alita|wing|nugget/.test(t)) return "pollo";
  if (/taco|nacho|burrito|baleada|pupusa|quesadilla/.test(t)) return "mexicana";
  if (/mariscos|pescado|camaron|ceviche|langosta|tilapia|pulpo/.test(t)) return "mar";
  if (/sopa|caldo|consome|sancocho/.test(t)) return "sopa";
  if (/desayuno|huevo|tostada|panqueque|omelet/.test(t)) return "desayuno";
  if (/postre|pastel|helado|dulce|brownie|\bflan\b|\bcrepas?\b|\bdonas?\b|galleta|cheesecake|tres leches|\bpay\b/.test(t)) return "postre";
  if (conBebidas) {
    if (/\bcafe\b|capuchino|cappuccino|\blatte\b|expreso|espresso|chocolate caliente|\bte (caliente|negro|verde|manzanilla)\b|\batol\b/.test(t)) return "bebidaCaliente";
    if (/jugo|limonada|naranjada|refresco|gaseosa|\bsoda\b|\bcoca\b|pepsi|fanta|sprite|\bcola\b(?! de)|energizante|monster|horchata|jamaica|bebida/.test(t)) return "bebidaFria";
  }
  return "general";
}

function _bnTipo(nombre, desc) {
  const a = _bnClasif(nombre, true);
  return a !== "general" ? a : _bnClasif(desc, false);
}

const _bnGanchosTipo = {
  agua: ["Para hidratarte 💧", "Va perfecta con tu pedido 💧"],
  bebidaFria: ["Para acompañar tu pedido 🥤", "El acompañante perfecto 🥤", "Para refrescar el día 🥤"],
  bebidaCaliente: ["Calientito para el antojo ☕", "Un break con sabor ☕"],
  alcohol: ["Para acompañar la ocasión 🍻", "Para brindar con tu pedido 🍻"],
  postre: ["Un gustito dulce te lo mereces 🍰", "Para endulzar tu día 🍰"],
  hamburguesa: ["Jugosa y bien servida 🍔", "La clásica que nunca falla 🍔", "Para los que no se aguantan 🍔"],
  pizza: ["Queso estirado en cada bocado 🍕", "Compártela (o no) 🍕"],
  pollo: ["Para chuparse los dedos 🍗", "Sabroso y bien servido 🍗"],
  mexicana: ["Sabor de casa en cada mordida 🌮", "Un antojo que nunca falla 🌮"],
  mar: ["Sabor de mar en tu mesa 🐟", "Sabroso y bien servido 🐟"],
  sopa: ["Sabrosa y bien servida 🍲", "Para disfrutar sin prisa 🍲"],
  general: ["Pídelo y llega a tu puerta 🛵", "Hoy te mereces este gusto ✨", "Tu antojo, sin salir de casa 🏠", "Directo a tu puerta 🛵"]
};
const _bnTagsTipo = {
  agua: ["💧 PARA HIDRATARTE", "⭐ RECOMENDADO"],
  bebidaFria: ["🥤 PARA REFRESCAR", "⭐ RECOMENDADO"],
  bebidaCaliente: ["☕ PARA ACOMPAÑAR", "⭐ RECOMENDADO"],
  alcohol: ["🍻 PARA LA OCASIÓN", "⭐ RECOMENDADO"],
  postre: ["🍰 GUSTITO DULCE", "⭐ RECOMENDADO"]
};
const _bnTagsComida = ["⭐ RECOMENDADO", "😋 PRUÉBALO", "🔥 SE ANTOJA"];
const _bnIconos = { agua: "💧", bebidaFria: "🥤", bebidaCaliente: "☕", alcohol: "🍻", postre: "🍰", hamburguesa: "🍔", pizza: "🍕", pollo: "🍗", mexicana: "🌮", mar: "🐟", sopa: "🍲", desayuno: "🍳" };
let _bnRotTag = 0;

function _bnGanchoTipo(tipo) {
  let opts = _bnGanchosTipo[tipo];
  if (tipo === "desayuno") {
    const h = new Date().getHours();
    opts = (h >= 5 && h < 11) ? ["Empieza el día con sabor ☀️", "El mejor inicio de día ☀️"] : ["Un desayuno a cualquier hora 🍳", "Para cuando se te antoje 🍳"];
  }
  if (!opts) opts = _bnGanchosTipo.general;
  let h2 = opts[Math.floor(Math.random() * opts.length)];
  if (h2 === _bn.ultGancho && opts.length > 1) h2 = opts[(opts.indexOf(h2) + 1) % opts.length];
  _bn.ultGancho = h2;
  return h2;
}

const _bnArmarBase = _bnArmar;
_bnArmar = function () {
  const lista = _bnArmarBase();
  const m = _bnMomento();
  const rx = new RegExp("\\b(" + m.palabras.join("|") + ")s?\\b");
  lista.forEach(it => {
    if (it.tipo !== "plato" || !it.datos) return;
    const p = it.datos;
    const tipo = _bnTipo(p.pNom, p.pDesc);
    const esBeb = tipo === "agua" || tipo === "bebidaFria" || tipo === "bebidaCaliente" || tipo === "alcohol";
    it.tkn = tipo;
    if (String(it.tag).indexOf("💸") === 0) {
      if (esBeb) it.sub = "Buen precio para acompañar tu pedido";
      return;
    }
    const coincide = rx.test(_bnN(p.pNom + " " + p.pDesc));
    it.mom = coincide ? m.id : "";
    if (coincide) it.tag = m.tag;
    else { const arr = _bnTagsTipo[tipo] || _bnTagsComida; it.tag = arr[(_bnRotTag++) % arr.length]; }
    it.sub = _bnGanchoTipo(tipo);
  });
  return lista;
};

_bnEmoji = function (it) {
  const e = document.createElement("div");
  e.className = "bn-emoji";
  e.textContent = it.tipo === "plato" ? (_bnIconos[it.tkn] || "🍽️") : it.tipo === "hasta" ? "🏷️" : it.tipo === "barato" ? "🛵" : "🏪";
  return e;
};

// ===== BANNER SERIO =====
function _bnExcluido(p) {
  const n = _bnN(p.pNom);
  if (/\bagua\b|botellon|garrafon|\bhielo\b/.test(n)) return true;
  if (/^(extra|adicional|salsa|aderezo|cubierto|servilleta|bolsa|empaque|vaso|tapa|propina)/.test(n) || /\s(extra|adicional)$/.test(n)) return true;
  if (/\b(gaseosa|refresco|soda|coca|pepsi|fanta|sprite|7up|seven up|energizante|monster|red bull|cerveza|michelada|vino|tequila|whisky|vodka|ron|coctel|cocktail|margarita)\b|\bcola\b(?! de)/.test(n)) return true;
  return false;
}

const _bnSerioTags = ["⭐ RECOMENDADO", "🛍️ ORDENA AHORA", "📍 DISPONIBLE HOY", "✅ LISTO PARA PEDIR"];
const _bnSerioTxt = {
  postre: ["Complementa tu pedido con un postre", "Ordena ahora, entrega a domicilio"],
  bebida: ["Agrégalo a tu pedido de hoy", "Ordena ahora, entrega a domicilio"],
  otro: ["Ordena ahora, entrega a domicilio", "Haz tu pedido en segundos", "Disponible ahora para entrega", "Pide hoy y recíbelo en tu puerta"]
};
let _bnSerioRot = 0;

function _bnSerioSub(tipo) {
  const g = tipo === "postre" ? "postre" : (tipo === "bebidaFria" || tipo === "bebidaCaliente") ? "bebida" : "otro";
  const opts = _bnSerioTxt[g];
  let s = opts[Math.floor(Math.random() * opts.length)];
  if (s === _bn.ultGancho && opts.length > 1) s = opts[(opts.indexOf(s) + 1) % opts.length];
  _bn.ultGancho = s;
  return s;
}

const _bnArmarSerio = _bnArmar;
_bnArmar = function () {
  const orig = todosLosProductosCache;
  let lista;
  try {
    const filtrado = orig.filter(p => !_bnExcluido(p));
    todosLosProductosCache = filtrado.length ? filtrado : orig;
    lista = _bnArmarSerio();
  } finally {
    todosLosProductosCache = orig;
  }
  lista.forEach(it => {
    if (it.tipo !== "plato" || !it.datos) return;
    if (String(it.tag).indexOf("💸") === 0) { it.sub = "Buen precio para tu pedido de hoy"; return; }
    if (!it.mom) it.tag = _bnSerioTags[(_bnSerioRot++) % _bnSerioTags.length];
    it.sub = _bnSerioSub(it.tkn || _bnTipo(it.datos.pNom, it.datos.pDesc));
  });
  return lista;
};

// ===== UNA SUCURSAL POR MARCA =====
function unaSucursalPorMarca(docs) {
  const grupos = new Map();
  docs.forEach(d => {
    const m = String((d.data() || {}).marca_id || "").trim().toLowerCase();
    if (!m) return;
    if (!grupos.has(m)) grupos.set(m, []);
    grupos.get(m).push(d);
  });
  if (!grupos.size) return docs;
  const elegida = {};
  grupos.forEach((lista, k) => {
    let mejor = null, mejorKm = Infinity, mejorAbierto = false;
    lista.forEach(d => {
      const x = d.data() || {};
      if (x.ciudad && String(x.ciudad).toLowerCase() !== String(miCiudad).toLowerCase()) return;
      const abierto = String(x.estado || "").toUpperCase() !== "CERRADO";
      const la = Number(x.latitud) || 0, lo = Number(x.longitud) || 0;
      const km = (!la || !lo) ? 1e300 : calcularDistanciaKm(miLat, miLon, la, lo);
      if (!mejor || (abierto && !mejorAbierto) || (abierto === mejorAbierto && km < mejorKm)) {
        mejor = d; mejorKm = km; mejorAbierto = abierto;
      }
    });
    if (mejor) elegida[k] = mejor.id;
  });
  return docs.filter(d => {
    const m = String((d.data() || {}).marca_id || "").trim().toLowerCase();
    if (!m) return true;
    const id = elegida[m];
    return !id || id === d.id;
  });
}

function _vSnapMarca(snap) {
  if (!snap || !snap.docs) return snap;
  const docs = unaSucursalPorMarca(snap.docs);
  return { docs: docs, size: docs.length, empty: docs.length === 0, metadata: snap.metadata, forEach: fn => docs.forEach(d => fn(d)) };
}

(function () {
  const colBase = db.collection.bind(db);
  db.collection = function (path) {
    const c = colBase.apply(null, arguments);
    if (path === "restaurantes") {
      const getBase = c.get.bind(c);
      c.get = function (o) { return getBase(o).then(_vSnapMarca); };
    }
    return c;
  };
})();

firmaRest = function (snap) {
  return snap.docs.map(d => {
    const x = d.data() || {};
    return [d.id, x.nombre, x.estado, x.latitud, x.longitud, x.marca_id, String(x.logoUrl || "").length].join(":");
  }).sort().join("|");
};

let _vLocKey = "";
const _vLocalesBusquedaBase = _vLocalesBusqueda;
_vLocalesBusqueda = function () {
  const k = miLat + "," + miLon + "," + miCiudad;
  if (k !== _vLocKey) { _vLocKey = k; _vLocales = null; }
  return _vLocalesBusquedaBase();
};
