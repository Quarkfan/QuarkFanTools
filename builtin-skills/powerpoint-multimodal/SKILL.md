---
name: powerpoint-multimodal
description: Read, analyze, review, or create PowerPoint PPTX presentations. Always use multimodal visual inspection for PPT/PPTX analysis because slide meaning depends on layout, charts, images, and typography.
---

# PowerPoint Multimodal

PPT analysis is incomplete without visual inspection. Never conclude from extracted text alone.
Before analysis, confirm the runtime prompt says `当前模型多模态视觉能力：已启用`. If it is not enabled, stop and tell the user to enable multimodal vision in model configuration.

## Required analysis workflow

1. Copy the source into the current session workspace if needed.
2. Extract OOXML and media:
   `unzip -q <input.pptx> -d <extracted-dir>`.
3. Generate a visual Quick Look preview:
   `qlmanage -p -o <preview-dir> <input.pptx>`.
4. Find every generated PDF/image/preview artifact and inspect it with `Read`.
5. Correlate visual findings with slide XML, notes, charts, and embedded media.
6. Report any slide that could not be visually inspected. Do not silently treat text extraction as equivalent.

## Review criteria

- Narrative and slide order
- Visual hierarchy and readability
- Charts, diagrams, screenshots, and image meaning
- Alignment, clipping, overflow, contrast, and inconsistent styles
- Speaker notes and hidden details when present

## Create or revise

- Use an authorized presentation-generation Skill/tool when available.
- Render the final deck and visually inspect all slides before replying.
- For images generated during the task, save them in the session workspace and use `lark-cli im +messages-reply --image` when the user requests delivery in Feishu.
