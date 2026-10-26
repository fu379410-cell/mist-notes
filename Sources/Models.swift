import Foundation

struct Note: Codable, Equatable {
    var id = UUID()
    var title: String
    var text: String
    var richText: Data? = nil
    var bodyFontSize: Double? = nil
    var titleFontSize: Double? = nil
    var theme = "lilac"
    var pinned = false
    var frame: [Double]? = nil
    var visible = true
    var archived = false
    var createdAt = Date()
    var updatedAt = Date()
}

struct Notebook: Codable, Equatable {
    var schemaVersion = 1
    var notes: [Note] = []
    var importedSources: [String] = []
}

enum StorageError: LocalizedError {
    case unsupportedVersion(Int)
    var errorDescription: String? {
        switch self {
        case .unsupportedVersion(let version): return "无法读取版本 \(version) 的便签数据。原文件已保留。"
        }
    }
}

final class NoteStore {
    let directory: URL
    var file: URL { directory.appendingPathComponent("notes.json") }
    var previousFile: URL { directory.appendingPathComponent("notes.previous.json") }
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    init(directory: URL) { self.directory = directory }

    func load() throws -> Notebook {
        guard FileManager.default.fileExists(atPath: file.path) else { return Notebook() }
        return try decode(Data(contentsOf: file))
    }

    private func decode(_ data: Data) throws -> Notebook {
        let result = try decoder.decode(Notebook.self, from: data)
        guard result.schemaVersion == 1 else { throw StorageError.unsupportedVersion(result.schemaVersion) }
        return result
    }

    func save(_ notebook: Notebook) throws {
        guard notebook.schemaVersion == 1 else { throw StorageError.unsupportedVersion(notebook.schemaVersion) }
        let encoded = try encoder.encode(notebook)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                              attributes: [.posixPermissions: 0o700])
        if FileManager.default.fileExists(atPath: file.path) {
            let oldData = try Data(contentsOf: file)
            _ = try decode(oldData)
            try oldData.write(to: previousFile, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: previousFile.path)
        }
        try encoded.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
}
