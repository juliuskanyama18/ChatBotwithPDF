/**
 * Image Extraction and Captioning with GPT-4 Vision
 * Feature 3: Extract images from PDFs and generate searchable captions
 */

import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

// Lazy-load OpenAI client
let openaiClient = null;

function getOpenAIClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}

/**
 * Generate caption for an image using GPT-4 Vision
 * @param {string} imagePath - Path to the image file
 * @param {number} pageNumber - Page number where image was found
 * @param {string} documentType - Type of document (pdf, pptx, etc.)
 * @returns {Promise<string>} Generated caption
 */
export async function generateImageCaption(imagePath, pageNumber, documentType = 'pdf') {
    try {
        const openai = getOpenAIClient();

        // Read image and convert to base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase().substring(1);
        const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

        const citationType = documentType === 'pptx' ? 'slide' : 'page';

        // Call GPT-4o Vision (updated from deprecated gpt-4-vision-preview)
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 500,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `You are analyzing an image from ${citationType} ${pageNumber} of a document. Please provide a detailed but concise description of this image that will help in answering questions about the document content. Focus on:
                            1. What the image shows (chart, diagram, photo, table, etc.)
                            2. Key information or data visible
                            3. Labels, titles, or text in the image
                            4. Relationships or patterns shown
                            5. Any important visual elements

                            Format your response as: "This image shows [description]. Key elements include [details]."
                            Keep it factual and searchable.`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ]
        });

        const caption = response.choices[0].message.content.trim();
        console.log(`   📷 Generated caption for image on ${citationType} ${pageNumber}: ${caption.substring(0, 80)}...`);

        return caption;

    } catch (error) {
        console.error(`❌ Error generating caption for image on page ${pageNumber}:`, error.message);

        // Return a fallback caption
        return `[Image on ${documentType === 'pptx' ? 'slide' : 'page'} ${pageNumber} - caption generation failed]`;
    }
}

/**
 * Request Python service to extract images from PDF
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Array>} Array of {imagePath, pageNumber}
 */
export async function extractImagesFromPDF(pdfPath) {
    try {
        // Check if Python service is available
        const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

        const FormData = (await import('form-data')).default;
        const axios = (await import('axios')).default;

        const form = new FormData();
        form.append('file', fs.createReadStream(pdfPath));

        const response = await axios.post(
            `${pythonServiceUrl}/extract-images`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 120000, // 2 minutes timeout for large PDFs
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        return response.data.images || [];

    } catch (error) {
        console.log(`⚠️  Python service unavailable for image extraction: ${error.message}`);
        console.log(`   ℹ️  Skipping image extraction. To enable, start python_service.`);
        return [];
    }
}

/**
 * Process all images in a document and generate captions
 * @param {string} documentPath - Path to the document file
 * @param {string} documentType - Type of document (pdf, pptx, docx, etc.)
 * @returns {Promise<Array>} Array of {caption, pageNumber, imagePath}
 */
export async function extractAndCaptionImages(documentPath, documentType) {
    console.log('\n📷 Starting image extraction and captioning...');

    const ext = documentType.toLowerCase();

    // Currently only supporting PDFs for image extraction
    if (ext !== 'pdf') {
        console.log(`   ℹ️  Image extraction not yet supported for ${ext.toUpperCase()} files`);
        return [];
    }

    try {
        // Extract images using Python service
        const extractedImages = await extractImagesFromPDF(documentPath);

        if (extractedImages.length === 0) {
            console.log('   ℹ️  No images found in document');
            return [];
        }

        console.log(`   ✅ Extracted ${extractedImages.length} images from PDF`);

        // Generate captions for each image
        const captionedImages = [];

        for (const { imagePath, pageNumber } of extractedImages) {
            if (fs.existsSync(imagePath)) {
                const caption = await generateImageCaption(imagePath, pageNumber, documentType);

                captionedImages.push({
                    caption,
                    pageNumber,
                    imagePath
                });

                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`   ✅ Generated ${captionedImages.length} image captions`);
        return captionedImages;

    } catch (error) {
        console.error('❌ Error in image extraction and captioning:', error);
        return [];
    }
}

/**
 * Clean up temporary image files
 * @param {Array} imagePaths - Array of image file paths to delete
 */
export function cleanupImageFiles(imagePaths) {
    for (const imagePath of imagePaths) {
        try {
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        } catch (error) {
            console.error(`Error deleting image file ${imagePath}:`, error.message);
        }
    }
}