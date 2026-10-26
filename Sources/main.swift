import AppKit
import ServiceManagement

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(srgbRed: CGFloat((hex >> 16) & 255) / 255,
                  green: CGFloat((hex >> 8) & 255) / 255,
                  blue: CGFloat(hex & 255) / 255, alpha: alpha)
    }
}

struct Palette {
    let id: String
    let name: String
    let colors: [NSColor]
    let accent: NSColor
    static let all: [Palette] = [
        Palette(id: "lilac", name: "雾紫 · 冰蓝", colors: [NSColor(hex: 0xF4E8F3), NSColor(hex: 0xDFDDF6), NSColor(hex: 0xD5EBF1)], accent: NSColor(hex: 0x70649B)),
        Palette(id: "apricot", name: "奶杏 · 柔粉", colors: [NSColor(hex: 0xFBEDD7), NSColor(hex: 0xF5DFD5), NSColor(hex: 0xEDD9E9)], accent: NSColor(hex: 0xA17062)),
        Palette(id: "sage", name: "鼠尾草 · 薄荷", colors: [NSColor(hex: 0xF0EFD8), NSColor(hex: 0xDCE9DB), NSColor(hex: 0xD4E8E7)], accent: NSColor(hex: 0x5C7E72))
    ]
    static func find(_ id: String) -> Palette { all.first { $0.id == id } ?? all[0] }
}

let ink = NSColor(hex: 0x343847)
let quietInk = NSColor(hex: 0x626775)

final class PaperView: NSView {
    var palette = Palette.all[0] { didSet { needsDisplay = true } }
    override var isOpaque: Bool { false }
    override var mouseDownCanMoveWindow: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let shape = NSBezierPath(roundedRect: bounds, xRadius: 16, yRadius: 16)
        shape.addClip()
        NSGradient(colors: palette.colors)?.draw(in: bounds, angle: -48)
        let glow = NSGradient(starting: NSColor.white.withAlphaComponent(0.42), ending: .clear)
        glow?.draw(fromCenter: NSPoint(x: bounds.width * 0.1, y: bounds.height * 0.96), radius: 0,
                   toCenter: NSPoint(x: bounds.width * 0.1, y: bounds.height * 0.96), radius: bounds.width * 0.9,
                   options: [.drawsBeforeStartingLocation, .drawsAfterEndingLocation])
        NSColor.white.withAlphaComponent(0.6).setStroke()
        let outline = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 16, yRadius: 16)
        outline.lineWidth = 1
        outline.stroke()
    }
}

final class SwatchButton: NSButton {
    var palette: Palette
    var selected = false { didSet { needsDisplay = true } }
    init(palette: Palette) {
        self.palette = palette
        super.init(frame: .zero)
        isBordered = false
        title = ""
        setAccessibilityLabel(palette.name)
        toolTip = palette.name
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func draw(_ dirtyRect: NSRect) {
        let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: 4, dy: 4))
        NSGradient(colors: palette.colors)?.draw(in: circle, angle: -45)
        NSColor.white.withAlphaComponent(0.9).setStroke()
        circle.lineWidth = 1.5
        circle.stroke()
        if selected {
            palette.accent.withAlphaComponent(0.7).setStroke()
            let ring = NSBezierPath(ovalIn: bounds.insetBy(dx: 0.8, dy: 0.8))
            ring.lineWidth = 1.2
            ring.stroke()
        }
    }
}

final class NoteWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class NoteController: NSWindowController, NSWindowDelegate, NSTextViewDelegate, NSTextFieldDelegate {
    let id: UUID
    unowned let coordinator: AppDelegate
    let paper = PaperView(frame: NSRect(x: 0, y: 0, width: 410, height: 470))
    let titleField = NSTextField(string: "")
    let textView = NSTextView(frame: .zero)
    let statusLabel = NSTextField(labelWithString: "已保存到本机")
    let countLabel = NSTextField(labelWithString: "")
    let paletteLabel = NSTextField(labelWithString: "")
    let pinButton = NSButton()
    let brandLabel = NSTextField(labelWithString: "雾笺  /  随手记")
    var fontButton: NSButton!
    var fontPopover: NSPopover?
    var fontSelection = NSRange(location: 0, length: 0)
    var bodyFontSize: CGFloat = 16
    var titleHeight: NSLayoutConstraint!
    var swatches: [SwatchButton] = []
    private var draggingFont = false
    private var finishFontDrag: (() -> Void)?
    private var hydrated = false

