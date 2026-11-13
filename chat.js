(function () {
  "use strict";
  var EMOJIS = [
    ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥳","🤔","🤩","👍","👎","👏","🙌","🤝","🙏","👌","✌️","💪"],
    ["🛵","🚗","🚲","📦","✉️","📍","🗺️","🏠","🏢","🚪","🔑","⏱️","⏳","🔔","📱","📞","💵","💳","🧾","🚨"],
    ["🍕","🍔","🍟","🌭","🍿","🌮","🌯","🥗","🍗","🥩","🍱","🍣","🍦","🍰","☕","🥤","🧃","🍺","🍩","🥐"],
    ["✅","❌","⚠️","‼️","❓","💬","🔴","🟢","🔵","💛","💖","🔥","✨","⭐","💯","🎉","🆗","🆒"]
  ];
  var CATS = ["😀 Gestos", "🛵 Reparto", "🍕 Comida", "✨ Símbolos"];
  var SUG = ["👋 Hola, ¿cómo vas con mi pedido?", "❓ ¿Por dónde vienes aproximadamente?", "🏠 Ya estoy listo afuera esperando", "🔔 Por favor toca el timbre", "👍 Muchas gracias"];
  var VACIO = '<div class="llc-vacio"><div class="llc-vacio-ico">💬</div>Escríbele a tu repartidor</div>';

  var catIdx = 0, emojiOpen = false, chatOpen = false, asignado = false, primera = true;
  var chatUnsub = null, unreadUnsub = null, orderUnsub = null;
  var prevCount = -1, prevUnread = -1, unread = 0, curPed = "", curRest = "", repName = "", lastKey = "";
  var nodes = {}, lastH = -1, lastT = -1;

  function $(id) { return document.getElementById(id); }
  function aviso(m) { try { toast(m); } catch (e) {} }
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      var c = new C(), o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(c.destination); o.start();
      setTimeout(function () { try { o.stop(); c.close(); } catch (e) {} }, 180);
    } catch (e) {}
  }
  function hora(d) {
    var t = d && d.timestamp; if (!t || !t.toDate) return "";
    var x = t.toDate(), h = x.getHours(), m = x.getMinutes(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12; return h + ":" + (m < 10 ? "0" : "") + m + " " + ap;
  }

  // ---------- estilos ----------
  var css = document.createElement("style");
  css.textContent =
    "body.llc-open .v-onda{display:none!important}" +
    "#layoutChat .v-tocado,#llcSheet .v-tocado{animation:none!important}" +
    "#llcBd{position:fixed;inset:0;z-index:69;background:#F6F4FB}" +
    "#layoutChat{position:fixed;left:0;right:0;top:0;height:100%;z-index:70;display:flex;flex-direction:column;background:linear-gradient(180deg,#F6F4FB 0%,#EEE9FB 100%);overflow:hidden}" +
    "#layoutChat button{font-family:inherit;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation}" +
    "#layoutChat .llc-top{position:relative;z-index:2;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#3B0764 0%,#5B21B6 55%,#7C3AED 100%);padding:calc(12px + env(safe-area-inset-top,0px)) 14px 16px;border-radius:0 0 26px 26px;box-shadow:0 10px 24px rgba(59,7,100,.28)}" +
    "#layoutChat .llc-back{flex:0 0 auto;width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:17px;font-weight:700}" +
    "#layoutChat .llc-av{position:relative;flex:0 0 auto;width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,.22)}" +
    "#layoutChat .llc-av:after{content:'';position:absolute;right:0;bottom:1px;width:12px;height:12px;border-radius:50%;background:#22C55E;border:2px solid #fff}" +
    "#layoutChat .llc-ttl{flex:1;min-width:0}" +
    "#layoutChat .llc-tit{font-size:17px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#layoutChat .llc-sub{font-size:12px;color:#DDD6FE;margin-top:1px}" +
    "#layoutChat .llc-sug{display:flex;gap:8px;overflow-x:auto;padding:12px 12px 4px;scrollbar-width:none;flex:0 0 auto}" +
    "#layoutChat .llc-sug::-webkit-scrollbar{display:none}" +
    "#layoutChat .llc-chip{flex:0 0 auto;border:1.5px solid #DDD6FE;background:#fff;color:#5B21B6;border-radius:20px;padding:8px 14px;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(91,33,182,.1);transition:background .15s,transform .15s}" +
    "#layoutChat .llc-chip:active{background:#EDE9FE;transform:scale(.96)}" +
    "#layoutChat .llc-msgs{flex:1;min-height:0;overflow-y:auto;padding:12px 12px 8px;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}" +
    "#layoutChat .llc-vacio{margin:auto;text-align:center;color:#6B6880;font-size:14px;font-weight:600}" +
    "#layoutChat .llc-vacio-ico{width:70px;height:70px;margin:0 auto 10px;border-radius:50%;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-size:32px}" +
    "#layoutChat .llc-row{display:flex}" +
    "#layoutChat .llc-row.yo{justify-content:flex-end}" +
    "#layoutChat .llc-bub{max-width:80%;padding:9px 12px 6px;border-radius:18px 18px 18px 5px;background:#fff;color:#1F1B2E;font-size:15px;line-height:1.35;box-shadow:0 2px 8px rgba(59,7,100,.08);word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap}" +
    "#layoutChat .llc-row.yo .llc-bub{border-radius:18px 18px 5px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;box-shadow:0 4px 12px rgba(91,33,182,.3)}" +
    "#layoutChat .llc-nom{font-size:11px;font-weight:800;color:#7C3AED;margin-bottom:2px}" +
    "#layoutChat .llc-bub img{display:block;max-width:220px;max-height:260px;width:auto;height:auto;border-radius:12px;margin:2px 0 2px}" +
    "#layoutChat .llc-meta{display:flex;justify-content:flex-end;align-items:center;gap:5px;font-size:10.5px;margin-top:3px;color:#94A3B8;white-space:nowrap}" +
    "#layoutChat .llc-row.yo .llc-meta{color:rgba(255,255,255,.75)}" +
    "#layoutChat .llc-tick{font-size:12px;letter-spacing:-2px}" +
    "#layoutChat .llc-tick.ok{color:#7DD3FC;font-weight:800}" +
    "#layoutChat .llc-new{animation:llcIn .28s cubic-bezier(.2,.9,.3,1.2)}" +
    "@keyframes llcIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}" +
    "#layoutChat .llc-emo{flex:0 0 auto;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -6px 20px rgba(59,7,100,.12)}" +
    "#layoutChat .llc-cats{display:flex;gap:6px;padding:10px 10px 4px}" +
    "#layoutChat .llc-cat{flex:1;border:none;border-radius:16px;padding:8px 2px;font-size:12px;font-weight:700;background:#F6F4FB;color:#6B6880}" +
    "#layoutChat .llc-cat.on{background:#EDE9FE;color:#7C3AED}" +
    "#layoutChat .llc-grid{display:grid;grid-template-columns:repeat(7,1fr);height:180px;overflow-y:auto;padding:6px 8px 10px;align-content:start}" +
    "#layoutChat .llc-grid button{border:none;background:none;font-size:25px;padding:7px 0;border-radius:12px}" +
    "#layoutChat .llc-grid button:active{background:#EDE9FE}" +
    "#layoutChat .llc-bar{flex:0 0 auto;padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px))}" +
    "#layoutChat .llc-pill{display:flex;align-items:center;gap:2px;background:#fff;border-radius:30px;padding:5px 5px 5px 6px;box-shadow:0 6px 20px rgba(59,7,100,.18)}" +
    "#layoutChat .llc-ib{flex:0 0 auto;width:38px;height:38px;border:none;background:none;border-radius:50%;font-size:20px}" +
    "#layoutChat .llc-ib.on{background:#EDE9FE}" +
    "#layoutChat .llc-in{flex:1;min-width:0;border:none;background:none;padding:10px 6px;font-size:16px;color:#1F1B2E;outline:none}" +
    "#layoutChat .llc-in::placeholder{color:#9A97AD}" +
    "#layoutChat .llc-send{flex:0 0 auto;width:44px;height:44px;border:none;border-radius:50%;background:linear-gradient(135deg,#FF8A00,#F25C05);box-shadow:0 4px 12px rgba(242,92,5,.45);color:#fff;font-size:17px;font-weight:700;transition:transform .15s,opacity .2s}" +
    "#layoutChat .llc-send.off{opacity:.45;box-shadow:none}" +
    "#layoutChat .llc-send:active{transform:scale(.9)}" +
    "#llcSheet{position:fixed;inset:0;z-index:75;background:rgba(0,0,0,.5);display:flex;align-items:flex-end}" +
    "#llcSheet .llc-card{width:100%;background:#fff;border-radius:28px 28px 0 0;padding:12px 18px calc(20px + env(safe-area-inset-bottom,0px))}" +
    "#llcSheet .llc-handle{width:44px;height:5px;border-radius:3px;background:#DDD6FE;margin:0 auto 16px}" +
    "#llcSheet h3{font-size:19px;color:#1F1B2E;margin-bottom:14px}" +
    "#llcSheet button{display:flex;align-items:center;gap:14px;width:100%;text-align:left;border:1px solid #EDE9FE;background:#F6F4FB;border-radius:20px;padding:12px 14px;font-size:15px;font-weight:800;color:#1F1B2E;margin-bottom:10px;font-family:inherit}" +
    "#llcSheet button small{display:block;font-weight:500;color:#6B6880;font-size:12px;margin-top:2px}" +
    "#llcSheet .llc-si{flex:0 0 auto;width:46px;height:46px;border-radius:50%;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-size:23px}" +
    "#llcSheet button.llc-can{justify-content:center;color:#6B6880;background:#F1F5F9;border:none}" +
    "#llcViewer{position:fixed;inset:0;z-index:80;background:#000;display:flex;align-items:center;justify-content:center}" +
    "#llcViewer img{max-width:100%;max-height:100%}" +
    "#btnAbrirChat{display:flex;align-items:center;gap:8px;padding:6px 14px 6px 6px!important;background:linear-gradient(135deg,#FF8A00,#F25C05)!important;color:#fff!important;border-radius:26px!important;font-size:14px;font-weight:800;box-shadow:0 6px 18px rgba(242,92,5,.5)!important}" +
    "#btnAbrirChat .llc-bico{width:32px;height:32px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:17px}" +
    "#btnAbrirChat .llc-badge{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#EF4444;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;animation:llcPulse 1.2s ease-in-out infinite}" +
    "@keyframes llcPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}";
  document.head.appendChild(css);

  // ---------- pantalla ----------
  var bd = document.createElement("div"); bd.id = "llcBd"; bd.className = "hidden"; document.body.appendChild(bd);

  var el = document.createElement("div");
  el.id = "layoutChat"; el.className = "hidden";
  el.innerHTML =
    '<div class="llc-top"><button type="button" class="llc-back" id="llcBack">❮</button><div class="llc-av">🛵</div>' +
    '<div class="llc-ttl"><div class="llc-tit" id="llcRep">Tu repartidor</div><div class="llc-sub">En línea • Pedido en curso</div></div></div>' +
    '<div class="llc-sug" id="llcSug"></div>' +
    '<div class="llc-msgs" id="llcMsgs"></div>' +
    '<div class="llc-emo hidden" id="llcEmo"><div class="llc-cats" id="llcCats"></div><div class="llc-grid" id="llcGrid"></div></div>' +
    '<div class="llc-bar"><div class="llc-pill"><button type="button" class="llc-ib" id="llcEmoBtn">😊</button><button type="button" class="llc-ib" id="llcFoto">📷</button>' +
    '<input class="llc-in" id="llcIn" type="text" placeholder="Escribe un mensaje..." enterkeyhint="send" autocomplete="off" />' +
    '<button type="button" class="llc-send off" id="llcSend">➤</button></div></div>';
  document.body.appendChild(el);

  var sheet = document.createElement("div");
  sheet.id = "llcSheet"; sheet.className = "hidden";
  sheet.innerHTML =
    '<div class="llc-card"><div class="llc-handle"></div><h3>Adjuntar imagen</h3>' +
    '<button type="button" id="llcCam"><span class="llc-si">📸</span><span>Tomar foto<small>Captura una imagen con la cámara</small></span></button>' +
    '<button type="button" id="llcGal"><span class="llc-si">🖼️</span><span>Galería de fotos<small>Elige una foto de tu teléfono</small></span></button>' +
    '<button type="button" class="llc-can" id="llcCan">CANCELAR</button></div>';
  document.body.appendChild(sheet);

  var inCam = document.createElement("input"); inCam.type = "file"; inCam.accept = "image/*"; inCam.setAttribute("capture", "environment"); inCam.style.display = "none";
  var inGal = document.createElement("input"); inGal.type = "file"; inGal.accept = "image/*"; inGal.style.display = "none";
  document.body.appendChild(inCam); document.body.appendChild(inGal);

  SUG.forEach(function (t) {
    var b = document.createElement("button"); b.type = "button"; b.className = "llc-chip"; b.textContent = t;
    b.onclick = function () { enviarTexto(t); };
    $("llcSug").appendChild(b);
  });

  // ---------- firestore ----------
  function chatRef() { return db.collection("restaurantes").doc(curRest).collection("pedidos").doc(curPed).collection("chat"); }
  function nombreMio() { try { return miNombre || "Cliente"; } catch (e) { return "Cliente"; } }

  function enviarTexto(t) {
    t = String(t || "").trim(); if (!t || !curPed) return;
    chatRef().add({ remitente: "cliente", remitente_nombre: nombreMio(), texto: t, visto: false, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(function () { aviso("No se pudo enviar el mensaje"); });
  }

  function procesarArchivo(file) {
    if (!file || !curPed) return;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1024, w = img.width, h = img.height;
        if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        var b = cv.toDataURL("image/jpeg", 0.85);
        if (b.length > 1000000) b = cv.toDataURL("image/jpeg", 0.65);
        chatRef().add({ remitente: "cliente", remitente_nombre: nombreMio(), imagen_base64: b.split(",")[1], visto: false, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
          .catch(function () { aviso("No se pudo enviar la imagen"); });
      };
      img.onerror = function () { aviso("Error procesando imagen"); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  // ---------- mensajes (sin repintar todo) ----------
  function scrollBottom() { var b = $("llcMsgs"); if (b) b.scrollTop = b.scrollHeight; }

  function crearNodo(d, yo) {
    var row = document.createElement("div"); row.className = "llc-row" + (yo ? " yo" : "");
    var bub = document.createElement("div"); bub.className = "llc-bub";
    if (!yo) { var nm = document.createElement("div"); nm.className = "llc-nom"; nm.textContent = d.remitente_nombre || d.nombre || "Repartidor"; bub.appendChild(nm); }
    var txt = d.texto || d.mensaje || "";
    if (txt) { var sp = document.createElement("span"); sp.textContent = txt; bub.appendChild(sp); }
    if (d.imagen_base64) {
      var im = document.createElement("img"); im.alt = ""; im.src = "data:image/jpeg;base64," + d.imagen_base64;
      im.onload = function () { if (row._near) scrollBottom(); };
      bub.appendChild(im);
    }
    var meta = document.createElement("div"); meta.className = "llc-meta";
    var tm = document.createElement("span"); tm.className = "llc-time"; meta.appendChild(tm);
    if (yo) { var tk = document.createElement("span"); tk.className = "llc-tick"; meta.appendChild(tk); }
    bub.appendChild(meta); row.appendChild(bub);
    return row;
  }

  function actualizarMeta(row, doc, d, yo) {
    var tm = row.querySelector(".llc-time"); if (tm) { var h = hora(d); if (tm.textContent !== h) tm.textContent = h; }
    if (!yo) return;
    var tk = row.querySelector(".llc-tick"); if (!tk) return;
    var pend = doc.metadata.hasPendingWrites, ok = !pend && d.visto === true;
    var t = pend ? "✓" : "✓✓";
    if (tk.textContent !== t) tk.textContent = t;
    tk.classList.toggle("ok", ok);
  }

  function render(docs) {
    var box = $("llcMsgs");
    var near = primera || (box.scrollHeight - box.scrollTop - box.clientHeight < 140);
    if (!docs.length) { if (!box.querySelector(".llc-vacio")) box.innerHTML = VACIO; return; }
    var v = box.querySelector(".llc-vacio"); if (v) v.remove();
    var ids = {};
    docs.forEach(function (doc) {
      ids[doc.id] = 1;
      var d = doc.data(), yo = d.remitente === "cliente", n = nodes[doc.id];
      if (!n) {
        n = crearNodo(d, yo); n._near = near; nodes[doc.id] = n;
        if (!primera) n.classList.add("llc-new");
        box.appendChild(n);
      }
      actualizarMeta(n, doc, d, yo);
      if (!yo && d.visto !== true && chatOpen) { try { doc.ref.update({ visto: true }); } catch (e) {} }
    });
    Object.keys(nodes).forEach(function (k) { if (!ids[k]) { nodes[k].remove(); delete nodes[k]; } });
    primera = false;
    if (near) { scrollBottom(); setTimeout(scrollBottom, 80); }
  }

  function startChat() {
    stopChat();
    chatUnsub = chatRef().orderBy("timestamp", "asc").onSnapshot(function (snap) {
      var docs = snap.docs;
      if (prevCount !== -1 && docs.length > prevCount) {
        var last = docs[docs.length - 1].data();
        if (last.remitente === "repartidor") beep();
      }
      prevCount = docs.length;
      render(docs);
    }, function () {});
  }
  function stopChat() { if (chatUnsub) { chatUnsub(); chatUnsub = null; } prevCount = -1; }

  // ---------- botón del seguimiento ----------
  function paintBtn() {
    var b = $("btnAbrirChat"); if (!b) return;
    b.classList.toggle("hidden", !asignado);
    var key = asignado + "|" + unread;
    if (key === lastKey) return;
    lastKey = key;
    b.innerHTML = '<span class="llc-bico">💬</span><span>Chat</span>' + (unread > 0 ? '<span class="llc-badge">' + (unread > 99 ? "99+" : unread) + "</span>" : "");
  }

  function startUnread() {
    stopUnread();
    unreadUnsub = chatRef().where("remitente", "==", "repartidor").where("visto", "==", false).onSnapshot(function (snap) {
      var n = snap.size;
      if (prevUnread !== -1 && n > prevUnread && !chatOpen) beep();
      prevUnread = n; unread = n; paintBtn();
    }, function () {});
  }
  function stopUnread() { if (unreadUnsub) { unreadUnsub(); unreadUnsub = null; } prevUnread = -1; unread = 0; }

  function pintarRep() { var r = $("llcRep"); if (r) r.textContent = repName || "Tu repartidor"; }

  function startWatch() {
    stopWatch();
    var ped, rest;
    try { ped = pedidoActivoId; rest = restIdSeleccionadoTemp; } catch (e) {}
    if (!ped || !rest) return;
    curPed = ped; curRest = rest;
    orderUnsub = db.collection("restaurantes").doc(rest).collection("pedidos").doc(ped).onSnapshot(function (doc) {
      if (!doc.exists || ped !== curPed) return;
      var rn = String((doc.data() || {}).repartidor_nombre || "").trim();
      var a = rn !== "" && !/^buscando/i.test(rn);
      repName = a ? rn : ""; pintarRep();
      if (a !== asignado) { asignado = a; if (a) startUnread(); else stopUnread(); }
      paintBtn();
    }, function () {});
  }
  function stopWatch() {
    if (orderUnsub) { orderUnsub(); orderUnsub = null; }
    stopUnread(); asignado = false; curPed = ""; curRest = ""; repName = ""; lastKey = "";
  }

  // ---------- abrir / cerrar ----------
  function llcFit() {
    if (!chatOpen) return;
    var vv = window.visualViewport;
    var h = Math.round(vv ? vv.height : window.innerHeight), t = Math.round(vv ? vv.offsetTop : 0);
    if (h === lastH && t === lastT) return;
    lastH = h; lastT = t;
    el.style.height = h + "px"; el.style.top = t + "px";
    scrollBottom();
  }
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", llcFit); window.visualViewport.addEventListener("scroll", llcFit); }

  function pintarEmojis() {
    var cats = $("llcCats"), grid = $("llcGrid"); cats.innerHTML = ""; grid.innerHTML = "";
    CATS.forEach(function (n, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "llc-cat" + (i === catIdx ? " on" : ""); b.textContent = n;
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
      b.onclick = function () { catIdx = i; pintarEmojis(); };
      cats.appendChild(b);
    });
    EMOJIS[catIdx].forEach(function (em) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = em;
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.onclick = function () {
        var i = $("llcIn"), s = i.selectionStart == null ? i.value.length : i.selectionStart, en = i.selectionEnd == null ? s : i.selectionEnd;
        i.value = i.value.slice(0, s) + em + i.value.slice(en);
        try { i.setSelectionRange(s + em.length, s + em.length); } catch (x) {}
        actualizarSend();
      };
      grid.appendChild(b);
    });
  }

  function cerrarEmojis() { emojiOpen = false; $("llcEmo").classList.add("hidden"); $("llcEmoBtn").classList.remove("on"); }
  function actualizarSend() { $("llcSend").classList.toggle("off", !$("llcIn").value.trim()); }

  function abrirChat() {
    if (!curPed || !curRest) { aviso("Pedido aún no disponible para chat"); return; }
    chatOpen = true; primera = true; nodes = {}; lastH = -1; lastT = -1;
    document.body.classList.add("llc-open");
    bd.classList.remove("hidden"); el.classList.remove("hidden");
    $("llcMsgs").innerHTML = "";
    pintarRep(); llcFit(); startChat();
  }
  function cerrarChat() {
    var estabaAbierto = chatOpen;
    chatOpen = false; stopChat(); nodes = {}; primera = true;
    document.body.classList.remove("llc-open");
    el.classList.add("hidden"); bd.classList.add("hidden"); sheet.classList.add("hidden");
    cerrarEmojis();
    el.style.height = "100%"; el.style.top = "0";
    if (estabaAbierto) $("llcIn").blur();
  }

  $("llcBack").onclick = cerrarChat;
  $("llcSend").addEventListener("pointerdown", function (e) { e.preventDefault(); });
  $("llcSend").onclick = function () { var i = $("llcIn"); if (!i.value.trim()) return; enviarTexto(i.value); i.value = ""; actualizarSend(); };
  $("llcIn").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("llcSend").click(); } });
  $("llcIn").addEventListener("input", actualizarSend);
  $("llcIn").addEventListener("focus", cerrarEmojis);
  $("llcEmoBtn").onclick = function () {
    if (emojiOpen) { cerrarEmojis(); return; }
    $("llcIn").blur();
    emojiOpen = true; $("llcEmo").classList.remove("hidden"); $("llcEmoBtn").classList.add("on");
    pintarEmojis(); setTimeout(scrollBottom, 60);
  };
  $("llcFoto").onclick = function () { sheet.classList.remove("hidden"); };
  $("llcCan").onclick = function () { sheet.classList.add("hidden"); };
  sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.classList.add("hidden"); });
  $("llcCam").onclick = function () { sheet.classList.add("hidden"); inCam.click(); };
  $("llcGal").onclick = function () { sheet.classList.add("hidden"); inGal.click(); };
  inCam.onchange = function () { procesarArchivo(inCam.files[0]); inCam.value = ""; };
  inGal.onchange = function () { procesarArchivo(inGal.files[0]); inGal.value = ""; };
  $("llcMsgs").addEventListener("click", function (e) {
    if (e.target.tagName !== "IMG") return;
    var v = document.createElement("div"); v.id = "llcViewer";
    v.innerHTML = '<img src="' + e.target.src + '" alt="">';
    v.onclick = function () { v.remove(); };
    document.body.appendChild(v);
  });

  var btn = $("btnAbrirChat");
  if (btn) btn.addEventListener("click", abrirChat);

  // ---------- engancharse a la pantalla de seguimiento ----------
  var seg = $("layoutSeguimiento");
  function sync() {
    var visible = seg && !seg.classList.contains("hidden");
    if (visible) {
      var ped = ""; try { ped = pedidoActivoId; } catch (e) {}
      if (!orderUnsub || ped !== curPed) startWatch();
    } else { cerrarChat(); stopWatch(); }
  }
  if (seg) { new MutationObserver(sync).observe(seg, { attributes: true, attributeFilter: ["class"] }); sync(); }
})();
/* llc-fin */
