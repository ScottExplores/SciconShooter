type ShareScoreCardImageOptions = {
  cardUrl: string;
  sourceSvg?: string;
  fileName: string;
  title: string;
  text: string;
};

export type ScoreCardShareMethod = 'native' | 'clipboard' | 'download';

const svgToPng = async (svgBlob: Blob) => {
  const sourceUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Score card image could not be rendered.'));
      nextImage.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Score card canvas is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Score card image could not be created.'));
      }, 'image/png', 0.96);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

const downloadImage = (blob: Blob, fileName: string) => {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
};

export const shareScoreCardImage = async ({
  cardUrl,
  sourceSvg,
  fileName,
  title,
  text
}: ShareScoreCardImageOptions): Promise<ScoreCardShareMethod> => {
  let svgBlob: Blob;
  if (sourceSvg) {
    svgBlob = new Blob([sourceSvg], { type: 'image/svg+xml' });
  } else {
    const response = await fetch(cardUrl, { headers: { Accept: 'image/svg+xml' } });
    if (!response.ok) throw new Error('Score card image is unavailable.');
    svgBlob = await response.blob();
  }

  const pngBlob = await svgToPng(svgBlob);
  const file = new File([pngBlob], fileName, { type: 'image/png' });
  const canShareFile = Boolean(navigator.share && navigator.canShare?.({ files: [file] }));

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      return 'clipboard';
    } catch {
      // Embedded browsers can expose the clipboard API while blocking image writes.
    }
  }

  if (canShareFile) {
    try {
      await navigator.share({ title, text, files: [file] });
      return 'native';
    } catch (error: any) {
      if (/abort|cancel/i.test(error?.name || error?.message || '')) throw error;
    }
  }

  downloadImage(pngBlob, fileName);
  return 'download';
};
