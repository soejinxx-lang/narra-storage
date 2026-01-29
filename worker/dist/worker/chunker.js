"use strict";
/**
 * Text Chunking Module
 *
 * Splits long text into smaller chunks to avoid timeout errors.
 * Respects sentence and paragraph boundaries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitIntoChunks = splitIntoChunks;
/**
 * Split text into chunks at safe boundaries
 *
 * @param text - Original text to split
 * @param maxChars - Maximum characters per chunk (default: 2500)
 * @returns Array of text chunks
 */
function splitIntoChunks(text, maxChars = 2500) {
    if (!text || text.length === 0) {
        return [];
    }
    // If text is already small enough, return as single chunk
    if (text.length <= maxChars) {
        return [{
                index: 0,
                text: text,
                charCount: text.length
            }];
    }
    const chunks = [];
    let currentPos = 0;
    let chunkIndex = 0;
    while (currentPos < text.length) {
        let chunkEnd = currentPos + maxChars;
        // If this is the last chunk, take everything
        if (chunkEnd >= text.length) {
            chunks.push({
                index: chunkIndex++,
                text: text.substring(currentPos),
                charCount: text.length - currentPos
            });
            break;
        }
        // Try to find a good boundary (in order of preference)
        const searchStart = currentPos;
        const searchEnd = chunkEnd;
        const searchText = text.substring(searchStart, searchEnd);
        // 1. Try paragraph boundary (\n\n)
        const paragraphBreak = searchText.lastIndexOf('\n\n');
        if (paragraphBreak > maxChars * 0.5) {
            chunkEnd = searchStart + paragraphBreak + 2; // Include the \n\n
        }
        else {
            // 2. Try sentence boundary (., !, ?, 。)
            const sentencePattern = /[.!?。]\s/g;
            let lastSentenceEnd = -1;
            let match;
            while ((match = sentencePattern.exec(searchText)) !== null) {
                lastSentenceEnd = match.index + match[0].length;
            }
            if (lastSentenceEnd > maxChars * 0.5) {
                chunkEnd = searchStart + lastSentenceEnd;
            }
            else {
                // 3. Try word boundary (space)
                const lastSpace = searchText.lastIndexOf(' ');
                if (lastSpace > maxChars * 0.5) {
                    chunkEnd = searchStart + lastSpace + 1; // Include the space
                }
                // If no good boundary found, just cut at maxChars
            }
        }
        chunks.push({
            index: chunkIndex++,
            text: text.substring(currentPos, chunkEnd),
            charCount: chunkEnd - currentPos
        });
        currentPos = chunkEnd;
    }
    return chunks;
}
