// Public, device-local appearance preferences; never account or progress data.
export const gameThemes = {
  syllabl: ["light", "dark", "forest", "lilac", "banana", "garnet", "fuchsia", "peachy"],
  rarity: ["light", "dark", "forest", "lilac", "banana", "garnet", "fuchsia", "peachy"],
  "before-after": ["signature", "tidepool", "orchard", "neapolitan", "metro", "midnight", "terminal", "cabaret"],
  dual: ["mint", "rose", "violet", "tide", "citrus", "meadow", "dusk", "ice"],
  decode: ["console", "ultraviolet", "deep-sea", "redshift", "paper-tape", "blueprint", "daybreak", "soft-circuit"],
} as const;
export type ThemedGame = keyof typeof gameThemes;
export const themeCookieName = (game: string) => `mg-theme-${game}`;
export function validGameTheme(game: string, value: string | undefined | null): string | null {
  const choices: readonly string[] | undefined = gameThemes[game as ThemedGame];
  return value && choices?.includes(value) ? value : null;
}

// Runs before the body paints. Existing localStorage-only preferences are migrated
// once; only a mismatched legacy palette waits for its layout-time restoration.
export const themeBootstrap = `(()=>{try{const themes=${JSON.stringify(gameThemes)};const pending=[];for(const [game,choices] of Object.entries(themes)){const name='mg-theme-'+game;const existing=document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.slice(name.length+1);const old=localStorage.getItem('mg-games:v1:'+game+':theme');if(!choices.includes(existing)&&choices.includes(old)){document.cookie=name+'='+old+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');pending.push(game)}}if(pending.length)document.documentElement.setAttribute('data-theme-bootstrap',pending.join(' '))}catch{}})();`;
