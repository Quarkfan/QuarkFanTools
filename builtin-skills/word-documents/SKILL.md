---
name: word-documents
description: Read, analyze, create, or revise Microsoft Word DOCX documents. Use for Word files, DOCX content extraction, document review, rewriting, or generating a deliverable document.
---

# Word Documents

Work in the current session workspace. Preserve the original file unless the user explicitly asks to replace it.

## Read and analyze

QuarkfanTools automatically extracts DOCX Office Open XML and provides a generated `content.txt` beside the received file. Use `Read` on these provided resources. Do not require the user to install Office, Python, Node, LibreOffice, or command-line utilities.

When layout cannot be established from the provided resources, state the limitation instead of assuming the result.

## Create or revise

- Prefer editing a copy.
- Use available document-generation tools from an authorized Skill when present.
- If no reliable writer exists, produce clean Markdown plus a precise conversion plan instead of claiming a DOCX was created.
- Verify the final artifact exists and is readable before replying.
