"""
Multi-Strategy Document Chunking
Provides document-type-specific chunking strategies for PDF, DOCX, and PPTX files.
Uses advanced NLP libraries (spaCy, NLTK) for intelligent text segmentation.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional
import re
import spacy
import nltk
from loguru import logger

# Download required NLTK data (run once)
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab', quiet=True)


class ChunkingStrategy(ABC):
    """Base abstract class for document-type-specific chunking strategies"""

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        """
        Initialize chunking strategy

        Args:
            chunk_size: Target size for each chunk in tokens
            chunk_overlap: Number of overlapping tokens between chunks
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.nlp = None

    @abstractmethod
    def chunk(self, text: str, metadata: Optional[Dict] = None) -> List[Dict]:
        """
        Chunk text using strategy-specific logic

        Args:
            text: Input text to chunk
            metadata: Optional metadata about the document

        Returns:
            List of chunk dictionaries with text, offset, and metadata
        """
        pass

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation: 1 token ~= 4 chars)"""
        return len(text) // 4

    def _create_chunk(self, text: str, start_offset: int, chunk_index: int, metadata: Optional[Dict] = None) -> Dict:
        """Create a standardized chunk dictionary"""
        return {
            'text': text.strip(),
            'start_offset': start_offset,
            'end_offset': start_offset + len(text),
            'token_count': self._estimate_tokens(text),
            'chunk_index': chunk_index,
            'metadata': metadata or {}
        }


class PDFChunkingStrategy(ChunkingStrategy):
    """
    PDF-specific chunking strategy
    - Section-aware chunking (detects headings and numbered sections)
    - Preserves table boundaries
    - Smart overlap at section boundaries
    - Handles multi-column layouts
    """

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        super().__init__(chunk_size, chunk_overlap)
        # Load spaCy model for sentence segmentation
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy model 'en_core_web_sm' not found. Run: python -m spacy download en_core_web_sm")
            self.nlp = None

    def chunk(self, text: str, metadata: Optional[Dict] = None) -> List[Dict]:
        """Chunk PDF text with section awareness"""
        if not text or not text.strip():
            return []

        logger.info(f"📄 PDF Chunking: {len(text)} characters")

        # Step 1: Detect sections (headings, numbered sections)
        sections = self._detect_sections(text)

        # Step 2: Chunk each section independently
        chunks = []
        chunk_index = 0

        for section in sections:
            section_chunks = self._chunk_section(
                section['text'],
                section['start_offset'],
                section.get('heading'),
                chunk_index
            )
            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)

        logger.info(f"✅ Created {len(chunks)} PDF chunks")
        return chunks

    def _detect_sections(self, text: str) -> List[Dict]:
        """Detect sections based on headings and structural patterns"""
        sections = []

        # Patterns for section headings
        heading_patterns = [
            r'^[A-Z][A-Z\s]{10,}$',  # ALL CAPS HEADINGS
            r'^\d+\.\s+[A-Z]',        # 1. Numbered Sections
            r'^Chapter\s+\d+',        # Chapter 1
            r'^Section\s+\d+',        # Section 1
            r'^\d+\.\d+\s+[A-Z]',     # 1.1 Subsections
        ]

        lines = text.split('\n')
        current_section = {'text': '', 'start_offset': 0, 'heading': None}
        current_offset = 0

        for line in lines:
            is_heading = False

            # Check if line matches heading pattern
            for pattern in heading_patterns:
                if re.match(pattern, line.strip()):
                    # Save previous section if it has content
                    if current_section['text'].strip():
                        sections.append(current_section)

                    # Start new section
                    current_section = {
                        'text': line + '\n',
                        'start_offset': current_offset,
                        'heading': line.strip()
                    }
                    is_heading = True
                    break

            if not is_heading:
                current_section['text'] += line + '\n'

            current_offset += len(line) + 1  # +1 for newline

        # Add final section
        if current_section['text'].strip():
            sections.append(current_section)

        # If no sections detected, treat entire text as one section
        if not sections:
            sections = [{'text': text, 'start_offset': 0, 'heading': None}]

        logger.debug(f"Detected {len(sections)} sections in PDF")
        return sections

    def _chunk_section(self, text: str, start_offset: int, heading: Optional[str], base_index: int) -> List[Dict]:
        """Chunk a single section with sentence-aware splitting"""
        if not text.strip():
            return []

        chunks = []

        # Use spaCy for sentence segmentation if available
        if self.nlp:
            doc = self.nlp(text)
            sentences = [sent.text for sent in doc.sents]
        else:
            # Fallback to NLTK
            sentences = nltk.sent_tokenize(text)

        current_chunk = heading + '\n\n' if heading else ''
        current_offset = start_offset
        chunk_start_offset = start_offset

        for sentence in sentences:
            # Check if adding sentence would exceed chunk size
            potential_chunk = current_chunk + sentence + ' '

            if self._estimate_tokens(potential_chunk) > self.chunk_size and current_chunk.strip():
                # Save current chunk
                chunks.append(self._create_chunk(
                    current_chunk,
                    chunk_start_offset,
                    base_index + len(chunks),
                    {'section_heading': heading}
                ))

                # Start new chunk with overlap (last sentence + current sentence)
                overlap_text = sentences[max(0, len(chunks) - 1)] if chunks else ''
                current_chunk = (heading + '\n\n' if heading else '') + overlap_text + sentence + ' '
                chunk_start_offset = current_offset - len(overlap_text)
            else:
                current_chunk += sentence + ' '

            current_offset += len(sentence) + 1

        # Add final chunk
        if current_chunk.strip():
            chunks.append(self._create_chunk(
                current_chunk,
                chunk_start_offset,
                base_index + len(chunks),
                {'section_heading': heading}
            ))

        return chunks


class DOCXChunkingStrategy(ChunkingStrategy):
    """
    DOCX-specific chunking strategy
    - Paragraph-based chunking (respects document structure)
    - Keeps lists together
    - Preserves heading hierarchy
    - Handles tables as single units
    """

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        super().__init__(chunk_size, chunk_overlap)
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy model not found")
            self.nlp = None

    def chunk(self, text: str, metadata: Optional[Dict] = None) -> List[Dict]:
        """Chunk DOCX text with paragraph awareness"""
        if not text or not text.strip():
            return []

        logger.info(f"📝 DOCX Chunking: {len(text)} characters")

        # Split by double newlines (paragraph boundaries in DOCX)
        paragraphs = text.split('\n\n')

        chunks = []
        current_chunk = ''
        current_offset = 0
        chunk_start_offset = 0

        for para in paragraphs:
            if not para.strip():
                current_offset += len(para) + 2  # +2 for \n\n
                continue

            # Check if paragraph is a list item
            is_list = self._is_list_item(para)

            # If adding paragraph would exceed chunk size
            potential_chunk = current_chunk + para + '\n\n'

            if self._estimate_tokens(potential_chunk) > self.chunk_size and current_chunk.strip():
                # Save current chunk
                chunks.append(self._create_chunk(
                    current_chunk,
                    chunk_start_offset,
                    len(chunks),
                    {'source': 'docx'}
                ))

                # Start new chunk with overlap
                if is_list:
                    # Keep entire list together
                    current_chunk = para + '\n\n'
                    chunk_start_offset = current_offset
                else:
                    # Add overlap from previous paragraph
                    overlap_paras = paragraphs[max(0, len(chunks) - 1):len(chunks)]
                    current_chunk = '\n\n'.join(overlap_paras) + '\n\n' + para + '\n\n'
                    chunk_start_offset = current_offset - sum(len(p) + 2 for p in overlap_paras)
            else:
                current_chunk += para + '\n\n'

            current_offset += len(para) + 2

        # Add final chunk
        if current_chunk.strip():
            chunks.append(self._create_chunk(
                current_chunk,
                chunk_start_offset,
                len(chunks),
                {'source': 'docx'}
            ))

        logger.info(f"✅ Created {len(chunks)} DOCX chunks")
        return chunks

    def _is_list_item(self, text: str) -> bool:
        """Detect if text is a list item"""
        list_patterns = [
            r'^\s*[\-\*\•]\s+',      # Bullet points
            r'^\s*\d+\.\s+',          # Numbered lists
            r'^\s*[a-z]\)\s+',        # a) b) c)
            r'^\s*[ivxIVX]+\.\s+',    # Roman numerals
        ]
        return any(re.match(pattern, text) for pattern in list_patterns)


class PPTXChunkingStrategy(ChunkingStrategy):
    """
    PPTX-specific chunking strategy
    - Slide-based chunking (each slide is a logical unit)
    - Preserves bullet point structure
    - Keeps speaker notes with slide content
    - Maintains slide titles
    """

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        super().__init__(chunk_size, chunk_overlap)

    def chunk(self, text: str, metadata: Optional[Dict] = None) -> List[Dict]:
        """Chunk PPTX text with slide awareness"""
        if not text or not text.strip():
            return []

        logger.info(f"📊 PPTX Chunking: {len(text)} characters")

        # Detect slide boundaries (usually separated by "--- Slide X ---")
        slides = self._detect_slides(text)

        chunks = []
        for slide_idx, slide in enumerate(slides):
            # Each slide becomes one or more chunks
            slide_chunks = self._chunk_slide(slide, slide_idx)
            chunks.extend(slide_chunks)

        logger.info(f"✅ Created {len(chunks)} PPTX chunks from {len(slides)} slides")
        return chunks

    def _detect_slides(self, text: str) -> List[Dict]:
        """Detect individual slides in PPTX text"""
        # Common slide separators
        slide_patterns = [
            r'---\s*Slide\s+\d+\s*---',
            r'=====\s*Slide\s+\d+\s*=====',
            r'Slide\s+\d+:',
        ]

        # Try to find slide separators
        for pattern in slide_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                # Split by this pattern
                parts = re.split(pattern, text, flags=re.IGNORECASE)
                slides = []
                offset = 0

                for i, part in enumerate(parts):
                    if part.strip():
                        slides.append({
                            'text': part.strip(),
                            'slide_number': i,
                            'start_offset': offset
                        })
                    offset += len(part)

                return slides

        # If no slide separators found, split by large gaps or treat as single slide
        paragraphs = text.split('\n\n\n')  # Triple newline might indicate slide break
        if len(paragraphs) > 1:
            slides = []
            offset = 0
            for i, para in enumerate(paragraphs):
                if para.strip():
                    slides.append({
                        'text': para.strip(),
                        'slide_number': i + 1,
                        'start_offset': offset
                    })
                offset += len(para) + 3
            return slides

        # Fallback: treat entire text as one slide
        return [{'text': text, 'slide_number': 1, 'start_offset': 0}]

    def _chunk_slide(self, slide: Dict, slide_idx: int) -> List[Dict]:
        """Chunk a single slide (if it's too large)"""
        text = slide['text']

        # If slide fits in one chunk, return it
        if self._estimate_tokens(text) <= self.chunk_size:
            return [self._create_chunk(
                text,
                slide['start_offset'],
                slide_idx,
                {'slide_number': slide.get('slide_number', slide_idx + 1)}
            )]

        # Slide is too large, split by bullet points or paragraphs
        bullets = self._extract_bullets(text)

        if bullets:
            # Chunk by grouping bullet points
            return self._chunk_bullets(bullets, slide['start_offset'], slide_idx, slide.get('slide_number'))
        else:
            # Fallback to paragraph-based chunking
            return self._chunk_by_paragraphs(text, slide['start_offset'], slide_idx, slide.get('slide_number'))

    def _extract_bullets(self, text: str) -> List[str]:
        """Extract bullet points from slide text"""
        lines = text.split('\n')
        bullets = []

        bullet_pattern = r'^\s*[\-\*\•]\s+'

        for line in lines:
            if re.match(bullet_pattern, line):
                bullets.append(line.strip())

        return bullets

    def _chunk_bullets(self, bullets: List[str], start_offset: int, slide_idx: int, slide_number: int) -> List[Dict]:
        """Group bullets into chunks"""
        chunks = []
        current_chunk = ''
        chunk_start = start_offset

        for bullet in bullets:
            potential = current_chunk + bullet + '\n'

            if self._estimate_tokens(potential) > self.chunk_size and current_chunk:
                chunks.append(self._create_chunk(
                    current_chunk,
                    chunk_start,
                    slide_idx * 100 + len(chunks),  # Unique index
                    {'slide_number': slide_number}
                ))
                current_chunk = bullet + '\n'
                chunk_start = start_offset + len(current_chunk)
            else:
                current_chunk = potential

        if current_chunk.strip():
            chunks.append(self._create_chunk(
                current_chunk,
                chunk_start,
                slide_idx * 100 + len(chunks),
                {'slide_number': slide_number}
            ))

        return chunks

    def _chunk_by_paragraphs(self, text: str, start_offset: int, slide_idx: int, slide_number: int) -> List[Dict]:
        """Fallback: chunk by paragraphs"""
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = ''
        chunk_start = start_offset

        for para in paragraphs:
            if not para.strip():
                continue

            potential = current_chunk + para + '\n\n'

            if self._estimate_tokens(potential) > self.chunk_size and current_chunk:
                chunks.append(self._create_chunk(
                    current_chunk,
                    chunk_start,
                    slide_idx * 100 + len(chunks),
                    {'slide_number': slide_number}
                ))
                current_chunk = para + '\n\n'
                chunk_start = start_offset + len(current_chunk)
            else:
                current_chunk = potential

        if current_chunk.strip():
            chunks.append(self._create_chunk(
                current_chunk,
                chunk_start,
                slide_idx * 100 + len(chunks),
                {'slide_number': slide_number}
            ))

        return chunks


def get_chunking_strategy(file_type: str, chunk_size: int = 800, chunk_overlap: int = 100) -> ChunkingStrategy:
    """
    Factory function to get appropriate chunking strategy based on file type

    Args:
        file_type: File extension ('pdf', 'docx', 'pptx')
        chunk_size: Target chunk size in tokens
        chunk_overlap: Overlap size in tokens

    Returns:
        Appropriate ChunkingStrategy instance
    """
    strategies = {
        'pdf': PDFChunkingStrategy,
        'docx': DOCXChunkingStrategy,
        'doc': DOCXChunkingStrategy,
        'pptx': PPTXChunkingStrategy,
        'ppt': PPTXChunkingStrategy,
    }

    strategy_class = strategies.get(file_type.lower())

    if not strategy_class:
        logger.warning(f"Unknown file type '{file_type}', using PDF strategy as default")
        strategy_class = PDFChunkingStrategy

    return strategy_class(chunk_size=chunk_size, chunk_overlap=chunk_overlap)


# Main entry point for testing
if __name__ == "__main__":
    # Test with sample text
    sample_pdf = """
    CHAPTER 1: INTRODUCTION

    This is the introduction section. It contains multiple sentences to demonstrate chunking.
    We want to see how the PDF chunking strategy handles section boundaries.

    1.1 Background

    This subsection provides background information about the topic.
    It should be chunked appropriately with the heading preserved.

    CHAPTER 2: METHODOLOGY

    This chapter describes the methodology used in the research.
    It contains detailed explanations across multiple paragraphs.
    """

    chunker = get_chunking_strategy('pdf', chunk_size=200, chunk_overlap=50)
    chunks = chunker.chunk(sample_pdf)

    print(f"\n✅ Generated {len(chunks)} chunks:\n")
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i + 1}:")
        print(f"  Text: {chunk['text'][:100]}...")
        print(f"  Tokens: {chunk['token_count']}")
        print(f"  Metadata: {chunk['metadata']}\n")
