#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
legacy_tmp=$(mktemp -d "${TMPDIR:-/tmp}/mist-notes-legacy.XXXXXX")
trap 'rm -rf -- "$legacy_tmp"' EXIT
swiftc -parse-as-library Sources/Models.swift Tests/StorageTests.swift -o "$legacy_tmp/storage"
"$legacy_tmp/storage"
swiftc -parse-as-library Sources/ResizeGrip.swift Tests/WindowSizingTests.swift -framework AppKit -o "$legacy_tmp/geometry"
"$legacy_tmp/geometry"
swiftc -parse-as-library Sources/Models.swift Sources/NoteFormatting.swift Sources/FontSizeController.swift Tests/FormattingTests.swift -framework AppKit -o "$legacy_tmp/formatting"
"$legacy_tmp/formatting"
