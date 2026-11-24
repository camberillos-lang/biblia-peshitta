import UIKit
import WebKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Avisos.centro.delegate = self
        Avisos.configurar()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        completion([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completion: @escaping () -> Void) {
        DispatchQueue.main.async { Avisos.procesar(response); completion() }
    }
}

@objc(BPSceneDelegate)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        if let respuesta = options.notificationResponse { Avisos.procesar(respuesta) }
        let w = UIWindow(windowScene: scene)
        w.rootViewController = Lector()
        window = w
        w.makeKeyAndVisible()
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        NotificationCenter.default.post(name: .peshittaActiva, object: nil)
    }
}

@MainActor
final class Lector: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private static let puerto: UInt16 = 47381
    private static var iniciado = false
    private var web: WKWebView?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        NotificationCenter.default.addObserver(self, selector: #selector(activa), name: .peshittaActiva, object: nil)
        abrir()
    }

    @objc private func abrir() {
        guard let raiz = Bundle.main.resourceURL?.appendingPathComponent("docs") else { return }
        if !Self.iniciado {
            Self.iniciado = raiz.path.withCString { bp_iniciar($0, Self.puerto) == Int32(Self.puerto) }
        }
        guard Self.iniciado else {
            let boton = UIButton(type: .system)
            boton.setTitle("El lector local no pudo abrirse. Toca para reintentar.", for: .normal)
            boton.titleLabel?.numberOfLines = 0
            boton.addTarget(self, action: #selector(reintentar), for: .touchUpInside)
            boton.frame = view.bounds.insetBy(dx: 24, dy: 32)
            boton.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(boton)
            return
        }
        let conf = WKWebViewConfiguration()
        conf.websiteDataStore = .default()
        conf.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "peshitta")
        let lector = WKWebView(frame: .zero, configuration: conf)
        lector.translatesAutoresizingMaskIntoConstraints = false
        lector.navigationDelegate = self
        lector.uiDelegate = self
        lector.scrollView.contentInsetAdjustmentBehavior = .never
        lector.allowsBackForwardNavigationGestures = true
        web = lector
        view.addSubview(lector)
        NSLayoutConstraint.activate([
            lector.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            lector.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            lector.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            lector.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        lector.load(URLRequest(url: URL(string:"http://127.0.0.1:\(Self.puerto)/")!))
    }

    @objc private func reintentar() {
        view.subviews.forEach { $0.removeFromSuperview() }
        abrir()
    }
    @objc private func activa() {
        web?.evaluateJavaScript("window.dispatchEvent(new Event('peshitta-activa'))", completionHandler: nil)
    }
    #if targetEnvironment(simulator)
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard ProcessInfo.processInfo.arguments.contains("--comprobar-lector") else { return }
        let ensayo = """
        for(let i=0;i<100&&!document.querySelector('#edition-file');i++)await new Promise(r=>setTimeout(r,100));
        if(!document.querySelector('#edition-file'))throw Error('La pantalla de importación no se dibujó.');
        if(!isSecureContext || !crypto.subtle)throw Error('El origen del lector no admite la verificación del PDF.');
        const ficha=await (await fetch('./edicion-huellas.json')).json();
        if(ficha.hashes.length!==3)throw Error('Ficha incompleta.');
        if(await webkit.messageHandlers.peshitta.postMessage({accion:'ruta'})!=='')throw Error('Error en el puente nativo.');
        await new Promise((ok,no)=>{
          const req=indexedDB.open('prueba-biblia-wk',1);
          req.onupgradeneeded=()=>req.result.createObjectStore('arranque');
          req.onerror=()=>no(req.error);
          req.onsuccess=()=>{const db=req.result;const tx=db.transaction('arranque','readwrite');
            tx.objectStore('arranque').put(true,'ok');
            tx.oncomplete=()=>{db.close();indexedDB.deleteDatabase('prueba-biblia-wk');ok();};
            tx.onerror=()=>no(tx.error);};
        });
        return 'LISTO';
        """
        webView.callAsyncJavaScript(ensayo, arguments: [:], in: nil, in: .page) { respuesta in
            let texto: String
            switch respuesta {
            case .success(let value): texto = value as? String ?? "Resultado inesperado"
            case .failure(let error): texto = error.localizedDescription
            }
            if let dir = FileManager.default.urls(for:.documentDirectory,in:.userDomainMask).first {
                try? texto.write(to:dir.appendingPathComponent("arranque-qa.txt"),atomically:true,encoding:.utf8)
            }
        }
    }
    #endif


    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let local = url.scheme == "http" && url.host == "127.0.0.1" && url.port == Int(Self.puerto)
        decisionHandler(local || url.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
        let aviso = UIAlertController(title: "Biblia Peshitta", message: message, preferredStyle: .alert)
        aviso.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        aviso.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(true) })
        present(aviso, animated: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler reply: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http", origin.host == "127.0.0.1",
              origin.port == Int(Self.puerto), let body = message.body as? [String:Any], let accion = body["accion"] as? String else {
            reply(nil,"Origen no autorizado."); return
        }
        Task { @MainActor in
            do {
                switch accion {
                case "permiso":
                    let ok = try await Avisos.centro.requestAuthorization(options: [.alert,.sound,.badge])
                    reply(ok,nil)
                case "programar":
                    guard let avisos = body["avisos"] as? [[String:Any]] else { throw Fallo("Programa inválido.") }
                    try await Avisos.sincronizar(avisos); reply(true,nil)
                case "prueba":
                    guard let aviso = body["aviso"] as? [String:Any] else { throw Fallo("Falta el pasaje de prueba.") }
                    try await Avisos.centro.add(Avisos.solicitud(aviso,prueba:true)); reply(true,nil)
                case "detener":
                    Avisos.centro.removeAllPendingNotificationRequests(); reply(true,nil)
                case "ruta":
                    let key = "pasajePendiente"
                    let ruta = UserDefaults.standard.string(forKey:key) ?? ""
                    UserDefaults.standard.removeObject(forKey:key); reply(ruta,nil)
                case "texto":
                    guard let texto = body["texto"] as? String, !texto.isEmpty else { throw Fallo("Selecciona un fragmento.") }
                    compartir(texto, limpiar: nil, reply: reply)
                case "archivo":
                    guard let nombre = body["nombre"] as? String,
                          nombre == (nombre as NSString).lastPathComponent,
                          nombre.hasSuffix(".json") || nombre == "Biblia-Peshitta.pdf",
                          let b64 = body["base64"] as? String, let datos = Data(base64Encoded:b64) else { throw Fallo("Archivo inválido.") }
                    let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                    try FileManager.default.createDirectory(at:carpeta,withIntermediateDirectories:true)
                    let archivo = carpeta.appendingPathComponent(nombre)
                    do { try datos.write(to:archivo,options:[.atomic,.completeFileProtection]) }
                    catch { try? FileManager.default.removeItem(at:carpeta); throw error }
                    compartir(archivo, limpiar:carpeta, reply:reply)
                default: throw Fallo("Operación desconocida.")
                }
            } catch { reply(nil,error.localizedDescription) }
        }
    }

    private func compartir(_ valor: Any, limpiar carpeta: URL?, reply: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        let limpiar = { if let url = carpeta { try? FileManager.default.removeItem(at:url) } }
        guard presentedViewController == nil else { limpiar(); reply(nil,"Cierra el menú abierto y vuelve a intentarlo."); return }
        let hoja = UIActivityViewController(activityItems:[valor], applicationActivities:nil)
        if let pop = hoja.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1)
        }
        hoja.completionWithItemsHandler = { _,completado,_,error in
            DispatchQueue.main.async {
                limpiar()
                if let error = error { reply(nil,error.localizedDescription) } else { reply(completado,nil) }
            }
        }
        present(hoja,animated:true)
    }
}
