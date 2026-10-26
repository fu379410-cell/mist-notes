#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
mkdir -p build/雾笺.app/Contents/MacOS build/雾笺.app/Contents/Resources
if [[ ! -f build/AppIcon.icns ]]; then
    swift Sources/MakeIcon.swift build/AppIcon.iconset
    for size in 16 32 128 256 512; do
        sips -z "$size" "$size" build/AppIcon.iconset/icon_512x512@2x.png --out "build/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
        if [[ "$size" -lt 512 ]]; then
            twice=$((size * 2))
            sips -z "$twice" "$twice" build/AppIcon.iconset/icon_512x512@2x.png --out "build/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
        fi
    done
    iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns
    rm -r build/AppIcon.iconset
fi
swiftc -O -target arm64-apple-macosx13.0 Sources/Models.swift Sources/NoteFormatting.swift Sources/FontSizeController.swift Sources/ResizeGrip.swift Sources/main.swift -o build/雾笺.app/Contents/MacOS/MistNotes -framework AppKit -framework ServiceManagement
cp Info.plist build/雾笺.app/Contents/Info.plist
if [[ -f build/AppIcon.icns ]]; then cp build/AppIcon.icns build/雾笺.app/Contents/Resources/AppIcon.icns; fi
codesign --force --sign - build/雾笺.app
printf 'Built %s\n' "$PWD/build/雾笺.app"
