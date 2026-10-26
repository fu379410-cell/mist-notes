import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: 1024, height: 1024).fill()
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: r, green: g, blue: b, alpha: a)
}
let outer = NSBezierPath(roundedRect: NSRect(x: 74, y: 74, width: 876, height: 876), xRadius: 198, yRadius: 198)
NSGradient(colors: [color(0.86, 0.81, 0.96), color(0.74, 0.80, 0.95), color(0.73, 0.89, 0.92)])!.draw(in: outer, angle: -50)
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = color(0.27, 0.31, 0.52, 0.22)
shadow.shadowBlurRadius = 44
shadow.shadowOffset = NSSize(width: 0, height: -22)
shadow.set()
let paper = NSBezierPath(roundedRect: NSRect(x: 218, y: 186, width: 590, height: 662), xRadius: 62, yRadius: 62)
color(0.96, 0.97, 1, 0.88).setFill()
paper.fill()
NSGraphicsContext.restoreGraphicsState()
color(1, 1, 1, 0.9).setStroke()
paper.lineWidth = 3
paper.stroke()
for (index, width) in [346.0, 290.0, 218.0].enumerated() {
    let y = 649.0 - Double(index) * 118.0
    let line = NSBezierPath(roundedRect: NSRect(x: 314, y: y, width: width, height: 22), xRadius: 11, yRadius: 11)
    color(0.42, 0.44, 0.61, index == 0 ? 0.85 : 0.42).setFill()
    line.fill()
}
let seal = NSBezierPath(ovalIn: NSRect(x: 711, y: 745, width: 45, height: 45))
color(0.89, 0.72, 0.62).setFill()
seal.fill()
image.unlockFocus()
let tiff = image.tiffRepresentation!
let bitmap = NSBitmapImageRep(data: tiff)!
try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent("icon_512x512@2x.png"))
