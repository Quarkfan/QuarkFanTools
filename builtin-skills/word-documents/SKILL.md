---
name: word-documents
description: Read, analyze, create, or revise Microsoft Word DOCX documents. Use for Word files, DOCX content extraction, document review, rewriting, or generating a deliverable document.
---

# Word Documents

Work in the current session workspace. Preserve the original file unless the user explicitly asks to replace it.

## Read and analyze

1. Use `textutil -convert txt -output <output.txt> <input.docx>` for readable text.
2. For structure, comments, tables, headers, or media, inspect OOXML with:
   `unzip -q <input.docx> -d <output-dir>`.
3. Use `Read` on extracted text and relevant XML/media files.
4. When layout matters, generate a Quick Look preview:
   `qlmanage -p -o <preview-dir> <input.docx>`
   and inspect every generated PDF/image with `Read`.

## Create or revise

- Prefer editing a copy.
- Use available document-generation tools from an authorized Skill when present.
- If no reliable writer exists, produce clean Markdown plus a precise conversion plan instead of claiming a DOCX was created.
- Verify the final artifact exists and is readable before replying.

