# Llevari Web (versión para iPhone y cualquier navegador)

Réplica web de la app de clientes. Usa el mismo proyecto Firebase (Auth + Firestore), así que
clientes, locales, tarifas, pedidos y chat son los mismos que en Android.

## 1. Poner tu configuración de Firebase
1. Firebase Console > proyecto **llevari** > ⚙️ Configuración del proyecto > General.
2. En "Tus apps" toca **Agregar app > Web (</>)**, ponle nombre "Llevari Web".
3. Copia el objeto `firebaseConfig` y pégalo en `firebase-config.js`.

## 2. Publicar con Firebase Hosting (desde la terminal de AndroidIDE)
```
cd ~/llevari-web
firebase login            # solo si no tienes sesión
firebase init hosting     # elige tu proyecto llevari; carpeta pública: .  ; NO sobrescribir index.html
firebase deploy --only hosting
```
Te dará una URL tipo `https://llevari.web.app`. Esa es la que abren en el iPhone.

## 3. Instalarla en el iPhone
Safari > abrir la URL > botón Compartir > **Agregar a pantalla de inicio**.

## 4. Revisar en Firebase
- Authentication > Configuración > Dominios autorizados: debe estar `llevari.web.app` (se agrega solo).
- Las reglas de Firestore son las mismas de Android; si las tienes restringidas, deben permitir
  lo mismo al cliente autenticado.

## Lo que hay que verificar (supuestos)
El código de MainActivity que enviaste llegaba cortado, así que algunos nombres se dedujeron.
Si algo no coincide, se cambia en `app.js`:
- Menú de cada local: busca en las subcolecciones `menu`, `platos`, `productos` o `menus`
  (lista `SUBCOLECCIONES_MENU`) y acepta campos `nombre/precio/descripcion/imagen/opciones`.
- Perfil del cliente: se busca en `clientes` por el campo `correo` (o `email`).
- Campos extra del pedido (repartidor_nombre, repartidor_lat, total, items...) son estimados.
