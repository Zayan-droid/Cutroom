import type { Size } from '../../edit/geometry.ts';

// Container and codec choice for exported edits. MP4 (H.264) plays almost
// everywhere and is usually hardware-encoded, so it comes first; browsers that
// can only record WebM (Firefox) get VP9 or VP8.

const VIDEO_ONLY = [
  'video/mp4;codecs=avc1.640033',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const WITH_AUDIO = [
  'video/mp4;codecs=avc1.640033,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** The first recording type the browser supports, or null if it can't record video. */
export function pickRecordingType(isSupported: (type: string) => boolean, audio: boolean): string | null {
  for (const type of audio ? WITH_AUDIO : VIDEO_ONLY) {
    try {
      if (isSupported(type)) return type;
    } catch {
      /* A throwing check counts as unsupported. */
    }
  }
  return null;
}

/** The browser's recorder support, without assuming MediaRecorder exists (or a DOM at all). */
export function browserRecordingType(audio = true): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' ||
    !HTMLCanvasElement.prototype.captureStream) return null;
  return pickRecordingType((type) => MediaRecorder.isTypeSupported(type), audio);
}

export function extensionFor(type: string): 'mp4' | 'webm' {
  return type.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** "MP4 video" / "WebM video", for the output summary. */
export function formatName(type: string | null): string {
  if (!type) return 'Unavailable in this browser';
  return extensionFor(type) === 'mp4' ? 'MP4 video' : 'WebM video';
}

/**
 * Bits per second for a recording of `size` pixels: about 0.1 bit per pixel
 * per frame at 30 fps (6 Mbps at 1080p, 25 Mbps at 4K), kept between 2 and 40 Mbps.
 */
export function videoBitrate(size: Size): number {
  return Math.round(Math.min(40_000_000, Math.max(2_000_000, size.width * size.height * 30 * 0.1)));
}
