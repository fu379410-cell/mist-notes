import AppKit

@main struct WindowSizingTests {
    static func main() {
        let start = NSRect(x: 100, y: 300, width: 410, height: 470)
        let minimum = NSSize(width: 260, height: 260)
        let screen = NSRect(x: 0, y: 0, width: 1440, height: 1000)
        let grown = NoteWindowSizing.resizedFrame(start: start, delta: NSPoint(x: 140, y: -90), minimum: minimum, visibleFrame: screen)
        assert(grown.width == 550 && grown.height == 560)
        assert(grown.minX == start.minX && grown.maxY == start.maxY)
        let shrunk = NoteWindowSizing.resizedFrame(start: start, delta: NSPoint(x: -120, y: 170), minimum: minimum, visibleFrame: screen)
        assert(shrunk.width == 290 && shrunk.height == 300)
        assert(shrunk.maxY == start.maxY)
        let clamped = NoteWindowSizing.resizedFrame(start: start, delta: NSPoint(x: -2000, y: 2000), minimum: minimum, visibleFrame: screen)
        assert(clamped.size == minimum)
        let bounded = NoteWindowSizing.resizedFrame(start: start, delta: NSPoint(x: 2000, y: -2000), minimum: minimum, visibleFrame: screen)
        assert(bounded.maxX == screen.maxX && bounded.minY == screen.minY)
        print("PASS: grow/shrink, fixed top-left corner, minimum size, screen bounds")
    }
}
