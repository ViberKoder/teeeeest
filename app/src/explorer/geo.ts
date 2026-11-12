/** Where a language is mostly spoken: [longitude, latitude] of one representative point. The map shows INTERFACE languages of players
 *  (the only place hint Telegram gives a bot), so a bubble means "players whose Telegram speaks this language", not a country count. */
export const LANG_PLACE: Record<string, [number, number]> = {
  en: [-98, 39], es: [-3.7, 40.4], pt: [-47, -15], fr: [2.3, 46.6], de: [10.4, 51.1], it: [12.5, 42.5], nl: [5.3, 52.1], pl: [19.1, 52], cs: [15.5, 49.8],
  sk: [19.7, 48.7], hu: [19.5, 47.1], ro: [25, 45.9], bg: [25.5, 42.7], el: [22, 39], sr: [20.9, 44], hr: [16, 45.1], sv: [16, 62], no: [9, 61], nb: [9, 61],
  da: [10, 56], fi: [26, 64], uk: [31.2, 49], be: [27.9, 53.7], ru: [60, 58], kk: [67, 48], uz: [64.6, 41.4], ky: [74.6, 41.2], tg: [71, 38.9], tk: [59.5, 39],
  az: [47.6, 40.4], hy: [45, 40.1], ka: [43.4, 42.3], tr: [35.2, 39], ar: [42, 24], he: [34.9, 31.5], fa: [53.7, 32.4], ur: [69.3, 30.4], hi: [78.9, 22.6],
  bn: [90.4, 23.7], ta: [78.7, 11.1], id: [113.9, -2.5], ms: [101.9, 4.2], vi: [108.3, 14], th: [100.9, 15.9], zh: [104, 35], ja: [138.2, 36.2], ko: [127.8, 36.4],
  fil: [121.8, 12.9], sw: [37.9, -6.4], am: [40.5, 9.1], af: [24.7, -28.5],
};
export const langName = (code: string): string => {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.split('-')[0]) ?? code; } catch { return code; }
};
