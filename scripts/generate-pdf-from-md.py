"""Convert docs/*.md (with YAML front matter) to a readable PDF."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = {
    '\u2014': '-',  # em dash
    '\u2013': '-',  # en dash
    '\u2192': '->',
    '\u2190': '<-',
    '\u2022': '-',
    '\u2018': "'",
    '\u2019': "'",
    '\u201c': '"',
    '\u201d': '"',
    '\u2026': '...',
}


def ascii_safe(text: str) -> str:
    for src, dst in REPLACEMENTS.items():
        text = text.replace(src, dst)
    return text.encode('ascii', 'replace').decode('ascii')


class DocPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, ascii_safe('Nexus Lexis - Frontend Integration Guide'), align='C', new_x='LMARGIN', new_y='NEXT')
        self.ln(2)

    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f'Page {self.page_no()}', align='C')


def strip_front_matter(text: str) -> tuple[dict[str, str], str]:
    meta: dict[str, str] = {}
    if text.startswith('---'):
        end = text.find('---', 3)
        if end != -1:
            block = text[3:end].strip()
            body = text[end + 3:].lstrip()
            for line in block.splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    meta[k.strip()] = v.strip()
            return meta, body
    return meta, text


def write_wrapped(pdf: DocPDF, text: str, size: int = 10, style: str = '') -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font('Helvetica', style, size)
    pdf.set_text_color(0, 0, 0)
    safe = ascii_safe(text)
    if len(safe) > 90 and ' ' not in safe[:90]:
        safe = safe.replace('/', '/ ')
    pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 5.5, safe)


def convert(md_path: Path, out_path: Path) -> None:
    meta, body = strip_front_matter(md_path.read_text(encoding='utf-8'))
    pdf = DocPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    title = meta.get('Document Title', 'Nexus Lexis Document')
    pdf.set_font('Helvetica', 'B', 16)
    pdf.multi_cell(0, 8, ascii_safe(title))
    pdf.ln(2)

    subtitle = f"{meta.get('Document ID', '')}  |  v{meta.get('Version', '1.0')}  |  {meta.get('Last Updated', '')}"
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 5, ascii_safe(subtitle))
    pdf.ln(4)

    in_code = False
    code_lines: list[str] = []
    table_rows: list[list[str]] = []

    def flush_code() -> None:
        nonlocal code_lines, in_code
        if not code_lines:
            return
        pdf.set_x(pdf.l_margin)
        pdf.set_fill_color(245, 245, 245)
        pdf.set_font('Courier', '', 8)
        width = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.multi_cell(width, 4.5, ascii_safe('\n'.join(code_lines)), fill=True)
        pdf.ln(2)
        code_lines = []
        in_code = False

    def flush_table() -> None:
        nonlocal table_rows
        if not table_rows:
            return
        pdf.set_x(pdf.l_margin)
        pdf.set_font('Helvetica', '', 9)
        width = pdf.w - pdf.l_margin - pdf.r_margin
        for ri, row in enumerate(table_rows):
            style = 'B' if ri == 0 else ''
            pdf.set_font('Helvetica', style, 9)
            line = '  |  '.join(cell.strip() for cell in row)
            pdf.multi_cell(width, 5, ascii_safe(line))
        pdf.ln(2)
        table_rows = []

    for raw in body.splitlines():
        line = raw.rstrip()

        if line.startswith('```'):
            if in_code:
                flush_code()
            else:
                flush_table()
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if '|' in line and line.strip().startswith('|'):
            if re.match(r'^\|\s*[-:| ]+\|\s*$', line.strip()):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            table_rows.append(cells)
            continue

        flush_table()

        if line.strip() == '---':
            pdf.ln(2)
            continue
        if line.startswith('# '):
            flush_code()
            pdf.ln(3)
            pdf.set_font('Helvetica', 'B', 14)
            pdf.multi_cell(0, 7, ascii_safe(line[2:].strip()))
            pdf.ln(1)
        elif line.startswith('## '):
            flush_code()
            pdf.ln(2)
            pdf.set_font('Helvetica', 'B', 12)
            pdf.multi_cell(0, 6, ascii_safe(line[3:].strip()))
            pdf.ln(1)
        elif line.startswith('### '):
            flush_code()
            pdf.ln(1)
            pdf.set_font('Helvetica', 'B', 11)
            pdf.multi_cell(0, 6, ascii_safe(line[4:].strip()))
        elif line.startswith('> '):
            pdf.set_font('Helvetica', 'I', 9)
            pdf.set_text_color(60, 60, 60)
            pdf.multi_cell(0, 5, ascii_safe(line[2:].strip()))
            pdf.set_text_color(0, 0, 0)
        elif line.startswith('- '):
            write_wrapped(pdf, f'  • {line[2:].strip()}', size=9)
        elif line.strip():
            clean = re.sub(r'\*\*(.+?)\*\*', r'\1', line.strip())
            clean = re.sub(r'`([^`]+)`', r'\1', clean)
            write_wrapped(pdf, clean, size=9)

    flush_code()
    flush_table()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))


def main() -> None:
    stem = sys.argv[1] if len(sys.argv) > 1 else 'Frontend_Integration_NoOTP'
    md_path = ROOT / 'docs' / f'{stem}.md'
    out_path = ROOT / 'docs' / f'{stem}.pdf'
    convert(md_path, out_path)
    print(f'Created: {out_path}')


if __name__ == '__main__':
    main()
