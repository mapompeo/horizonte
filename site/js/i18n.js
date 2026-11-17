/* Idiomas do site: o português fica no próprio HTML; aqui ficam o inglês e o espanhol. Script clássico, carregado antes
   dos outros porque js/scenes.js quebra o título do hero em palavras e precisa do texto já no idioma certo. */
(function (root) {
  'use strict'
  var LANGS = ['pt', 'en', 'es']
  var HTML_LANG = { pt: 'pt-BR', en: 'en', es: 'es' }
  var DICT = {
    en: {
    "meta.title": "Horizonte: wireless monitor and second screen for your laptop and phone",
    "meta.desc": "Free wireless monitor: use a laptop, tablet or phone as a second screen for your PC. No cables, no setup. Windows, macOS, Linux and browser.",
    "meta.ogTitle": "Horizonte: your second screen, wireless",
    "meta.ogDesc": "Laptop, tablet or phone become a second screen for your computer. No cables, nothing to set up, free.",
    "meta.twDesc": "Laptop, tablet or phone become a second screen for your computer. No cables, free.",
    "og.alt": "Horizonte: laptop, tablet and phone as a second screen for your PC",
    "nav.aria": "Sections",
    "hero.appAria": "Horizonte at work. Click to try it.",
    "app.aria": "Interactive Horizonte demo",
    "recap.aria": "Horizonte summary",
    "nav.news": "What's new",
    "nav.how": "How it works",
    "nav.features": "Features",
    "download": "Download",
    "support": "Support",
    "pill.new": "New",
    "pill.text": "Multiple screens at once",
    "hero.l1": "Your second screen.",
    "hero.l2": "Wireless.",
    "hero.lede": "Use your laptop, tablet or phone as a wireless monitor for your PC. Free and open source.",
    "hero.cta": "Download free",
    "hero.github": "View on GitHub",
    "hero.f1": "Free and open source",
    "hero.f2": "Linux, Windows and macOS",
    "hero.f3": "Updates itself",
    "works.l": "Works with",
    "works.notebook": "Laptop",
    "works.desktop": "Desktop",
    "works.tablet": "Tablet",
    "works.browser": "Browser",
    "demo.label": "Interactive demo",
    "demo.restart": "Restart",
    "demo.connect": "Request connection",
    "spec.a": "Version",
    "spec.b": "· Windows, Linux and macOS · open source, GPL-3.0",
    "open": "Open source",
    "statement": "The laptop or tablet sitting on your desk can be a second screen right now.",
    "story.h1": "One QR code.",
    "story.h2": "Nothing to set up.",
    "dev.desktop": "Desktop · sends",
    "dev.laptop": "Laptop · receives",
    "dev.tablet": "Tablet · browser",
    "win.title": "Meeting notes",
    "cap.1.h": "Open Horizonte.",
    "cap.1.p": "The QR code is already there. Nothing to choose, nothing to set up.",
    "cap.2.h": "Point the camera.",
    "cap.2.p": "On a phone or tablet, the screen opens in the browser. You allow it once and that is it.",
    "cap.3.h": "Another computer? Receive.",
    "cap.3.p": "It finds this one by itself on the local network, no account needed.",
    "cap.4.h": "Drag the window sideways.",
    "cap.4.p": "The other device becomes an extension of your screen. Just move the window to the edge.",
    "cap.5.h": "As many devices as you like.",
    "cap.5.p": "Each with its own screen. The list shows who is connected, and the QR code stays there for the next one.",
    "hint.scroll": "Scroll to continue",
    "nov.tag": "New in",
    "nov.title": "Multiple screens.<br />At the same time.",
    "nov.lede": "Laptop, tablet and phone together, each with its own extended screen. Drag each one to where it sits on your desk.",
    "stat.many": "many",
    "stat.enc": "encrypted",
    "nov.1.h": "Wireless screens",
    "nov.1.p": "Every device gets a monitor of its own. Whoever joins later doesn't kick anyone out.",
    "nov.2.h": "Cursor without lag",
    "nov.2.p": "The pointer is drawn right on the other device, without waiting for the video.",
    "nov.3.h": "Instant video",
    "nov.3.p": "Each frame shows up as soon as it arrives, with no waiting queue.",
    "nov.4.h": "Mouse with no extra software",
    "nov.4.p": "Mouse and keyboard move from one computer to the other across the screen edge. Straight over the local network, encrypted.",
    "nov.5.h": "Phone in one tap",
    "nov.5.p": "Point the camera at the code on the screen and the page opens already connecting.",
    "nov.6.h": "Always up to date",
    "nov.6.p": "New versions arrive on their own. One click and the app restarts updated.",
    "nov.all": "All versions ›",
    "mx.h1": "Wireless monitor between",
    "mx.h2": "Windows, Linux and macOS.",
    "mx.send": "sends",
    "mx.recv": "receives",
    "radar.h1": "It finds the other",
    "radar.h2": "by itself.",
    "radar.p": "Over the local network, no account needed. Discovery is automatic; if needed, connect by IP. Whoever sends just clicks Allow.",
    "bento.h": "Everything in place.",
    "f.monitor": "Virtual monitor",
    "f.monitor.p": "Created automatically.",
    "f.copy": "Copy and paste",
    "f.copy.p": "Text, images and files.",
    "f.theme": "Light and dark theme",
    "f.theme.p": "Follows the system, or pick it in Settings.",
    "f.screens": "Multiple screens",
    "f.screens.p": "Each device in its own position.",
    "f.local": "Local network only",
    "f.local.p": "Nothing leaves your home.",
    "f.open.p": "GPL-3.0, free.",
    "num.accounts": "accounts",
    "num.qr": "QR code",
    "num.1": "up to 60 frames per second on the extended screen",
    "num.2": "to create: no cloud and no sign-up in the way",
    "num.3": "from the open app to the second screen",
    "val.1": "No account.",
    "val.2": "No cloud.",
    "val.3": "No setup.",
    "val.p": "The two computers talk directly over your network. On all three systems, Horizonte itself streams the image using WebRTC. On top, a window that only asks for what matters.",
    "rc.any": "Any system",
    "rc.finds": "Finds it on its own",
    "rc.connects": "Finds and connects",
    "rc.free": "Free, GPL-3.0",
    "rc.zero": "$0",
    "rc.diag": "One-click diagnostics",
    "rc.nocloud": "No cloud",
    "rc.fps": "Up to 60 fps",
    "usos.h": "Use your tablet, phone or laptop as a monitor",
    "usos.1.h": "Tablet and iPad",
    "usos.1.p": "Point the camera at the QR code. Nothing to install.",
    "usos.2.h": "Android phone and iPhone",
    "usos.2.p": "Landscape or portrait, just rotate. Works on Android and iPhone.",
    "usos.3.h": "Another laptop or PC",
    "usos.3.p": "Install on both and tap Receive. No account.",
    "dl.h": "Download Horizonte.",
    "dl.lede": "Install it on both computers. The latest version is always on GitHub.",
    "dl.ok": "Available",
    "dl.test": "In testing",
    "dl.meta.win": "Installer .exe · 110 MB<br />Windows 10 and 11",
    "dl.meta.mac": "Apple chip and Intel chip · .dmg",
    "dl.arm": "Download for Apple chip (ARM64)",
    "dl.x64": "Download for Intel chip (x64)",
    "copy.label": "Copy",
    "dl.term": "In the folder where the file was downloaded. After that, it updates itself.",
    "dl.you": "Your system",
    "dl.guidance": "On this device there is nothing to install: on the computer running Horizonte, point the camera at the QR code and the second screen opens in the browser.",
    "dl.release": "See the release page",
    "file.exe": "Installer .exe",
    "file.macArm": "Mac with Apple chip (.dmg)",
    "file.macX64": "Mac with Intel chip (.dmg)",
    "copy.done": "Copied",
    "copy.fail": "Select and copy",
    "iframe.host": "Connect to Desktop",
    "iframe.live": "Horizonte at work. Click to try it.",
    "faq.h": "Frequently asked questions.",
    "faq.1.q": "How do I use a laptop, tablet or phone as a wireless monitor?",
    "faq.1.a": "Install Horizonte on your computer and open it. On a phone or tablet, point the camera at the QR code: the extended screen opens in the browser, with nothing to install. On another computer, open Horizonte and choose Receive.",
    "faq.2.q": "What do I need for it to work?",
    "faq.2.a": "Two computers on the same network, preferably 5 GHz Wi-Fi or a cable. On the computer that sends, a graphics card keeps the image light, but the app uses the processor if it has to.",
    "faq.3.q": "Why do Windows and macOS show a warning during installation?",
    "faq.3.a": "Because the installer does not have a digital signature yet, which is paid. On Windows, click More info and then Run anyway. On a Mac, after dragging it to Applications, run <code>xattr -cr /Applications/Horizonte.app</code> once in Terminal. The code is open and on GitHub for anyone who wants to check it.",
    "faq.4.q": "How many screens can I connect?",
    "faq.4.a": "As many as your computer and network can handle: laptop, tablet and phone together, each with its own extended screen. You drag each one to where it sits on your desk.",
    "faq.5.q": "Does it work on iPhone?",
    "faq.5.a": "Yes, through the browser, with nothing to install: point the camera at the QR code on the computer. Landscape or portrait: just rotate. To use the full screen, add the page to the Home Screen.",
    "faq.6.q": "Is it free?",
    "faq.6.a": "Yes. Horizonte is free software, under the GPL-3.0 license.",
    "faq.7.q": "I found a problem. Where do I report it?",
    "faq.7.a": "In the app, under Settings, tap Send diagnostics. One click, no account and no form: only the version, the system and the error codes are sent.",
    "faq.8.q": "How do I use my phone as a second screen for my PC?",
    "faq.8.a": "Open Horizonte on the PC and point the phone's camera at the QR code. The extended screen opens in the browser, with nothing to install on the phone. Works on Android and iPhone.",
    "faq.9.q": "Does it work without internet?",
    "faq.9.a": "Yes. Local network only: the PC and the other device must be on the same network, and the image does not go through a server. The internet is only for downloading the app and updates.",
    "faq.10.q": "Do I need a cable?",
    "faq.10.a": "No. The image goes over the Wi-Fi at your home or office. 5 GHz Wi-Fi makes everything more stable.",
    "faq.11.q": "Is it a free alternative to Spacedesk, Duet Display and Sidecar?",
    "faq.11.a": "Yes, for the same use: having a wireless second screen. Horizonte is free and open source, and works between Windows, Linux and macOS, plus phones and tablets through the browser. Each program has its own features, so compare before you choose.",
    "faq.12.q": "Does it work on Android, iPad and tablets?",
    "faq.12.a": "Yes, through the browser, with nothing to install: point the camera at the QR code on the computer. Applies to Android, iPad, iPhone and any tablet with a modern browser.",
    "foot.credit": "GPL-3.0 · own engine built on WebRTC",
    "lang.group": "Language",
    "lang.cycle": "Change language"
  },
    es: {
    "meta.title": "Horizonte: monitor inalámbrico y segunda pantalla en laptop y celular",
    "meta.desc": "Monitor inalámbrico gratis: usa una laptop, tableta o celular como segunda pantalla del PC. Sin cables y sin configurar. Windows, macOS, Linux y navegador.",
    "meta.ogTitle": "Horizonte: tu segunda pantalla, sin cables",
    "meta.ogDesc": "Laptop, tableta o celular se convierten en la segunda pantalla de tu computadora. Sin cables, sin configurar nada, gratis.",
    "meta.twDesc": "Laptop, tableta o celular se convierten en la segunda pantalla de tu computadora. Sin cables, gratis.",
    "og.alt": "Horizonte: laptop, tableta y celular como segunda pantalla del PC",
    "nav.aria": "Secciones",
    "hero.appAria": "Horizonte funcionando. Haz clic para probarlo.",
    "app.aria": "Demostración interactiva de Horizonte",
    "recap.aria": "Resumen de Horizonte",
    "nav.news": "Novedades",
    "nav.how": "Cómo funciona",
    "nav.features": "Funciones",
    "download": "Descargar",
    "support": "Apoyar",
    "pill.new": "Nuevo",
    "pill.text": "Varias pantallas a la vez",
    "hero.l1": "Tu segunda pantalla.",
    "hero.l2": "Sin cables.",
    "hero.lede": "Usa tu laptop, tu tableta o tu celular como monitor inalámbrico de tu PC. Gratis y de código abierto.",
    "hero.cta": "Descargar gratis",
    "hero.github": "Ver en GitHub",
    "hero.f1": "Gratis y de código abierto",
    "hero.f2": "Linux, Windows y macOS",
    "hero.f3": "Se actualiza solo",
    "works.l": "Funciona con",
    "works.notebook": "Laptop",
    "works.desktop": "Escritorio",
    "works.tablet": "Tableta",
    "works.browser": "Navegador",
    "demo.label": "Demostración interactiva",
    "demo.restart": "Reiniciar",
    "demo.connect": "Solicitar conexión",
    "spec.a": "Versión",
    "spec.b": "· Windows, Linux y macOS · código abierto, GPL-3.0",
    "open": "Código abierto",
    "statement": "La laptop o la tableta que está en tu mesa puede ser una segunda pantalla ahora mismo.",
    "story.h1": "Un código QR.",
    "story.h2": "Nada que configurar.",
    "dev.desktop": "Desktop · envía",
    "dev.laptop": "Laptop · recibe",
    "dev.tablet": "Tableta · navegador",
    "win.title": "Notas de la reunión",
    "cap.1.h": "Abre Horizonte.",
    "cap.1.p": "El código QR ya está ahí. Nada que elegir, nada que configurar.",
    "cap.2.h": "Apunta la cámara.",
    "cap.2.p": "En el celular o la tableta, la pantalla se abre en el navegador. Lo permites una vez y listo.",
    "cap.3.h": "¿Otra computadora? Recibir.",
    "cap.3.p": "La encuentra sola en la red local, sin crear cuenta.",
    "cap.4.h": "Arrastra la ventana hacia un lado.",
    "cap.4.p": "El otro dispositivo se vuelve una extensión de tu pantalla. Solo lleva la ventana hasta el borde.",
    "cap.5.h": "Todos los dispositivos que quieras.",
    "cap.5.p": "Cada uno con su pantalla. La lista muestra quién está conectado, y el QR sigue ahí para el siguiente.",
    "hint.scroll": "Desplázate para continuar",
    "nov.tag": "Nuevo en la",
    "nov.title": "Varias pantallas.<br />A la vez.",
    "nov.lede": "Laptop, tableta y celular juntos, cada uno con su pantalla extendida. Arrastra cada una a donde queda en tu mesa.",
    "stat.many": "varias",
    "stat.enc": "cifrado",
    "nov.1.h": "Pantallas inalámbricas",
    "nov.1.p": "Cada dispositivo tiene su propio monitor. Quien se conecta después no desconecta a nadie.",
    "nov.2.h": "Cursor sin retraso",
    "nov.2.p": "El puntero se dibuja directamente en el otro dispositivo, sin esperar al video.",
    "nov.3.h": "Video al instante",
    "nov.3.p": "Cada cuadro aparece apenas llega, sin cola de espera.",
    "nov.4.h": "Mouse sin programa extra",
    "nov.4.p": "El mouse y el teclado pasan de una computadora a otra por el borde de la pantalla. Directo por la red local, cifrado.",
    "nov.5.h": "Celular con un toque",
    "nov.5.p": "Apunta la cámara al código en la pantalla y la página se abre ya conectando.",
    "nov.6.h": "Siempre actualizado",
    "nov.6.p": "La versión nueva llega sola. Un clic y la app se reinicia actualizada.",
    "nov.all": "Todas las versiones ›",
    "mx.h1": "Monitor inalámbrico entre",
    "mx.h2": "Windows, Linux y macOS.",
    "mx.send": "envía",
    "mx.recv": "recibe",
    "radar.h1": "Encuentra al otro",
    "radar.h2": "solo.",
    "radar.p": "Por la red local, sin crear cuenta. La detección es automática; si hace falta, conéctate por IP. Quien envía solo hace clic en Permitir.",
    "bento.h": "Todo en su lugar.",
    "f.monitor": "Monitor virtual",
    "f.monitor.p": "Se crea solo.",
    "f.copy": "Copiar y pegar",
    "f.copy.p": "Texto, imágenes y archivos.",
    "f.theme": "Tema claro y oscuro",
    "f.theme.p": "Sigue al sistema, o elígelo en Ajustes.",
    "f.screens": "Varias pantallas",
    "f.screens.p": "Cada dispositivo en su posición.",
    "f.local": "Solo red local",
    "f.local.p": "Nada sale de casa.",
    "f.open.p": "GPL-3.0, gratis.",
    "num.accounts": "cuentas",
    "num.qr": "código QR",
    "num.1": "hasta 60 cuadros por segundo en la pantalla extendida",
    "num.2": "por crear: sin nube y sin registro de por medio",
    "num.3": "de la app abierta a la segunda pantalla",
    "val.1": "Sin cuenta.",
    "val.2": "Sin nube.",
    "val.3": "Sin configurar.",
    "val.p": "Las dos computadoras hablan directamente por tu red. En los tres sistemas, el propio Horizonte transmite la imagen con WebRTC. Encima, una ventana que solo pide lo que importa.",
    "rc.any": "Cualquier sistema",
    "rc.finds": "Lo encuentra solo",
    "rc.connects": "Encuentra y conecta",
    "rc.free": "Gratis, GPL-3.0",
    "rc.zero": "$0",
    "rc.diag": "Diagnóstico con un clic",
    "rc.nocloud": "Sin nube",
    "rc.fps": "Hasta 60 fps",
    "usos.h": "Usa tu tableta, celular o laptop como monitor",
    "usos.1.h": "Tableta e iPad",
    "usos.1.p": "Apunta la cámara al código QR. Sin instalar nada.",
    "usos.2.h": "Celular Android e iPhone",
    "usos.2.p": "Horizontal o vertical, solo gíralo. Funciona en Android y iPhone.",
    "usos.3.h": "Otra laptop u otro PC",
    "usos.3.p": "Instala en los dos y toca Recibir. Sin cuenta.",
    "dl.h": "Descarga Horizonte.",
    "dl.lede": "Instálalo en las dos computadoras. La versión más reciente siempre está en GitHub.",
    "dl.ok": "Disponible",
    "dl.test": "En pruebas",
    "dl.meta.win": "Instalador .exe · 110 MB<br />Windows 10 y 11",
    "dl.meta.mac": "Chip Apple y chip Intel · .dmg",
    "dl.arm": "Descargar para chip Apple (ARM64)",
    "dl.x64": "Descargar para chip Intel (x64)",
    "copy.label": "Copiar",
    "dl.term": "En la carpeta donde se descargó el archivo. Después de eso, se actualiza solo.",
    "dl.you": "Tu sistema",
    "dl.guidance": "En este dispositivo no hace falta instalar nada: en la computadora con Horizonte, apunta la cámara al código QR y la segunda pantalla se abre en el navegador.",
    "dl.release": "Mira la página de la versión",
    "file.exe": "Instalador .exe",
    "file.macArm": "Mac con chip Apple (.dmg)",
    "file.macX64": "Mac con chip Intel (.dmg)",
    "copy.done": "Copiado",
    "copy.fail": "Selecciona y copia",
    "iframe.host": "Conectar a Desktop",
    "iframe.live": "Horizonte funcionando. Haz clic para probarlo.",
    "faq.h": "Preguntas frecuentes.",
    "faq.1.q": "¿Cómo usar una laptop, tableta o celular como monitor inalámbrico?",
    "faq.1.a": "Instala Horizonte en la computadora y ábrelo. En el celular o la tableta, apunta la cámara al código QR: la pantalla extendida se abre en el navegador, sin instalar nada. En otra computadora, abre Horizonte y elige Recibir.",
    "faq.2.q": "¿Qué necesito para que funcione?",
    "faq.2.a": "Dos computadoras en la misma red, de preferencia Wi-Fi de 5 GHz o cable. En la computadora que envía, una tarjeta de video hace que la imagen sea ligera, pero la app usa el procesador si es necesario.",
    "faq.3.q": "¿Por qué Windows y macOS muestran una advertencia al instalar?",
    "faq.3.a": "Porque el instalador todavía no tiene firma digital, que es de pago. En Windows, haz clic en Más información y luego en Ejecutar de todas formas. En Mac, después de arrastrar a Aplicaciones, ejecuta una vez <code>xattr -cr /Applications/Horizonte.app</code> en Terminal. El código es abierto y está en GitHub para quien quiera revisarlo.",
    "faq.4.q": "¿Cuántas pantallas puedo conectar?",
    "faq.4.a": "Cuantas aguanten tu computadora y tu red: laptop, tableta y celular juntos, cada uno con su pantalla extendida. Arrastras cada una a donde queda en tu mesa.",
    "faq.5.q": "¿Funciona en iPhone?",
    "faq.5.a": "Sí, por el navegador, sin instalar nada: apunta la cámara al código QR en la computadora. Horizontal o vertical: solo gíralo. Para usar la pantalla completa, agrega la página a la pantalla de inicio.",
    "faq.6.q": "¿Es gratis?",
    "faq.6.a": "Sí. Horizonte es software libre, bajo la licencia GPL-3.0.",
    "faq.7.q": "Encontré un problema. ¿Dónde lo aviso?",
    "faq.7.a": "En la app, en Ajustes, toca Enviar diagnóstico. Un clic, sin cuenta y sin formulario: solo se envían la versión, el sistema y los códigos de error.",
    "faq.8.q": "¿Cómo usar el celular como segunda pantalla del PC?",
    "faq.8.a": "Abre Horizonte en el PC y apunta la cámara del celular al código QR. La pantalla extendida se abre en el navegador, sin instalar nada en el celular. Funciona en Android y en iPhone.",
    "faq.9.q": "¿Funciona sin internet?",
    "faq.9.a": "Sí. Solo la red local: el PC y el otro dispositivo deben estar en la misma red, y la imagen no pasa por ningún servidor. Internet solo sirve para descargar la app y las actualizaciones.",
    "faq.10.q": "¿Necesito cable?",
    "faq.10.a": "No. La imagen va por el Wi-Fi de tu casa o del trabajo. El Wi-Fi de 5 GHz lo hace todo más estable.",
    "faq.11.q": "¿Es una alternativa gratuita a Spacedesk, Duet Display y Sidecar?",
    "faq.11.a": "Sí, para el mismo uso: tener una segunda pantalla sin cables. Horizonte es gratis y de código abierto, y funciona entre Windows, Linux y macOS, además de celulares y tabletas por el navegador. Cada programa tiene sus propias funciones, así que compara antes de elegir.",
    "faq.12.q": "¿Funciona en Android, iPad y tabletas?",
    "faq.12.a": "Sí, por el navegador, sin instalar nada: apunta la cámara al código QR en la computadora. Vale para Android, iPad, iPhone y cualquier tableta con un navegador moderno.",
    "foot.credit": "GPL-3.0 · motor propio con WebRTC",
    "lang.group": "Idioma",
    "lang.cycle": "Cambiar idioma"
  }
  }

  function fromNavigator(languages) {
    var first = String((languages && languages[0]) || '').toLowerCase()
    if (first.indexOf('pt') === 0) return 'pt'
    if (first.indexOf('es') === 0) return 'es'
    return 'en'
  }

  /** `?lang=` > escolha guardada > idioma do navegador. */
  function pickLang(query, stored, languages) {
    if (LANGS.indexOf(query) !== -1) return query
    if (LANGS.indexOf(stored) !== -1) return stored
    return fromNavigator(languages)
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { pickLang: pickLang, fromNavigator: fromNavigator, DICT: DICT, LANGS: LANGS }
  if (typeof document === 'undefined') return

  var KEY = 'hz-lang'
  var pt = {} // chave -> texto original em português (lido do HTML, ou o padrão que o script passou)
  var current = 'pt'

  function t(key, fallback) {
    if (!(key in pt) && fallback !== undefined) pt[key] = fallback
    if (current === 'pt') return key in pt ? pt[key] : fallback
    var v = DICT[current][key]
    return v !== undefined ? v : (key in pt ? pt[key] : fallback)
  }

  function set(el, key, markup) {
    var v = t(key)
    if (v === undefined) return
    if (markup === undefined) markup = v.indexOf('<') !== -1
    if (markup) el.innerHTML = v
    else el.textContent = v
  }

  function apply(lang) {
    current = lang
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (el.hasAttribute('data-live')) return // preenchido pelo js/main.js com dados da versão
      var key = el.getAttribute('data-i18n')
      if (!(key in pt)) pt[key] = el.children.length ? el.innerHTML : el.textContent
      set(el, key)
    })
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':')
        var name = pair.slice(0, i)
        var key = pair.slice(i + 1)
        if (!(key in pt)) pt[key] = el.getAttribute(name)
        var v = t(key)
        if (v !== undefined) el.setAttribute(name, v)
      })
    })
    if (!('meta.title' in pt)) pt['meta.title'] = document.title
    document.title = t('meta.title')
    document.documentElement.lang = HTML_LANG[lang]
    var cycle = document.getElementById('lang-cycle')
    if (cycle) cycle.textContent = lang.toUpperCase()
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang))
    })
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return
    apply(lang)
    try { localStorage.setItem(KEY, lang) } catch (e) { /* sem armazenamento: vale só nesta visita */ }
    try {
      var url = new URL(location.href)
      url.searchParams.set('lang', lang)
      history.replaceState(null, '', url)
    } catch (e) { /* ignora */ }
    document.dispatchEvent(new CustomEvent('hz:lang', { detail: lang }))
  }

  var stored = null
  try { stored = localStorage.getItem(KEY) } catch (e) { /* ignora */ }
  var query = new URLSearchParams(location.search).get('lang')
  apply(pickLang(query, stored, root.navigator.languages || [root.navigator.language]))

  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')) })
  })
  var cycle = document.getElementById('lang-cycle')
  if (cycle) cycle.addEventListener('click', function () { setLang(LANGS[(LANGS.indexOf(current) + 1) % LANGS.length]) })

  root.hzT = t
  root.hzSetLang = setLang
})(typeof window !== 'undefined' ? window : globalThis)
