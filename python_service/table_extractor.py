"""
Table Extraction Module - Task B
Uses pdfplumber to extract tables from PDF documents and convert to Markdown format
"""

import pdfplumber
import io
from typing import List, Dict
from loguru import logger


def table_to_markdown(table: List[List[str]]) -> str:
    """
    Convert a table (list of lists) to Markdown format

    Args:
        table: List of rows, where each row is a list of cell values

    Returns:
        Markdown-formatted table string
    """
    if not table or len(table) < 1:
        return ""

    # Clean and format cells
    def clean_cell(cell):
        if cell is None:
            return ""
        return str(cell).strip().replace('\n', ' ').replace('|', '\\|')

    markdown_lines = []

    # Header row (first row)
    header = table[0]
    header_cells = [clean_cell(cell) for cell in header]
    markdown_lines.append("| " + " | ".join(header_cells) + " |")

    # Separator row
    separator = "|" + "|".join([" --- " for _ in header]) + "|"
    markdown_lines.append(separator)

    # Data rows
    for row in table[1:]:
        row_cells = [clean_cell(cell) for cell in row]
        # Pad row if it's shorter than header
        while len(row_cells) < len(header):
            row_cells.append("")
        markdown_lines.append("| " + " | ".join(row_cells[:len(header)]) + " |")

    return "\n".join(markdown_lines)


def extract_tables_from_pdf(pdf_content: bytes) -> List[Dict]:
    """
    Extract tables from PDF and convert to Markdown

    Args:
        pdf_content: PDF file content as bytes

    Returns:
        List of dicts with format:
        [
            {
                "page": int,
                "table_index": int,
                "table_markdown": str
            },
            ...
        ]
    """
    logger.info("Starting table extraction from PDF")

    extracted_tables = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                # Extract tables from page
                tables = page.extract_tables()

                if not tables:
                    continue

                logger.info(f"Found {len(tables)} table(s) on page {page_num}")

                for table_index, table in enumerate(tables, 1):
                    if not table or len(table) == 0:
                        continue

                    # Convert table to Markdown
                    markdown_table = table_to_markdown(table)

                    if markdown_table:
                        extracted_tables.append({
                            "page": page_num,
                            "table_index": table_index,
                            "table_markdown": markdown_table
                        })

                        logger.debug(f"Extracted table {table_index} from page {page_num}: {len(markdown_table)} chars")

        logger.info(f"Total tables extracted: {len(extracted_tables)}")
        return extracted_tables

    except Exception as e:
        logger.error(f"Error extracting tables from PDF: {str(e)}")
        raise


def extract_tables_from_pdf_file(pdf_path: str) -> List[Dict]:
    """
    Extract tables from PDF file path

    Args:
        pdf_path: Path to PDF file

    Returns:
        List of extracted tables in Markdown format
    """
    logger.info(f"Extracting tables from PDF file: {pdf_path}")

    try:
        with open(pdf_path, 'rb') as f:
            pdf_content = f.read()

        return extract_tables_from_pdf(pdf_content)

    except Exception as e:
        logger.error(f"Error reading PDF file {pdf_path}: {str(e)}")
        raise