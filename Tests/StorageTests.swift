import Foundation

@main struct StorageTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("mistnotes-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NoteStore(directory: directory)
        let empty = try store.load()
        assert(empty.notes.isEmpty)
        var notebook = Notebook()
        let text = "中文便签 ✨\n第二行\n\n保留空行与 emoji 📝"
        var note = Note(title: "测试便签", text: text)
        note.frame = [120, 220, 410, 470]
        notebook.notes = [note]
        notebook.importedSources = ["source-1"]
        try store.save(notebook)
        let first = try NoteStore(directory: directory).load()
        assert(first.notes[0].text == text && first.notes[0].id == note.id)
        assert(first.notes[0].frame == note.frame && first.importedSources == ["source-1"])
        notebook.notes[0].theme = "apricot"
        notebook.notes[0].pinned = true
        notebook.notes[0].archived = true
        notebook.notes[0].visible = false
        try store.save(notebook)
        let second = try store.load()
        assert(second.notes[0].theme == "apricot" && second.notes[0].pinned)
        assert(second.notes[0].archived && !second.notes[0].visible)
        assert(FileManager.default.fileExists(atPath: store.previousFile.path))
        let previous = try Data(contentsOf: store.previousFile)
        notebook.notes[0].archived = false
        notebook.notes[0].visible = true
        try store.save(notebook)
        let restored = try store.load()
        assert(restored.notes[0].text == text && !restored.notes[0].archived)
        let corrupt = Data("malformed-notebook".utf8)
        try corrupt.write(to: store.file)
        do { try store.save(notebook); fatalError("Corrupt file must not be overwritten") } catch {}
        let preserved = try Data(contentsOf: store.file)
        assert(preserved == corrupt)
        assert(!previous.isEmpty)
        print("PASS: Unicode round trip, window settings, backup, archive/restore, corrupt-file preservation")
    }
}
