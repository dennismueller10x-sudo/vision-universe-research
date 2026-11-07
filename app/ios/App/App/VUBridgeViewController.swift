import UIKit
import WebKit
import Capacitor

/// Native Rand-Wischgeste (Strang K, Owner 07.11.2026: "Hin- und herwischen ... sehr schwerfällig").
///
/// Die App-Shell zeigt die Website in einem Iframe. `allowsBackForwardNavigationGestures` von WKWebView kennt nur die
/// gemeinsame Sitzungshistorie aller Rahmen und ihre Momentaufnahmen gehören zum Hauptdokument; deshalb führt dieser
/// Controller die Geste selbst: UIScreenEdgePanGestureRecognizer links (zurück) und rechts (vor), Bildschirmfoto der
/// aktuellen Seite folgt dem Finger, darunter die zuletzt gesehene Ansicht der Zielseite (Parallaxe), Haptik an der
/// Schwelle. Die eigentliche Navigation führt die Shell im Iframe aus (`VUAppNav.go`), sodass Untertabs, Sheets und
/// der Produkteinstieg dieselben Regeln wie die Android-Zurück-Taste haben.
///
/// Zustand kommt von der Shell über `window.webkit.messageHandlers.vuNav` (nur aus dem App-Bundle, nicht aus dem Iframe):
/// `{type: "state", back, forward, key, backKey, forwardKey}` und `{type: "haptic", style}`.
class VUBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {

    private struct NavState {
        var back = false
        var forward = false
        var key: String?
        var backKey: String?
        var forwardKey: String?
    }

    private enum Direction { case back, forward }

    private var state = NavState()
    private var snapshots: [String: UIView] = [:]
    private var snapshotOrder: [String] = []
    private let snapshotLimit = 8

    private var leftEdge: UIScreenEdgePanGestureRecognizer?
    private var rightEdge: UIScreenEdgePanGestureRecognizer?

    private var overlay: UIView?
    private var moving: UIView?
    private var under: UIView?
    private var dim: UIView?
    private var direction: Direction = .back
    private var passedThreshold = false
    private var committing = false
    private var commitFromKey: String?
    private var finishTimer: Timer?
    private let impact = UIImpactFeedbackGenerator(style: .light)
    private let selection = UISelectionFeedbackGenerator()

