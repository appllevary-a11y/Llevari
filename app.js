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

  if (miTelefono) {
    try {
      const snapMisp = await db.collection("clientes").doc(miTelefono).collection("mis_pedidos").get();
      let hayActivo = false;
      for (const d of snapMisp.docs) {
        const p = d.data();
        if (!p.rId || !p.pId) continue;
        const rDoc = await db.collection("restaurantes").doc(p.rId).collection("pedidos").doc(p.pId).get();
        if (rDoc.exists) {
          const est = (rDoc.data().estado || "").toUpperCase();
          if (est && !["ENTREGADO", "COMPLETADO", "FINALIZADO", "CANCELADO"].includes(est)) {
            hayActivo = true;
            pedidoActivoId = p.pId;
            restIdSeleccionadoTemp = p.rId;
            rNombreTemp = rDoc.data().restaurante_nombre || "Restaurante";
            break;
          }
        }
      }
      if (!hayActivo) {
        pedidoActivoId = "";
        localStorage.removeItem("pedidoActivoId");
      }
    } catch (e) {
      console.error("Error cargando pedidos activos:", e);
    }
  }

  let snapR;
  try {
    snapR = await db.collection("restaurantes").get();
  } catch (e) {
    cont.innerHTML = '<div class="empty-box"><div class="empty-emoji">⚠️</div><p style="font-weight:700">No se pudieron cargar los locales</p><p class="empty-text">' + e.message + '</p></div>';
    return;
  }
  cont.innerHTML = "";

  if (pedidoActivoId) {
    const banner = document.createElement("div");
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

    db.collection("restaurantes").doc(doc.id).collection("productos").get().then(pSnap => {
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
    fecha: new Date().toLocaleString("es-HN"),
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
    const docRef = await colPed.add(pedData);
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
