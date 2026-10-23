/**
 * 스크린샷/사진에서 텍스트 추출 (브라우저 안에서 Tesseract.js 로 처리, 서버 전송 없음).
 * 처음 실행 시 언어 데이터(영어 약 10MB, 한국어 추가 시 더 큼)를 내려받는다.
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