    // MARK: - Konfiguration

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        // Die Website schaltet ihr eigenes JS-Randwischen ab, wenn die App die Geste nativ führt (assets/vu-gestures.js).
        let name = configuration.applicationNameForUserAgent ?? ""
        configuration.applicationNameForUserAgent = name.isEmpty ? "VUEdge/1" : name + " VUEdge/1"
        configuration.userContentController.add(WeakScriptHandler(self), name: "vuNav")
        return configuration
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = false   // eigene Geste, siehe oben
        let left = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdge(_:)))
        left.edges = .left
        left.delegate = self
        let right = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdge(_:)))
        right.edges = .right
        right.delegate = self
        webView.addGestureRecognizer(left)
        webView.addGestureRecognizer(right)
        leftEdge = left
        rightEdge = right
        // Am äußersten Rand gewinnt die Randgeste vor horizontalen Karussells/Charts der Seite; abseits des Rands
        // scheitert sie sofort, dort bleibt jedes Wischen der Website unverändert.
        webView.scrollView.panGestureRecognizer.require(toFail: left)
        webView.scrollView.panGestureRecognizer.require(toFail: right)
    }

    // MARK: - Zustand aus der Shell

    fileprivate func receive(_ body: Any) {
        guard let message = body as? [String: Any], let type = message["type"] as? String else { return }
        switch type {
        case "state":
            state.back = message["back"] as? Bool ?? false
            state.forward = message["forward"] as? Bool ?? false
            state.key = message["key"] as? String
            state.backKey = message["backKey"] as? String
            state.forwardKey = message["forwardKey"] as? String
            // Neue Seite gemeldet: Vorschau ausblenden. Ohne Schlüssel (ältere Website) greift der Zeitgeber in commit().
            if committing, let key = state.key, key != commitFromKey {
                finishCommit()
            }
            if message["settled"] as? Bool == true { rememberSnapshot() }
        case "haptic":
            let style = message["style"] as? String
            if style == "impact" { impact.impactOccurred() } else { selection.selectionChanged() }
        default:
            break
        }
    }

    /// Momentaufnahme der ruhenden Seite unter ihrem Verlaufsschlüssel; dient später als Vorschau beim Zurück-/Vorwischen.
    private func rememberSnapshot() {
        guard overlay == nil, let key = state.key, let webView = webView, webView.window != nil,
              let snap = webView.snapshotView(afterScreenUpdates: false) else { return }
        snapshots[key] = snap
        snapshotOrder.removeAll { $0 == key }
        snapshotOrder.append(key)
        while snapshotOrder.count > snapshotLimit {
            let old = snapshotOrder.removeFirst()
            snapshots[old] = nil
        }
    }

    // MARK: - Geste

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if overlay != nil { return false }
        if gestureRecognizer === leftEdge { return state.back }
        if gestureRecognizer === rightEdge { return state.forward }
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        false
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        // Scrollen/Karussells der Seite warten nicht auf die Randgeste; sie beginnen nur am äußersten Rand nicht.
        false
    }

    @objc private func handleEdge(_ recognizer: UIScreenEdgePanGestureRecognizer) {
        guard let webView = webView else { return }
        let width = max(webView.bounds.width, 1)
        let dx = recognizer.translation(in: webView).x
        switch recognizer.state {
        case .began:
            direction = recognizer === leftEdge ? .back : .forward
            begin(in: webView)
            impact.prepare()
        case .changed:
            let progress = direction == .back ? max(0, dx) / width : max(0, -dx) / width
            layout(progress: min(progress, 1), width: width)
            let over = progress >= 0.35
            if over != passedThreshold { passedThreshold = over; if over { impact.impactOccurred(intensity: 0.6) } }
        case .ended:
            let progress = direction == .back ? max(0, dx) / width : max(0, -dx) / width
            let velocity = recognizer.velocity(in: webView).x * (direction == .back ? 1 : -1)
            if VUEdgeRule.commit(progress: progress, velocity: velocity) { commit(width: width) } else { cancel(width: width) }
        case .cancelled, .failed:
            cancel(width: width)
        default:
            break
        }
    }

    private func begin(in webView: WKWebView) {
        passedThreshold = false
        let container = UIView(frame: webView.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.backgroundColor = webView.backgroundColor ?? .systemBackground
        container.isUserInteractionEnabled = false
        let current = webView.snapshotView(afterScreenUpdates: false) ?? UIView(frame: webView.bounds)
        let targetKey = direction == .back ? state.backKey : state.forwardKey
        // Gespeicherte Momentaufnahmen werden direkt eingehängt (eine Momentaufnahme außerhalb des Fensters wäre leer).
        let target = targetKey.flatMap { snapshots[$0] } ?? placeholder(frame: webView.bounds)
        target.transform = .identity
        let shade = UIView(frame: webView.bounds)
        shade.backgroundColor = UIColor.black.withAlphaComponent(0.12)
        // Zurück: aktuelle Seite liegt oben und wandert nach rechts. Vor: Zielseite kommt von rechts über die aktuelle.
        let top = direction == .back ? current : target
        let bottom = direction == .back ? target : current
        for view in [bottom, shade, top] { view.frame = webView.bounds; container.addSubview(view) }
        top.layer.shadowColor = UIColor.black.cgColor
        top.layer.shadowOpacity = 0.18
        top.layer.shadowRadius = 12
        top.layer.shadowOffset = CGSize(width: -4, height: 0)
        top.layer.shadowPath = UIBezierPath(rect: top.bounds).cgPath
        webView.addSubview(container)
        overlay = container; moving = top; under = bottom; dim = shade
        layout(progress: 0, width: webView.bounds.width)
    }

    private func placeholder(frame: CGRect) -> UIView {
        let view = UIView(frame: frame)
        view.backgroundColor = webView?.backgroundColor ?? .systemBackground
        return view
    }

    /// progress 0 = Ausgangslage, 1 = Ziel sichtbar.
    private func layout(progress: CGFloat, width: CGFloat) {
        guard let moving = moving, let under = under, let dim = dim else { return }
        switch direction {
        case .back:
            moving.transform = CGAffineTransform(translationX: progress * width, y: 0)
            under.transform = CGAffineTransform(translationX: -0.3 * width * (1 - progress), y: 0)
            dim.alpha = 1 - progress
        case .forward:
            moving.transform = CGAffineTransform(translationX: (1 - progress) * width, y: 0)
            under.transform = CGAffineTransform(translationX: -0.3 * width * progress, y: 0)
            dim.alpha = progress
        }
    }

    private func commit(width: CGFloat) {
        committing = true
        commitFromKey = state.key
        let dir = direction == .back ? "back" : "forward"
        // Navigation sofort starten, damit die Zielseite schon lädt, während die Animation ausläuft.
        webView?.evaluateJavaScript("window.VUAppNav&&window.VUAppNav.go('\(dir)')", completionHandler: nil)
        UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut, .allowUserInteraction]) {
            self.layout(progress: 1, width: width)
        }
        // Spätestens nach 700 ms freigeben, auch wenn die Seite keinen neuen Zustand meldet (z. B. ältere Website).
        finishTimer?.invalidate()
        finishTimer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: false) { [weak self] _ in self?.finishCommit() }
    }

    private func finishCommit() {
        committing = false
        finishTimer?.invalidate(); finishTimer = nil
        guard let container = overlay else { return }
        // Einen Frame warten, damit die neue Seite gezeichnet ist, dann die Vorschau weich ausblenden.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            UIView.animate(withDuration: 0.12, animations: { container.alpha = 0 }, completion: { _ in self.teardown(container) })
        }
    }

    private func cancel(width: CGFloat) {
        guard let container = overlay else { return }
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut]) {
            self.layout(progress: 0, width: width)
        } completion: { _ in self.teardown(container) }
    }

    private func teardown(_ container: UIView) {
        container.subviews.forEach { $0.transform = .identity; $0.removeFromSuperview() }
        container.removeFromSuperview()
        if overlay === container { overlay = nil; moving = nil; under = nil; dim = nil }
    }
}

/// Entscheidungsregel (gleich wie die Web-Geste: ab 35 % Breite; zusätzlich ein schneller Wisch ab 10 %).
enum VUEdgeRule {
    static func commit(progress: CGFloat, velocity: CGFloat) -> Bool {
        if progress >= 0.35 { return true }
        return progress >= 0.1 && velocity > 600
    }
}

/// WKUserContentController hält seine Handler stark; die Weiterleitung verhindert einen Zyklus mit dem Controller.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: VUBridgeViewController?
    init(_ target: VUBridgeViewController) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Nur das App-Bundle (Hauptrahmen) darf steuern; der Iframe mit der Website spricht über die Shell.
        guard message.frameInfo.isMainFrame else { return }
        target?.receive(message.body)
    }
}
