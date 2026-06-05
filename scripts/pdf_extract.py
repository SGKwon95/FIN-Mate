#!/usr/bin/env python3
"""PDF → plain text extractor using pdfplumber. Reads PDF from stdin, prints text to stdout."""
import sys
import pdfplumber

def extract(path: str) -> str:
    lines = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                lines.append(text)
    return "\n".join(lines)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    print(extract(sys.argv[1]), end="")
