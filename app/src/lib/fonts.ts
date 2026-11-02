/**
 * Matter is a commercial typeface (Displaay Type Foundry) and is not bundled with this repository.
 * Put licensed `Matter-Regular|Medium|SemiBold|Bold.woff2` into `app/public/fonts/` and they are picked up
 * automatically; until then the system font (San Francisco / Roboto) is used, exactly like Telegram's own clients.
 */
const FILES: [string, string][] = [
  ['400', 'Matter-Regular.woff2'],
  ['500', 'Matter-Medium.woff2'],
  ['600', 'Matter-SemiBold.woff2'],
  ['700', 'Matter-Bold.woff2'],
];

export async function loadMatter() {
  if (typeof FontFace === 'undefined') return;
  await Promise.all(
    FILES.map(async ([weight, file]) => {
      try {
        const url = `/fonts/${file}`;
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || !(head.headers.get('content-type') ?? '').includes('font') && !file.endsWith('.woff2')) return;
        const face = new FontFace('Matter', `url(${url}) format('woff2')`, { weight, display: 'swap' } as FontFaceDescriptors);
        document.fonts.add(await face.load());
      } catch {
        /* not installed: fall back to the system font */
      }
    }),
  );
}
