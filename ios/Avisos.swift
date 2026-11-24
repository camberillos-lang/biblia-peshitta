import Foundation
import UserNotifications

enum Avisos {
    static let prefijo = "peshitta-aviso-"
    static let categoria = "PESHITTA_PASAJE"
    static let contexto = "PESHITTA_CONTEXTO"
    static let centro = UNUserNotificationCenter.current()

    static func configurar() {
        let accion = UNNotificationAction(identifier: contexto, title: "VER CONTEXTO COMPLETO", options: [.foreground])
        let cat = UNNotificationCategory(identifier: categoria, actions: [accion], intentIdentifiers: [], options: [])
        centro.setNotificationCategories([cat])
    }

    static func procesar(_ r: UNNotificationResponse) {
        guard r.actionIdentifier == UNNotificationDefaultActionIdentifier || r.actionIdentifier == contexto,
              let ruta = r.notification.request.content.userInfo["ruta"] as? String,
              ruta.hasPrefix("#aviso/") else { return }
        let destino = r.actionIdentifier == contexto ? "#pasaje/" + String(ruta.dropFirst(7)) : ruta
        UserDefaults.standard.set(destino, forKey: "pasajePendiente")
        NotificationCenter.default.post(name: .peshittaActiva, object: nil)
    }

    static func solicitud(_ datos: [String: Any], prueba: Bool) throws -> UNNotificationRequest {
        guard let id = datos["id"] as? String, !id.isEmpty, id.count < 50,
              let mili = (datos["at"] as? NSNumber)?.doubleValue, mili.isFinite,
              let texto = datos["cuerpo"] as? String, !texto.isEmpty, texto.utf8.count < 16000,
              let ruta = datos["ruta"] as? String, ruta.hasPrefix("#aviso/"), ruta.count < 3000 else {
            throw Fallo("El aviso tiene un formato incorrecto.")
        }
        let content = UNMutableNotificationContent()
        content.title = "Biblia Peshitta"
        content.body = texto
        content.sound = .default
        content.categoryIdentifier = categoria
        content.userInfo = ["ruta":ruta, "at":mili]
        let intervalo = prueba ? 5 : mili / 1000 - Date().timeIntervalSince1970
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, intervalo), repeats: false)
        return UNNotificationRequest(identifier: prefijo + (prueba ? "prueba" : id), content: content, trigger: trigger)
    }

    static func sincronizar(_ datos: [[String: Any]]) async throws {
        guard datos.count <= 60 else { throw Fallo("Demasiados avisos en la programación.") }
        let autorizacion = await centro.notificationSettings()
        guard [.authorized, .provisional, .ephemeral].contains(autorizacion.authorizationStatus) else {
            throw Fallo("Activa las notificaciones de Biblia Peshitta en Configuración del iPhone.")
        }
        let nuevas = try datos.map { try solicitud($0, prueba: false) }
        let pendientes = await centro.pendingNotificationRequests().filter {
            $0.identifier.hasPrefix(prefijo) && $0.identifier != prefijo + "prueba"
        }
        let anteriores = Dictionary(uniqueKeysWithValues: pendientes.map { ($0.identifier, $0) })
        let objetivo = Set(nuevas.map(\.identifier))
        guard objetivo.count == nuevas.count else { throw Fallo("Hay dos avisos con la misma hora.") }
        let sobran = pendientes.filter { !objetivo.contains($0.identifier) }
        centro.removePendingNotificationRequests(withIdentifiers: sobran.map(\.identifier))
        var instaladas: [String] = []
        do {
            for req in nuevas {
                let v = anteriores[req.identifier]
                if let v = v, v.content.body == req.content.body,
                   v.content.userInfo["ruta"] as? String == req.content.userInfo["ruta"] as? String,
                   v.content.userInfo["at"] as? Double == req.content.userInfo["at"] as? Double { continue }
                try await centro.add(req)
                instaladas.append(req.identifier)
            }
        } catch {
            centro.removePendingNotificationRequests(withIdentifiers: instaladas)
            for antiguo in sobran + instaladas.compactMap({ anteriores[$0] }) {
                // Vuelve al instante original incluso si han transcurrido segundos.
                if let mili = antiguo.content.userInfo["at"] as? Double, mili / 1000 > Date().timeIntervalSince1970 {
                    let t = UNTimeIntervalNotificationTrigger(timeInterval: max(1, mili / 1000 - Date().timeIntervalSince1970), repeats: false)
                    try? await centro.add(UNNotificationRequest(identifier: antiguo.identifier, content: antiguo.content, trigger: t))
                }
            }
            throw error
        }
    }
}

struct Fallo: LocalizedError {
    let motivo: String
    init(_ motivo: String) { self.motivo = motivo }
    var errorDescription: String? { motivo }
}
extension Notification.Name {
    static let peshittaActiva = Notification.Name("BibliaPeshitta.Activa")
}
