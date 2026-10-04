import type { Viseme } from '../../story/types.ts';
import { hashId } from '../../lib/media.ts';

/** Canvas avatar, shared by the stage and the recorded video. */
export function drawAvatar(ctx: CanvasRenderingContext2D, viseme: Viseme, speaker: string) {
  // Muted clothing tone per speaker, so characters differ without neon accents.
  const color = `hsl(${hashId(speaker) % 360} 32% 48%)`;
  const hair = '#2B211C';
  ctx.save();
  ctx.translate(820, 290);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 130, 95, 95, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.ellipse(0, -6, 67, 80, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E6C1AA';
  ctx.beginPath(); ctx.ellipse(0, 6, 55, 64, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.ellipse(-15, -47, 53, 24, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#221A16';
  for (const x of [-20, 20]) {
    ctx.beginPath(); ctx.ellipse(x, 0, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#B88A78'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(-4, 21); ctx.lineTo(3, 21); ctx.stroke();
  const sizes: Record<Viseme, [number, number]> = {
    rest: [13, 2], ah: [14, 15], ee: [20, 7], oh: [9, 14], mbp: [15, 1], fv: [16, 5],
  };
  const [width, height] = sizes[viseme];
  ctx.fillStyle = '#6B3434';
  ctx.beginPath(); ctx.ellipse(0, 38, width, height, 0, 0, Math.PI * 2); ctx.fill();
  if (viseme === 'ee' || viseme === 'fv') {
    ctx.fillStyle = '#FFF1E7'; ctx.fillRect(-width + 3, 34, width * 2 - 6, 4);
  }
  ctx.restore();
}
