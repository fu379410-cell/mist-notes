import AppKit

enum NoteFormatting {
    static let sizes: ClosedRange<CGFloat> = 1...200

    static func size(_ stored: Double?, fallback: CGFloat) -> CGFloat {
        guard let stored, stored.isFinite, sizes.contains(CGFloat(stored)) else { return fallback }
        return CGFloat(stored)
    }

    static func document(for note: Note) -> NSAttributedString {
        if let data = note.richText,
           let document = try? NSAttributedString(data: data, options: [.documentType: NSAttributedString.DocumentType.rtf], documentAttributes: nil),
           document.string == note.text {
            return document
        }
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 7
        paragraph.paragraphSpacing = 5
        return NSAttributedString(string: note.text, attributes: [
            .font: NSFont.systemFont(ofSize: size(note.bodyFontSize, fallback: 16)),
            .foregroundColor: NSColor(srgbRed: 52 / 255, green: 56 / 255, blue: 71 / 255, alpha: 1),
            .paragraphStyle: paragraph
        ])
    }

    static func resized(_ source: NSAttributedString, range: NSRange, size: CGFloat) -> NSAttributedString {
        let result = NSMutableAttributedString(attributedString: source)
        guard size.isFinite, sizes.contains(size), range.location <= result.length,
              range.length <= result.length - range.location else { return result }
        var fonts: [(NSRange, NSFont)] = []
        result.enumerateAttribute(.font, in: range) { value, run, _ in
            let font = value as? NSFont ?? NSFont.systemFont(ofSize: 16)
            fonts.append((run, NSFontManager.shared.convert(font, toSize: size)))
        }
        for (run, font) in fonts { result.addAttribute(.font, value: font, range: run) }
        return result
    }

    static func data(for document: NSAttributedString) -> Data? {
        try? document.data(from: NSRange(location: 0, length: document.length),
                           documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf])
    }
}
