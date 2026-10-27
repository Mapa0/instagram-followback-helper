"""Package only the extension's public runtime files and documentation."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = (
    "manifest.json",
    "popup.html",
    "popup.css",
    "popup.js",
    "runner.html",
    "runner.css",
    "runner.js",
    "service_worker.js",
)


def build(output_dir, tag=None):
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)?", version):
        raise ValueError("Invalid manifest version")
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Tag {tag!r} does not match manifest v{version}")

    sources = [(ROOT / "extension" / name, name) for name in RUNTIME_FILES]
    sources += [(ROOT / name, name) for name in ("README.md", "LICENSE", "CHANGELOG.md", "CONTRIBUTING.md")]
    for source, _ in sources:
        if not source.is_file():
            raise FileNotFoundError(source)

    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f"instagram-followback-helper-v{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for source, name in sources:
            info = zipfile.ZipInfo(f"instagram-followback-helper/{name}", date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            # Normalize text line endings so equivalent checkouts produce the same archive.
            text = source.read_text(encoding="utf-8").replace("\r\n", "\n")
            bundle.writestr(info, text.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise ValueError("Corrupt release archive")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output_dir / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(archive)
    print(f"SHA-256: {digest}")
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    parser.add_argument("--tag", help="Expected version tag, for example v1.0.4")
    args = parser.parse_args()
    build(args.output_dir.resolve(), args.tag)


if __name__ == "__main__":
    main()