    init(note: Note, coordinator: AppDelegate, offset: Int = 0) {
        self.id = note.id
        self.coordinator = coordinator
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var frame = NSRect(x: visible.maxX - 450 - CGFloat(offset * 26), y: visible.maxY - 510 - CGFloat(offset * 26), width: 410, height: 470)
        if let saved = note.frame, saved.count == 4, saved.allSatisfy({ $0.isFinite }), saved[2] >= NoteWindowSizing.minimumWidth, saved[3] >= NoteWindowSizing.minimumHeight {
            let candidate = NSRect(x: saved[0], y: saved[1], width: saved[2], height: saved[3])
            if let screen = NSScreen.screens.first(where: { $0.visibleFrame.intersection(candidate).width >= 100 && $0.visibleFrame.intersection(candidate).height >= 100 }) {
                let area = screen.visibleFrame
                frame.size = NSSize(width: min(candidate.width, area.width), height: min(candidate.height, area.height))
                frame.origin.x = max(area.minX, min(candidate.minX, area.maxX - frame.width))
                frame.origin.y = max(area.minY, min(candidate.minY, area.maxY - frame.height))
            }
        }
        let window = NoteWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.minSize = NSSize(width: NoteWindowSizing.minimumWidth, height: NoteWindowSizing.minimumHeight)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .aqua)
        window.setFrame(frame, display: false)
        super.init(window: window)
        window.delegate = self
        window.contentView = paper
        buildInterface()
        titleField.stringValue = note.title
        textView.string = note.text
        applyTextStyle(note)
        apply(note)
        updateCompactLayout()
        hydrated = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func symbolButton(_ symbol: String, label: String, action: Selector) -> NSButton {
        let button = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: label)!, target: self, action: action)
        button.isBordered = false
        button.contentTintColor = quietInk
        button.toolTip = label
        button.setAccessibilityLabel(label)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: 28).isActive = true
        button.heightAnchor.constraint(equalToConstant: 26).isActive = true
        return button
    }

    func buildInterface() {
        let brand = brandLabel
        brand.font = .systemFont(ofSize: 11, weight: .medium)
        brand.textColor = quietInk
        brand.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(brand)
        let plus = symbolButton("plus", label: "新建便签", action: #selector(newNote))
        pinButton.image = NSImage(systemSymbolName: "pin", accessibilityDescription: "置顶便签")
        pinButton.target = self
        pinButton.action = #selector(togglePin)
        pinButton.isBordered = false
        pinButton.contentTintColor = quietInk
        pinButton.toolTip = "置顶便签"
        pinButton.setAccessibilityLabel("置顶便签")
        pinButton.translatesAutoresizingMaskIntoConstraints = false
        let more = symbolButton("ellipsis", label: "更多选项", action: #selector(showMore(_:)))
        fontButton = symbolButton("textformat.size", label: "调整字号", action: #selector(showFontSize(_:)))
        let tools = NSStackView(views: [fontButton, plus, pinButton, more])
        tools.orientation = .horizontal
        tools.spacing = 7
        tools.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(tools)

        titleField.placeholderString = "未命名便签"
        titleField.font = .systemFont(ofSize: 24, weight: .medium)
        titleField.textColor = ink
        titleField.isBezeled = false
        titleField.drawsBackground = false
        titleField.focusRingType = .none
        titleField.lineBreakMode = .byTruncatingTail
        titleField.maximumNumberOfLines = 1
        titleField.usesSingleLineMode = true
        titleField.delegate = self
        titleField.setAccessibilityLabel("便签标题")
        titleField.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(titleField)

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        scroll.contentView.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.scrollerStyle = .overlay
        scroll.translatesAutoresizingMaskIntoConstraints = false
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(width: 350, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainerInset = NSSize(width: 0, height: 5)
        textView.drawsBackground = false
        textView.isRichText = true
        textView.usesFontPanel = false
        textView.importsGraphics = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.insertionPointColor = ink
        textView.delegate = self
        textView.setAccessibilityLabel("便签内容")
        scroll.documentView = textView
        paper.addSubview(scroll)

        let line = NSView()
        line.wantsLayer = true
        line.layer?.backgroundColor = NSColor(hex: 0x6D6C83, alpha: 0.12).cgColor
        line.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(line)
        for (index, palette) in Palette.all.enumerated() {
            let swatch = SwatchButton(palette: palette)
            swatch.tag = index
            swatch.target = self
            swatch.action = #selector(choosePalette(_:))
            swatch.translatesAutoresizingMaskIntoConstraints = false
            swatch.widthAnchor.constraint(equalToConstant: 25).isActive = true
            swatch.heightAnchor.constraint(equalToConstant: 25).isActive = true
            swatches.append(swatch)
        }
        let themeRow = NSStackView(views: swatches)
        themeRow.orientation = .horizontal
        themeRow.spacing = 10
        themeRow.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(themeRow)
        paletteLabel.font = .systemFont(ofSize: 11, weight: .regular)
        paletteLabel.textColor = quietInk
        paletteLabel.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(paletteLabel)
        statusLabel.font = .systemFont(ofSize: 10)
        statusLabel.textColor = quietInk
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(statusLabel)
        countLabel.font = .monospacedDigitSystemFont(ofSize: 10, weight: .regular)
        countLabel.textColor = quietInk
        countLabel.translatesAutoresizingMaskIntoConstraints = false
        paper.addSubview(countLabel)

        let resizeGrip = ResizeGrip(frame: .zero)
        resizeGrip.translatesAutoresizingMaskIntoConstraints = false
        resizeGrip.onResizeEnded = { [weak self] in _ = self?.coordinator.save() }
        paper.addSubview(resizeGrip)

        titleHeight = titleField.heightAnchor.constraint(equalToConstant: 36)
        NSLayoutConstraint.activate([
            brand.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 26),
            brand.topAnchor.constraint(equalTo: paper.topAnchor, constant: 40),
            tools.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -21),
            tools.centerYAnchor.constraint(equalTo: brand.centerYAnchor),
            pinButton.widthAnchor.constraint(equalToConstant: 28), pinButton.heightAnchor.constraint(equalToConstant: 26),
            titleField.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 24),
            titleField.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -24),
            titleField.topAnchor.constraint(equalTo: brand.bottomAnchor, constant: 17),
            titleHeight,
            scroll.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 24),
            scroll.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -20),
            scroll.topAnchor.constraint(equalTo: titleField.bottomAnchor, constant: 12),
            scroll.bottomAnchor.constraint(equalTo: line.topAnchor, constant: -12),
            line.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 26),
            line.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -26),
            line.bottomAnchor.constraint(equalTo: paper.bottomAnchor, constant: -83),
            line.heightAnchor.constraint(equalToConstant: 1),
            themeRow.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 26),
            themeRow.bottomAnchor.constraint(equalTo: paper.bottomAnchor, constant: -42),
            paletteLabel.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -26),
            paletteLabel.centerYAnchor.constraint(equalTo: themeRow.centerYAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: paper.leadingAnchor, constant: 26),
            statusLabel.bottomAnchor.constraint(equalTo: paper.bottomAnchor, constant: -18),
            countLabel.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -26),
            countLabel.centerYAnchor.constraint(equalTo: statusLabel.centerYAnchor),
            resizeGrip.trailingAnchor.constraint(equalTo: paper.trailingAnchor, constant: -2),
            resizeGrip.bottomAnchor.constraint(equalTo: paper.bottomAnchor, constant: -2),
            resizeGrip.widthAnchor.constraint(equalToConstant: 28),
            resizeGrip.heightAnchor.constraint(equalToConstant: 28)
        ])
    }

    func applyTextStyle(_ note: Note) {
        bodyFontSize = NoteFormatting.size(note.bodyFontSize, fallback: 16)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 7
        paragraph.paragraphSpacing = 5
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: bodyFontSize), .foregroundColor: ink, .paragraphStyle: paragraph]
        textView.textStorage?.setAttributedString(NoteFormatting.document(for: note))
        textView.typingAttributes = attributes
        textView.defaultParagraphStyle = paragraph
    }

    func apply(_ note: Note) {
        let palette = Palette.find(note.theme)
        paper.palette = palette
        paletteLabel.stringValue = palette.name
        for swatch in swatches { swatch.selected = swatch.palette.id == palette.id }
        pinButton.image = NSImage(systemSymbolName: note.pinned ? "pin.fill" : "pin", accessibilityDescription: note.pinned ? "取消置顶" : "置顶便签")
        pinButton.setAccessibilityLabel(note.pinned ? "取消置顶" : "置顶便签")
        pinButton.toolTip = note.pinned ? "取消置顶" : "置顶便签"
        pinButton.contentTintColor = note.pinned ? palette.accent : quietInk
        window?.level = note.pinned ? .floating : .normal
        window?.title = "\(note.title.isEmpty ? "未命名便签" : note.title) — 雾笺"
        let size = NoteFormatting.size(note.titleFontSize, fallback: 24)
        if titleField.font?.pointSize != size {
            let font = NSFont.systemFont(ofSize: size, weight: .medium)
            titleField.font = font
            titleHeight.constant = ceil(font.ascender - font.descender + 8)
            if let window {
                let minHeight = max(NoteWindowSizing.minimumHeight, titleHeight.constant + 220)
                window.minSize = NSSize(width: NoteWindowSizing.minimumWidth, height: minHeight)
                if window.frame.height < minHeight {
                    var frame = window.frame
                    frame.origin.y -= minHeight - frame.height
                    frame.size.height = minHeight
                    window.setFrame(frame, display: true)
                }
            }
        }
        countLabel.stringValue = "\(note.text.count) 字"
    }

    func setSaveStatus(_ text: String, failed: Bool = false) {
        statusLabel.stringValue = text
        statusLabel.textColor = failed ? NSColor.systemRed : quietInk
    }
    func textDidChange(_ notification: Notification) {
        guard hydrated else { return }
        let data = NoteFormatting.data(for: textView.attributedString())
        coordinator.update(id) {
            $0.text = self.textView.string
            $0.richText = data
            $0.bodyFontSize = Double(self.bodyFontSize)
        }
    }
    func controlTextDidChange(_ obj: Notification) {
        guard hydrated else { return }
        coordinator.update(id) { $0.title = self.titleField.stringValue }
    }
    func windowDidMove(_ notification: Notification) { saveFrame() }
    func windowDidResize(_ notification: Notification) { updateCompactLayout(); saveFrame() }
    private func updateCompactLayout() {
        let width = window?.frame.width ?? 410
        brandLabel.stringValue = width < 320 ? "雾笺" : "雾笺  /  随手记"
        paletteLabel.isHidden = width < 300
    }
    private func saveFrame() {
        guard hydrated, let frame = window?.frame else { return }
        coordinator.update(id, touch: false) { $0.frame = [frame.origin.x, frame.origin.y, frame.width, frame.height] }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        coordinator.update(id, touch: false) { $0.visible = false }
        _ = coordinator.save()
        sender.orderOut(nil)
        return false
    }
    @objc func newNote() { coordinator.newNote(nil) }
    @objc func togglePin() { coordinator.update(id) { $0.pinned.toggle() } }
    @objc func choosePalette(_ sender: NSButton) { coordinator.update(id) { $0.theme = Palette.all[sender.tag].id } }
    @objc func archiveNote() { coordinator.archive(id) }
    @objc func exportNote() { coordinator.export(id) }
    private var editingTitle: Bool {
        guard let editor = titleField.currentEditor() else { return false }
        return window?.firstResponder === editor
    }
    private func currentSize(_ target: FontTarget, selection: NSRange) -> CGFloat {
        if target == .title { return titleField.font?.pointSize ?? 24 }
        let document = textView.attributedString()
        if document.length > 0 {
            let index = min(selection.location, document.length - 1)
            if let font = document.attribute(.font, at: index, effectiveRange: nil) as? NSFont { return font.pointSize }
        }
        return bodyFontSize
    }
    @objc func showFontSize(_ sender: NSButton) {
        if fontPopover?.isShown == true { fontPopover?.close(); return }
        fontSelection = textView.selectedRange()
        let controller = FontSizeController()
        controller.initialTarget = editingTitle ? .title : .body
        controller.onTargetChanged = { [weak self] target in
            guard let self else { return (16, "") }
            let message = target == .title ? "将应用到便签标题" : (self.fontSelection.length > 0 ? "仅调整选中的文字" : "将应用到全部正文")
            return (self.currentSize(target, selection: self.fontSelection), message)
        }
        controller.onApply = { [weak self] target, size in
            guard let self else { return }
            self.changeSize(size, target: target, selection: self.fontSelection)
        }
        controller.onDragBegan = { [weak self] target in self?.beginFontDrag(target) }
        controller.onDragEnded = { [weak self] in self?.endFontDrag() }
        let popover = NSPopover()
        popover.behavior = .transient
        popover.contentViewController = controller
        fontPopover = popover
        popover.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
    }
    private func beginFontDrag(_ target: FontTarget) {
        guard !draggingFont else { return }
        draggingFont = true
        if target == .title {
            let previous = titleField.font?.pointSize ?? 24
            finishFontDrag = { [weak self] in
                guard let self, self.titleField.font?.pointSize != previous else { return }
                self.window?.undoManager?.registerUndo(withTarget: self) { $0.setTitleSize(previous) }
                self.window?.undoManager?.setActionName("调整标题字号")
            }
        } else {
            let document = NSAttributedString(attributedString: textView.attributedString())
            let size = bodyFontSize
            let selection = textView.selectedRange()
            let typing = (textView.typingAttributes[.font] as? NSFont)?.pointSize ?? size
            textView.breakUndoCoalescing()
            finishFontDrag = { [weak self] in
                guard let self, !document.isEqual(to: self.textView.attributedString()) || size != self.bodyFontSize else { return }
                self.textView.undoManager?.registerUndo(withTarget: self) {
                    $0.replaceBody(document, defaultSize: size, selection: selection, typingSize: typing)
                }
                self.textView.undoManager?.setActionName("调整字号")
            }
        }
    }
    private func endFontDrag() {
        draggingFont = false
        finishFontDrag?()
        finishFontDrag = nil
        _ = coordinator.save()
    }
    func bumpFontSize(by delta: CGFloat) {
        let target: FontTarget = editingTitle ? .title : .body
        let selection = textView.selectedRange()
        let size = min(NoteFormatting.sizes.upperBound, max(NoteFormatting.sizes.lowerBound, currentSize(target, selection: selection) + delta))
        changeSize(size, target: target, selection: selection)
    }
    private func changeSize(_ size: CGFloat, target: FontTarget, selection: NSRange) {
        guard size.isFinite, NoteFormatting.sizes.contains(size) else { return }
        if target == .title { setTitleSize(size); return }
        let source = textView.attributedString()
        let selected = selection.length > 0
        let range = selected ? selection : NSRange(location: 0, length: source.length)
        guard range.location <= source.length, range.length <= source.length - range.location else { return }
        let resized = NoteFormatting.resized(source, range: range, size: size)
        replaceBody(resized, defaultSize: selected ? bodyFontSize : size, selection: selection, typingSize: size)
    }
    private func replaceBody(_ document: NSAttributedString, defaultSize: CGFloat, selection: NSRange, typingSize: CGFloat) {
        let previous = NSAttributedString(attributedString: textView.attributedString())
        let oldSize = bodyFontSize
        let oldSelection = textView.selectedRange()
        let oldTypingSize = (textView.typingAttributes[.font] as? NSFont)?.pointSize ?? bodyFontSize
        guard !previous.isEqual(to: document) || oldSize != defaultSize else { return }
        textView.breakUndoCoalescing()
        if !draggingFont {
            textView.undoManager?.registerUndo(withTarget: self) { controller in
                controller.replaceBody(previous, defaultSize: oldSize, selection: oldSelection, typingSize: oldTypingSize)
            }
            textView.undoManager?.setActionName("调整字号")
        }
        bodyFontSize = defaultSize
        textView.textStorage?.setAttributedString(document)
        textView.setSelectedRange(selection)
        var typing = textView.typingAttributes
        typing[.font] = NSFont.systemFont(ofSize: typingSize)
        typing[.foregroundColor] = ink
        textView.typingAttributes = typing
        textView.didChangeText()
    }
    private func setTitleSize(_ size: CGFloat) {
        let previous = titleField.font?.pointSize ?? 24
        guard previous != size else { return }
        if !draggingFont {
            window?.undoManager?.registerUndo(withTarget: self) { controller in controller.setTitleSize(previous) }
            window?.undoManager?.setActionName("调整标题字号")
        }
        coordinator.update(id) { $0.titleFontSize = Double(size) }
    }
    @objc func showMore(_ sender: NSButton) {
        let menu = NSMenu()
        for (title, action) in [("导出这张便签…", #selector(exportNote)), ("归档这张便签", #selector(archiveNote))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.maxY + 4), in: sender)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var notebook = Notebook()
    var controllers: [UUID: NoteController] = [:]
    let store: NoteStore
    var statusItem: NSStatusItem?
    var windowsMenu = NSMenu(title: "便签")
    var trayMenu = NSMenu()
    var menuSignatures: [ObjectIdentifier: String] = [:]
    var saveTimer: Timer?
    var failedToLoad = false
    var previewPath: String?
    var isPreview: Bool { previewPath != nil }

    override init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        store = NoteStore(directory: base.appendingPathComponent("MistNotes"))
        if let index = CommandLine.arguments.firstIndex(of: "--preview"), CommandLine.arguments.count > index + 1 {
            previewPath = CommandLine.arguments[index + 1]
        }
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        installMenus()
        if isPreview {
            notebook.notes = [Note(title: "把灵感，留在这里。", text: "给忙碌的日子，留一点呼吸。\n\n01  记下突然闪过的好想法\n02  把今天最重要的小事完成\n03  留些空白，慢慢来")]
            if let index = CommandLine.arguments.firstIndex(of: "--theme"), CommandLine.arguments.count > index + 1 {
                notebook.notes[0].theme = CommandLine.arguments[index + 1]
            }
        } else {
            do { notebook = try store.load() }
            catch {
                failedToLoad = true
                showError("读取便签失败，原数据已保留", error: error)
                NSApp.terminate(nil)
                return
            }
            if notebook.notes.isEmpty {
                _ = importNativeNotes()
                if notebook.notes.isEmpty { notebook.notes.append(Note(title: "我的第一张便签", text: "")) }
                guard save() else { showError("暂时无法保存便签", error: nil); return }
            }
            let visibleNotes = notebook.notes.filter { !$0.archived && $0.visible }
            if visibleNotes.isEmpty {
                if let first = notebook.notes.first(where: { !$0.archived }) { show(first.id) }
            } else {
                for (index, note) in visibleNotes.enumerated() { show(note.id, offset: index) }
            }
        }
        if isPreview {
            show(notebook.notes[0].id)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.renderPreview() }
        }
        if !isPreview { installStatusItem() }
        NSApp.activate(ignoringOtherApps: true)
    }

    func installMenus() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "雾笺")
        appMenu.addItem(item("关于雾笺", #selector(about), ""))
        appMenu.addItem(.separator())
        appMenu.addItem(item("开机登录时打开", #selector(toggleLogin), ""))
        appMenu.delegate = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏雾笺", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "退出雾笺", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)
        let fileItem = NSMenuItem()
        let file = NSMenu(title: "文件")
        file.addItem(item("新建便签", #selector(newNote(_:)), "n"))
        file.addItem(item("导入系统便笺副本", #selector(importNative), ""))
        file.addItem(.separator())
        file.addItem(withTitle: "收起这张便签", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = file
        main.addItem(fileItem)
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        editItem.submenu = edit
        main.addItem(editItem)
        let fontItem = NSMenuItem()
        let font = NSMenu(title: "字体")
        font.addItem(item("调整字号…", #selector(openFontSize), "t"))
        font.addItem(item("放大字号", #selector(increaseFontSize), "+"))
        font.addItem(item("缩小字号", #selector(decreaseFontSize), "-"))
        fontItem.submenu = font
        main.addItem(fontItem)
        let windowItem = NSMenuItem()
        windowsMenu.delegate = self
        windowItem.submenu = windowsMenu
        main.addItem(windowItem)
        NSApp.mainMenu = main
    }
    private var currentController: NoteController? {
        controllers.values.first { $0.window === NSApp.keyWindow || $0.window === NSApp.mainWindow }
    }
    @objc func openFontSize() {
        guard let controller = currentController else { return }
        controller.showFontSize(controller.fontButton)
    }
    @objc func increaseFontSize() { currentController?.bumpFontSize(by: 1) }
    @objc func decreaseFontSize() { currentController?.bumpFontSize(by: -1) }
    func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }
    func installStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let icon = NSImage(systemSymbolName: "note.text", accessibilityDescription: "雾笺")
        icon?.isTemplate = true
        statusItem?.button?.image = icon
        statusItem?.button?.toolTip = "雾笺"
        trayMenu.delegate = self
        statusItem?.menu = trayMenu
    }
    func menuNeedsUpdate(_ menu: NSMenu) {
        if menu === windowsMenu || menu === trayMenu {
            let signature = notebook.notes.map { "\($0.id.uuidString)|\($0.archived)|\($0.title)" }.joined(separator: "\u{0}")
            let menuID = ObjectIdentifier(menu)
            guard menuSignatures[menuID] != signature else { return }
            menuSignatures[menuID] = signature
            menu.removeAllItems()
            menu.addItem(item("新建便签", #selector(newNote(_:)), ""))
            menu.addItem(.separator())
            let active = notebook.notes.filter { !$0.archived }
            for note in active {
                let entry = item(note.title.isEmpty ? "未命名便签" : String(note.title.prefix(32)), #selector(openFromMenu(_:)), "")
                entry.representedObject = note.id.uuidString
                menu.addItem(entry)
            }
            let archived = notebook.notes.filter { $0.archived }
            if !archived.isEmpty {
                menu.addItem(.separator())
                let restore = NSMenu(title: "恢复归档")
                for note in archived {
                    let entry = item(note.title.isEmpty ? "未命名便签" : String(note.title.prefix(32)), #selector(restoreFromMenu(_:)), "")
                    entry.representedObject = note.id.uuidString
                    restore.addItem(entry)
                }
                let folder = NSMenuItem(title: "恢复归档", action: nil, keyEquivalent: "")
                folder.submenu = restore
                menu.addItem(folder)
            }
            if menu === trayMenu {
                menu.addItem(.separator())
                menu.addItem(withTitle: "退出雾笺", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
            }
        } else if let loginItem = menu.items.first(where: { $0.action == #selector(toggleLogin) }) {
            loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
        }
    }
    func show(_ id: UUID, offset: Int = 0) {
        guard let note = notebook.notes.first(where: { $0.id == id && !$0.archived }) else { return }
        if controllers[id] == nil { controllers[id] = NoteController(note: note, coordinator: self, offset: offset) }
        controllers[id]?.window?.makeKeyAndOrderFront(nil)
        controllers[id]?.window?.makeFirstResponder(controllers[id]?.textView)
        update(id, touch: false) { $0.visible = true }
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func newNote(_ sender: Any?) {
        let note = Note(title: "", text: "")
        notebook.notes.append(note)
        show(note.id, offset: controllers.count % 5)
        controllers[note.id]?.window?.makeFirstResponder(controllers[note.id]?.titleField)
        _ = save()
    }
    @objc func openFromMenu(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String, let id = UUID(uuidString: raw) { show(id) }
    }
    @objc func restoreFromMenu(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String, let id = UUID(uuidString: raw) {
            update(id) { $0.archived = false; $0.visible = true }
            show(id)
            _ = save()
        }
    }
    func update(_ id: UUID, touch: Bool = true, mutate: (inout Note) -> Void) {
        guard let index = notebook.notes.firstIndex(where: { $0.id == id }) else { return }
        mutate(&notebook.notes[index])
        if touch { notebook.notes[index].updatedAt = Date() }
        controllers[id]?.apply(notebook.notes[index])
        if !isPreview {
            controllers[id]?.setSaveStatus("保存中…")
            saveTimer?.invalidate()
            saveTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in _ = self?.save() }
        }
    }
    @discardableResult func save() -> Bool {
        guard !isPreview, !failedToLoad else { return true }
        saveTimer?.invalidate()
        do {
            try store.save(notebook)
            for controller in controllers.values { controller.setSaveStatus("已保存到本机") }
            return true
        } catch {
            for controller in controllers.values { controller.setSaveStatus("保存失败，请导出备份", failed: true) }
            return false
        }
    }
    func archive(_ id: UUID) {
        update(id) { $0.archived = true; $0.visible = false }
        guard save() else {
            showError("暂时无法归档，请先导出便签", error: nil)
            update(id) { $0.archived = false; $0.visible = true }
            return
        }
        controllers[id]?.window?.orderOut(nil)
    }
    func export(_ id: UUID) {
        guard let note = notebook.notes.first(where: { $0.id == id }) else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (note.title.isEmpty ? "便签" : note.title.replacingOccurrences(of: "/", with: "-")) + ".txt"
        panel.title = "导出便签"
        if panel.runModal() == .OK, let url = panel.url {
            do { try (note.title + "\n\n" + note.text).write(to: url, atomically: true, encoding: .utf8) }
            catch { showError("导出失败", error: error) }
        }
    }
    @discardableResult func importNativeNotes() -> [UUID] {
        let folder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/com.apple.Stickies/Data/Library/Stickies")
        guard let entries = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [] }
        var imported: [UUID] = []
        for url in entries.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where url.pathExtension == "rtfd" {
            let source = url.deletingPathExtension().lastPathComponent
            guard !notebook.importedSources.contains(source) else { continue }
            guard let attributed = try? NSAttributedString(url: url, options: [.documentType: NSAttributedString.DocumentType.rtfd], documentAttributes: nil) else { continue }
            let note = Note(title: imported.isEmpty && notebook.notes.isEmpty ? "日常备忘" : "系统便笺副本 \(notebook.notes.count + 1)", text: attributed.string)
            notebook.notes.append(note)
            notebook.importedSources.append(source)
            imported.append(note.id)
        }
        return imported
    }
    @objc func importNative() {
        let imported = importNativeNotes()
        if !save() { showError("导入尚未保存", error: nil); return }
        for (index, id) in imported.enumerated() { show(id, offset: index) }
        if imported.isEmpty {
            let alert = NSAlert()
            alert.messageText = "没有新的系统便笺"
            alert.informativeText = "已导入的便笺不会重复复制。雾笺中的副本独立保存。"
            alert.runModal()
        }
    }
    @objc func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else {
                try SMAppService.mainApp.register()
                if SMAppService.mainApp.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
            }
        } catch { showError("登录项设置未完成", error: error) }
    }
    @objc func about() {
        let alert = NSAlert()
        alert.messageText = "雾笺"
        alert.informativeText = "一点渐变，一点留白。\n\n便签自动保存在本机，可置顶、导出和恢复归档。关闭窗口只会收起便签，点击菜单栏图标可再次打开。\n\n系统便笺以文字副本导入，两边独立保存。"
        alert.runModal()
    }
    func showError(_ title: String, error: Error?) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = error?.localizedDescription ?? "请先将内容导出到其他位置，再重试。"
        alert.runModal()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            if let first = notebook.notes.first(where: { !$0.archived }) { show(first.id) }
            else { newNote(nil) }
        }
        return true
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if isPreview || failedToLoad || save() { return .terminateNow }
        showError("还有内容未保存，请先导出便签", error: nil)
        return .terminateCancel
    }
    func renderPreview() {
        guard let path = previewPath, let view = controllers.values.first?.paper else { NSApp.terminate(nil); return }
        view.layoutSubtreeIfNeeded()
        view.display()
        if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            if let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: path)) }
        }
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
