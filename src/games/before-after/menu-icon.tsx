// Inline vectors keep the menu independent of font glyphs and CSS pseudo-elements.
export function BeforeAfterMenuIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    daily: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 4h1m3 0h1m3 0h1m-9 3h1m3 0h1" /></>,
    packs: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    archive: <><rect x="3" y="3" width="18" height="5" rx="1.5" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-10 4h6" /></>,
    stats: <path d="M4 20h16M6 16v-5m6 5V4m6 12V8" />,
    themes: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" /><circle cx="7" cy="11" r=".7" /><circle cx="10" cy="7" r=".7" /><circle cx="15" cy="7" r=".7" /></>,
    "how-to": <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.5 2.15c-.85.46-1.2.88-1.2 1.85m0 3.2v.1" /></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 4v4m8 2v4m-6 2v4" strokeWidth="3.5" /></>,
  };
  return <svg className="ba-menu-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
