---
name: excel-workbooks
description: Read, analyze, validate, or create Microsoft Excel XLSX workbooks and CSV files. Use for spreadsheet formulas, tables, data cleaning, summaries, and workbook review.
---

# Excel Workbooks

Work on a copy unless the user explicitly asks to replace the source.

## Read and analyze

1. For CSV/TSV, inspect directly with `Read`.
2. QuarkfanTools automatically extracts XLSX Office Open XML and provides a generated `content.txt`.
3. Inspect the provided workbook content and original file as needed.
4. Validate formulas separately from cached values. Never assume cached values are current.
5. Do not require the user to install Office, Python, Node, LibreOffice, or command-line utilities.

## Create or revise

- Use an authorized spreadsheet-generation Skill/tool when available.
- Preserve formulas, number formats, and sheet names intentionally.
- Verify the final workbook exists and summarize any recalculation limitations.
