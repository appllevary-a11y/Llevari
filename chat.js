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

  var catIdx = 0, emojiOpen = false, chatOpen = false, asignado = false;
  var chatUnsub = null, unreadUnsub = null, orderUnsub = null;
  var prevCount = -1, prevUnread = -1, unread = 0, curPed = "", curRest = "";

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
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

  // ---------- estilos ----------
  var css = document.createElement("style");
  css.textContent =
    "#layoutChat{position:fixed;left:0;right:0;top:0;height:100%;z-index:70;background:#F8FAFC;display:flex;flex-direction:column}" +
    "#layoutChat .llc-top{display:flex;align-items:center;gap:10px;background:#fff;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 12px;box-shadow:0 2px 10px rgba(59,7,100,.12)}" +
    "#layoutChat .llc-back{border:none;background:#F1EEFA;border-radius:50%;width:40px;height:40px;font-size:17px;font-weight:700;color:#1F1B2E}" +
    "#layoutChat .llc-tit{font-size:17px;font-weight:700;color:#0F172A}" +
    "#layoutChat .llc-sub{font-size:12px;color:#64748B}" +
    "#layoutChat .llc-sug{display:flex;gap:8px;overflow-x:auto;background:#fff;padding:10px 12px;box-shadow:0 2px 6px rgba(0,0,0,.05)}" +
    "#layoutChat .llc-chip{flex:0 0 auto;border:1px solid #CBD5E1;background:#fff;color:#0F172A;border-radius:18px;padding:8px 14px;font-size:13px;font-weight:600}" +
    "#layoutChat .llc-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}" +
    "#layoutChat .llc-vacio{margin:auto;text-align:center;color:#6B6880;font-size:14px}" +
    "#layoutChat .llc-row{display:flex}" +
    "#layoutChat .llc-row.yo{justify-content:flex-end}" +
    "#layoutChat .llc-bub{max-width:78%;border-radius:16px;padding:10px 12px;font-size:15px;color:#0F172A;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);word-wrap:break-word;white-space:pre-wrap}" +
    "#layoutChat .llc-row.yo .llc-bub{background:#EFF6FF}" +
    "#layoutChat .llc-nom{font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:2px}" +
    "#layoutChat .llc-bub img{display:block;max-width:220px;max-height:260px;border-radius:10px;margin-top:4px}" +
    "#layoutChat .llc-tick{text-align:right;font-size:13px;margin-top:3px;color:#94A3B8}" +
    "#layoutChat .llc-tick.ok{color:#2563EB;font-weight:700}" +
    "#layoutChat .llc-emo{background:#fff;border-top:1px solid #E2E8F0}" +
    "#layoutChat .llc-cats{display:flex;gap:6px;padding:8px;background:#F8FAFC}" +
    "#layoutChat .llc-cat{flex:1;border:none;border-radius:16px;padding:8px 4px;font-size:12px;font-weight:700;background:#fff;color:#64748B}" +
    "#layoutChat .llc-cat.on{background:#EDE9FE;color:#7C3AED}" +
    "#layoutChat .llc-grid{display:grid;grid-template-columns:repeat(7,1fr);height:190px;overflow-y:auto;padding:8px;align-content:start}" +
    "#layoutChat .llc-grid button{border:none;background:none;font-size:24px;padding:6px 0}" +
    "#layoutChat .llc-bar{display:flex;align-items:center;gap:8px;background:#fff;padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 14px rgba(0,0,0,.06)}" +
    "#layoutChat .llc-ib{flex:0 0 auto;width:42px;height:42px;border:none;border-radius:50%;background:#F1F5F9;font-size:18px}" +
    "#layoutChat .llc-ib.on{background:#EDE9FE}" +
    "#layoutChat .llc-in{flex:1;min-width:0;border:none;background:#F1F5F9;border-radius:22px;padding:11px 16px;font-size:16px;color:#0F172A;outline:none}" +
    "#layoutChat .llc-send{flex:0 0 auto;width:44px;height:44px;border:none;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:18px;font-weight:700}" +
    "#llcSheet{position:fixed;inset:0;z-index:75;background:rgba(0,0,0,.5);display:flex;align-items:flex-end}" +
    "#llcSheet .llc-card{width:100%;background:#fff;border-radius:26px 26px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px))}" +
    "#llcSheet h3{font-size:19px;color:#0F172A;margin-bottom:14px}" +
    "#llcSheet button{display:block;width:100%;text-align:left;border:1px solid #E2E8F0;background:#F8FAFC;border-radius:18px;padding:14px 16px;font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px}" +
    "#llcSheet button small{display:block;font-weight:400;color:#64748B;font-size:12px;margin-top:2px}" +
    "#llcSheet button.llc-can{text-align:center;color:#64748B;background:#F1F5F9;border:none}" +
    "#llcViewer{position:fixed;inset:0;z-index:80;background:#000;display:flex;align-items:center;justify-content:center}" +
    "#llcViewer img{max-width:100%;max-height:100%}";
  document.head.appendChild(css);

  // ---------- pantalla ----------
  var el = document.createElement("div");
  el.id = "layoutChat"; el.className = "hidden";
  el.innerHTML =
    '<div class="llc-top"><button class="llc-back" id="llcBack">❮</button><div><div class="llc-tit">Chat con Repartidor</div><div class="llc-sub">Pedido en curso</div></div></div>' +
    '<div class="llc-sug" id="llcSug"></div>' +
    '<div class="llc-msgs" id="llcMsgs"></div>' +
    '<div class="llc-emo hidden" id="llcEmo"><div class="llc-cats" id="llcCats"></div><div class="llc-grid" id="llcGrid"></div></div>' +
    '<div class="llc-bar"><button class="llc-ib" id="llcFoto">📷</button><button class="llc-ib" id="llcEmoBtn">😊</button>' +
    '<input class="llc-in" id="llcIn" type="text" placeholder="Mensaje..." enterkeyhint="send" autocomplete="off" />' +
    '<button class="llc-send" id="llcSend">➤</button></div>';
  document.body.appendChild(el);

  var sheet = document.createElement("div");
  sheet.id = "llcSheet"; sheet.className = "hidden";
  sheet.innerHTML =
    '<div class="llc-card"><h3>Adjuntar imagen</h3>' +
    '<button id="llcCam">📸 Tomar foto<small>Captura una imagen con la cámara</small></button>' +
    '<button id="llcGal">🖼️ Galería de fotos<small>Elige una foto de tu teléfono</small></button>' +
    '<button class="llc-can" id="llcCan">CANCELAR</button></div>';
  document.body.appendChild(sheet);

  var inCam = document.createElement("input"); inCam.type = "file"; inCam.accept = "image/*"; inCam.setAttribute("capture", "environment"); inCam.style.display = "none";
  var inGal = document.createElement("input"); inGal.type = "file"; inGal.accept = "image/*"; inGal.style.display = "none";
  document.body.appendChild(inCam); document.body.appendChild(inGal);

  // sugerencias
  SUG.forEach(function (t) {
    var b = document.createElement("button"); b.className = "llc-chip"; b.textContent = t;
    b.onclick = function () { enviarTexto(t); };
    $("llcSug").appendChild(b);
  });

  // ---------- firestore ----------
  function chatRef() { return db.collection("restaurantes").doc(curRest).collection("pedidos").doc(curPed).collection("chat"); }

  function enviarTexto(t) {
    t = String(t || "").trim(); if (!t || !curPed) return;
    chatRef().add({ remitente: "cliente", remitente_nombre: (typeof miNombre !== "undefined" && miNombre) || "Cliente", texto: t, visto: false, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
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
        chatRef().add({ remitente: "cliente", remitente_nombre: (typeof miNombre !== "undefined" && miNombre) || "Cliente", imagen_base64: b.split(",")[1], visto: false, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
          .catch(function () { aviso("No se pudo enviar la imagen"); });
      };
      img.onerror = function () { aviso("Error procesando imagen"); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  function render(docs) {
    var box = $("llcMsgs");
    if (!docs.length) { box.innerHTML = '<div class="llc-vacio">Escríbele a tu repartidor 👋</div>'; return; }
    var h = "";
    docs.forEach(function (doc) {
      var d = doc.data(), yo = d.remitente === "cliente";
      var txt = d.texto || d.mensaje || "", nom = d.remitente_nombre || d.nombre || "Repartidor";
      var tick = "";
      if (yo) {
        if (doc.metadata.hasPendingWrites) tick = '<div class="llc-tick">✓</div>';
        else if (d.visto === true) tick = '<div class="llc-tick ok">✓✓</div>';
        else tick = '<div class="llc-tick">✓✓</div>';
      }
      h += '<div class="llc-row' + (yo ? " yo" : "") + '"><div class="llc-bub">' +
        (yo ? "" : '<div class="llc-nom">' + esc(nom) + "</div>") +
        (txt ? esc(txt) : "") +
        (d.imagen_base64 ? '<img src="data:image/jpeg;base64,' + d.imagen_base64 + '" alt="">' : "") +
        tick + "</div></div>";
      if (!yo && d.visto !== true && chatOpen) { try { doc.ref.update({ visto: true }); } catch (e) {} }
    });
    box.innerHTML = h;
    setTimeout(function () { box.scrollTop = box.scrollHeight; }, 50);
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

  function paintBtn() {
    var b = $("btnAbrirChat"); if (!b) return;
    b.classList.toggle("hidden", !asignado);
    b.textContent = unread > 0 ? "💬 Chat Repartidor (" + unread + ")" : "💬 Chat Repartidor";
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
      if (a !== asignado) { asignado = a; if (a) startUnread(); else stopUnread(); }
      paintBtn();
    }, function () {});
  }
  function stopWatch() {
    if (orderUnsub) { orderUnsub(); orderUnsub = null; }
    stopUnread(); asignado = false; curPed = ""; curRest = "";
  }

  // ---------- abrir / cerrar ----------
  function fit() {
    var vv = window.visualViewport; if (!vv || !chatOpen) return;
    el.style.height = vv.height + "px"; el.style.top = vv.offsetTop + "px";
  }
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit); }

  function pintarEmojis() {
    var cats = $("llcCats"), grid = $("llcGrid"); cats.innerHTML = ""; grid.innerHTML = "";
    CATS.forEach(function (n, i) {
      var b = document.createElement("button"); b.className = "llc-cat" + (i === catIdx ? " on" : ""); b.textContent = n;
      b.onclick = function () { catIdx = i; pintarEmojis(); };
      cats.appendChild(b);
    });
    EMOJIS[catIdx].forEach(function (e) {
      var b = document.createElement("button"); b.textContent = e;
      b.onclick = function () { var i = $("llcIn"); i.value += e; i.focus(); };
      grid.appendChild(b);
    });
  }

  function abrirChat() {
    if (!curPed || !curRest) { aviso("Pedido aún no disponible para chat"); return; }
    chatOpen = true; el.classList.remove("hidden"); fit();
    $("llcMsgs").innerHTML = '<div class="llc-vacio">Cargando…</div>';
    startChat();
  }
  function cerrarChat() {
    chatOpen = false; stopChat();
    el.classList.add("hidden"); sheet.classList.add("hidden");
    emojiOpen = false; $("llcEmo").classList.add("hidden"); $("llcEmoBtn").classList.remove("on");
    el.style.height = "100%"; el.style.top = "0";
  }

  $("llcBack").onclick = cerrarChat;
  $("llcSend").onclick = function () { var i = $("llcIn"); enviarTexto(i.value); i.value = ""; };
  $("llcIn").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("llcSend").click(); } });
  $("llcEmoBtn").onclick = function () {
    emojiOpen = !emojiOpen;
    $("llcEmo").classList.toggle("hidden", !emojiOpen);
    $("llcEmoBtn").classList.toggle("on", emojiOpen);
    if (emojiOpen) pintarEmojis();
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
