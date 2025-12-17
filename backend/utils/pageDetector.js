/**
 * Detect page/slide references in user questions
 * Supports patterns like:
 * - "page 30"
 * - "on page 5"
 * - "pages 10-15"
 * - "slide 3"
 * - "slides 5 to 8"
 */

export function detectPageReferences(question) {
    const patterns = [
        // Single page: "page 30", "on page 5", "at page 12"
        /(?:on|at|in|from)?\s*(?:page|pg|p\.?)\s*(\d+)/gi,

        // Page range: "pages 10-15", "pages 5 to 8", "page 3-7"
        /(?:pages?|pgs?|p\.?)\s*(\d+)\s*(?:-|to|through)\s*(\d+)/gi,

        // Slide references: "slide 5", "slides 3-7"
        /(?:on|at|in|from)?\s*(?:slides?|sl\.?)\s*(\d+)(?:\s*(?:-|to|through)\s*(\d+))?/gi,

        // Chapter references (optional): "chapter 2", "in chapter 3"
        /(?:in|from)?\s*(?:chapter|ch\.?)\s*(\d+)/gi
    ];

    const results = {
        hasPageReference: false,
        pageNumbers: [],
        pageRange: null,
        type: null, // 'single', 'range', 'slide', 'chapter'
        originalMatch: null
    };

    for (const pattern of patterns) {
        const matches = [...question.matchAll(pattern)];

        if (matches.length > 0) {
            results.hasPageReference = true;

            for (const match of matches) {
                results.originalMatch = match[0];

                // Single page or slide
                if (match[1] && !match[2]) {
                    const pageNum = parseInt(match[1], 10);
                    results.pageNumbers.push(pageNum);

                    // Determine type
                    if (match[0].toLowerCase().includes('slide')) {
                        results.type = 'slide';
                    } else if (match[0].toLowerCase().includes('chapter')) {
                        results.type = 'chapter';
                    } else {
                        results.type = 'single';
                    }
                }
                // Page range
                else if (match[1] && match[2]) {
                    const start = parseInt(match[1], 10);
                    const end = parseInt(match[2], 10);

                    results.pageRange = { from: start, to: end };
                    results.type = 'range';

                    // Add all pages in range
                    for (let i = start; i <= end; i++) {
                        results.pageNumbers.push(i);
                    }
                }
            }

            // Remove duplicates
            results.pageNumbers = [...new Set(results.pageNumbers)];

            // If we found a match, break
            if (results.pageNumbers.length > 0) {
                break;
            }
        }
    }

    return results;
}

/**
 * Expand page range with context window
 * For "page 30", also include pages 29 and 31 for better context
 */
export function expandPageRangeWithContext(pageNumbers, windowSize = 1) {
    if (!pageNumbers || pageNumbers.length === 0) {
        return [];
    }

    const expanded = new Set();

    for (const page of pageNumbers) {
        // Add the page itself
        expanded.add(page);

        // Add context window
        for (let i = 1; i <= windowSize; i++) {
            if (page - i > 0) {
                expanded.add(page - i);
            }
            expanded.add(page + i);
        }
    }

    return Array.from(expanded).sort((a, b) => a - b);
}

/**
 * Map chapter to page range (if document has chapter metadata)
 * This is a placeholder - in production, you'd need chapter metadata
 */
export function mapChapterToPages(chapterNumber, documentMetadata) {
    // TODO: Implement chapter-to-page mapping when metadata is available
    // For now, return null
    return null;
}