import AppKit

enum NoteWindowSizing {
    static let minimumWidth: CGFloat = 260
    static let minimumHeight: CGFloat = 260

    static func resizedFrame(start: NSRect, delta: NSPoint, minimum: NSSize, visibleFrame: NSRect?) -> NSRect {
        let maxWidth = visibleFrame.map { max(minimum.width, $0.maxX - start.minX) } ?? CGFloat.greatestFiniteMagnitude
        let maxHeight = visibleFrame.map { max(minimum.height, start.maxY - $0.minY) } ?? CGFloat.greatestFiniteMagnitude
        let width = min(maxWidth, max(minimum.width, start.width + delta.x))
        let height = min(maxHeight, max(minimum.height, start.height - delta.y))
        return NSRect(x: start.minX, y: start.maxY - height, width: width, height: height)
    }
}

final class ResizeGrip: NSView {
    private var initialFrame: NSRect?
    private var initialMouse = NSPoint.zero
    var onResizeEnded: (() -> Void)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        setAccessibilityElement(true)
        setAccessibilityRole(.image)
        setAccessibilityLabel("拖动右下角调整便签大小")
        toolTip = "拖动这里，自由调整便签大小"
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() {
        let cursor: NSCursor
        if #available(macOS 15.0, *) { cursor = .frameResize(position: .bottomRight, directions: .all) }
        else { cursor = .crosshair }
        addCursorRect(bounds, cursor: cursor)
    }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.secondaryLabelColor.withAlphaComponent(0.55).setStroke()
        for offset in [CGFloat(0), 5, 10] {
            let path = NSBezierPath()
            path.move(to: NSPoint(x: 8 + offset, y: 7))
            path.line(to: NSPoint(x: 23, y: 22 - offset))
            path.lineWidth = 1.4
            path.lineCapStyle = .round
            path.stroke()
        }
    }
    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        window.makeKeyAndOrderFront(nil)
        initialFrame = window.frame
        initialMouse = window.convertPoint(toScreen: event.locationInWindow)
    }
    override func mouseDragged(with event: NSEvent) {
        guard let window, let initialFrame else { return }
        let mouse = window.convertPoint(toScreen: event.locationInWindow)
        let delta = NSPoint(x: mouse.x - initialMouse.x, y: mouse.y - initialMouse.y)
        let frame = NoteWindowSizing.resizedFrame(start: initialFrame, delta: delta, minimum: window.minSize, visibleFrame: window.screen?.visibleFrame)
        window.setFrame(frame, display: true)
    }
    override func mouseUp(with event: NSEvent) {
        initialFrame = nil
        onResizeEnded?()
    }
}
