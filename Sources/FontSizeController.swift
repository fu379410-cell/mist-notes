import AppKit

enum FontTarget: Int { case body, title }

final class LiveFontSlider: NSSlider {
    var onDragBegan: (() -> Void)?
    var onDragEnded: (() -> Void)?
    override func mouseDown(with event: NSEvent) {
        onDragBegan?()
        super.mouseDown(with: event)
        onDragEnded?()
    }
}

final class FontSizeController: NSViewController {
    let targetControl = NSSegmentedControl(labels: ["正文", "标题"], trackingMode: .selectOne, target: nil, action: nil)
    let slider = LiveFontSlider(value: 0, minValue: 0, maxValue: 1, target: nil, action: nil)
    let valueLabel = NSTextField(labelWithString: "16 pt")
    let hint = NSTextField(wrappingLabelWithString: "")
    var initialTarget: FontTarget = .body
    var onApply: ((FontTarget, CGFloat) -> Void)?
    var onTargetChanged: ((FontTarget) -> (CGFloat, String))?
    var onDragBegan: ((FontTarget) -> Void)?
    var onDragEnded: (() -> Void)?

    static func position(for size: CGFloat) -> Double {
        log(Double(min(200, max(1, size)))) / log(200)
    }
    static func size(at position: Double) -> CGFloat {
        CGFloat((pow(200, min(1, max(0, position))) * 100).rounded() / 100)
    }

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 286, height: 194))
        preferredContentSize = view.frame.size
        let heading = NSTextField(labelWithString: "拖动调整字号")
        heading.font = .systemFont(ofSize: 15, weight: .semibold)
        valueLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        valueLabel.textColor = .secondaryLabelColor
        targetControl.selectedSegment = initialTarget.rawValue
        targetControl.target = self
        targetControl.action = #selector(changeTarget)
        targetControl.setAccessibilityLabel("调整范围")
        slider.target = self
        slider.action = #selector(sliderChanged)
        slider.isContinuous = true
        slider.setAccessibilityLabel("拖动调整字体大小")
        slider.toolTip = "向左拖动缩小，向右拖动放大"
        slider.onDragBegan = { [weak self] in
            guard let self else { return }
            self.onDragBegan?(self.target)
        }
        slider.onDragEnded = { [weak self] in self?.onDragEnded?() }
        let small = NSTextField(labelWithString: "A")
        small.font = .systemFont(ofSize: 12)
        let large = NSTextField(labelWithString: "A")
        large.font = .systemFont(ofSize: 24)
        for label in [small, large] { label.textColor = .secondaryLabelColor }
        hint.font = .systemFont(ofSize: 11)
        hint.textColor = .secondaryLabelColor
        let instruction = NSTextField(labelWithString: "向左缩小 · 向右放大 · 实时预览")
        instruction.font = .systemFont(ofSize: 10)
        instruction.textColor = .tertiaryLabelColor
        for control in [heading, valueLabel, targetControl, small, slider, large, hint, instruction] {
            control.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(control)
        }
        NSLayoutConstraint.activate([
            heading.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            heading.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
            valueLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            valueLabel.centerYAnchor.constraint(equalTo: heading.centerYAnchor),
            targetControl.leadingAnchor.constraint(equalTo: heading.leadingAnchor),
            targetControl.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            targetControl.topAnchor.constraint(equalTo: heading.bottomAnchor, constant: 12),
            slider.topAnchor.constraint(equalTo: targetControl.bottomAnchor, constant: 19),
            slider.leadingAnchor.constraint(equalTo: small.trailingAnchor, constant: 9),
            slider.trailingAnchor.constraint(equalTo: large.leadingAnchor, constant: -9),
            slider.heightAnchor.constraint(equalToConstant: 28),
            small.leadingAnchor.constraint(equalTo: heading.leadingAnchor),
            small.centerYAnchor.constraint(equalTo: slider.centerYAnchor),
            large.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            large.centerYAnchor.constraint(equalTo: slider.centerYAnchor),
            hint.leadingAnchor.constraint(equalTo: heading.leadingAnchor),
            hint.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            hint.topAnchor.constraint(equalTo: slider.bottomAnchor, constant: 12),
            instruction.leadingAnchor.constraint(equalTo: heading.leadingAnchor),
            instruction.topAnchor.constraint(equalTo: hint.bottomAnchor, constant: 6)
        ])
        refresh()
    }

    private var target: FontTarget { FontTarget(rawValue: targetControl.selectedSegment) ?? .body }
    private func display(_ size: CGFloat) {
        let value = String(format: "%.2f", Double(size)).replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
        valueLabel.stringValue = "\(value) pt"
        slider.setAccessibilityValueDescription("\(value) 点")
    }
    private func refresh() {
        guard let (size, message) = onTargetChanged?(target) else { return }
        slider.doubleValue = Self.position(for: size)
        display(size)
        hint.stringValue = message
    }
    @objc private func changeTarget() { refresh() }
    @objc private func sliderChanged() {
        let size = Self.size(at: slider.doubleValue)
        display(size)
        onApply?(target, size)
    }
}
