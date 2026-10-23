/**
 * Extract text from a screenshot/photo with Tesseract.js, entirely in the browser (nothing is uploaded).
 * The first run downloads language data (~10MB for English, more with Korean).
 */
export async function imageToText(
  file: File,
  withKorean: boolean,
  onProgress?: (p: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(withKorean ? ['eng', 'kor'] : 'eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
