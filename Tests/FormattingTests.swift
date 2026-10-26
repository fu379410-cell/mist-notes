import AppKit

@main struct FormattingTests {
    static func main() throws {
        _ = NSApplication.shared
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("mistnotes-font-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = NoteStore(directory: root)
        let text = "✨ 中文便签\n第二行 English\n\n最后一行"
        var note = Note(title: "旧便签", text: text)
        note.theme = "sage"
        note.pinned = true
        note.frame = [100, 200, 410, 470]
        var notebook = Notebook(notes: [note], importedSources: ["native-source"])
        try store.save(notebook)
        let legacyJSON = try JSONSerialization.jsonObject(with: Data(contentsOf: store.file)) as! [String: Any]
        let legacyNote = (legacyJSON["notes"] as! [[String: Any]])[0]
        assert(legacyNote["richText"] == nil && legacyNote["bodyFontSize"] == nil)
        let migrated = try store.load()
        assert(migrated.notes[0].text == text && migrated.notes[0].pinned && migrated.notes[0].theme == "sage")
        assert(migrated.notes[0].frame == note.frame && migrated.importedSources == ["native-source"])
        let plain = NoteFormatting.document(for: migrated.notes[0])
        assert((plain.attribute(.font, at: 0, effectiveRange: nil) as! NSFont).pointSize == 16)

        let range = (text as NSString).range(of: "中文便签")
        let sized = NoteFormatting.resized(plain, range: range, size: 20.25)
        assert(sized.string == text)
        assert((sized.attribute(.font, at: range.location, effectiveRange: nil) as! NSFont).pointSize == 20.25)
        assert((sized.attribute(.font, at: 0, effectiveRange: nil) as! NSFont).pointSize == 16)
        note.richText = NoteFormatting.data(for: sized)
        assert(note.richText != nil)
        note.bodyFontSize = 16
        note.titleFontSize = 32
        notebook.notes = [note]
        try store.save(notebook)
        let saved = try store.load()
        let reopened = NoteFormatting.document(for: saved.notes[0])
        assert(reopened.string == text)
        let reopenedSize = (reopened.attribute(.font, at: range.location, effectiveRange: nil) as! NSFont).pointSize
        assert(abs(reopenedSize - 20.25) < 0.01, "Fractional font size changed to \(reopenedSize)")
        assert((reopened.attribute(.font, at: 0, effectiveRange: nil) as! NSFont).pointSize == 16)
        assert(saved.notes[0].titleFontSize == 32 && saved.notes[0].bodyFontSize == 16)

        note.richText = Data("invalid RTF".utf8)
        note.bodyFontSize = 22
        let fallback = NoteFormatting.document(for: note)
        assert(fallback.string == text)
        assert((fallback.attribute(.font, at: 0, effectiveRange: nil) as! NSFont).pointSize == 22)
        let invalidRange = NoteFormatting.resized(plain, range: NSRange(location: plain.length + 1, length: 2), size: 30)
        assert(invalidRange.isEqual(to: plain))
        let editor = FontSizeController()
        var appliedSize: CGFloat = 0
        editor.onTargetChanged = { _ in (16, "测试") }
        editor.onApply = { _, size in appliedSize = size }
        _ = editor.view
        assert(editor.slider.isContinuous)
        editor.slider.doubleValue = FontSizeController.position(for: 20.25)
        editor.perform(NSSelectorFromString("sliderChanged"))
        assert(appliedSize == 20.25, "Dragging must apply fractional font sizes immediately")
        assert(editor.valueLabel.stringValue == "20.25 pt")
        assert(FontSizeController.size(at: 0) == 1 && FontSizeController.size(at: 1) == 200)
        print("PASS: legacy compatibility, Unicode selection, fractional sizes, rich text reopen, safe fallback, live slider")
    }
}
