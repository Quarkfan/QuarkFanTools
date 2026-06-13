---
name: excel-workbooks
description: Read, analyze, validate, or create Microsoft Excel XLSX workbooks and CSV files. Use for spreadsheet formulas, tables, data cleaning, summaries, and workbook review.
---

# Excel Workbooks

Work on a copy unless the user explicitly asks to replace the source.

## Read and analyze

1. For CSV/TSV, inspect directly with `Read`.
2. For XLSX, extract OOXML:
   `unzip -q <input.xlsx> -d <extracted-dir>`.
3. Inspect `xl/workbook.xml`, relationships, worksheets, shared strings, styles, and charts as needed.
4. Validate formulas separately from cached values. Never assume cached values are current.
5. For visual layout or charts, generate a Quick Look preview with:
   `qlmanage -p -o <preview-dir> <input.xlsx>`
   and inspect generated PDF/images with `Read`.

## Create or revise

- Use an authorized spreadsheet-generation Skill/tool when available.
- Preserve formulas, number formats, and sheet names intentionally.
- Verify the final workbook exists and summarize any recalculation limitations.

