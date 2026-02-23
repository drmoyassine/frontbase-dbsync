/**
 * Base CSS Styles for Edge SSR Pages
 * 
 * Fallback CSS used when the Tailwind CSS bundle (cssBundle) is not available
 * on legacy pages. Includes CSS variables, resets, and component base styles.
 * 
 * Extracted from pages.ts generateHtmlDocument() for maintainability.
 */

export const FALLBACK_CSS = `
/* FALLBACK CSS - Used when cssBundle is not available (legacy pages) */
:root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
}
.dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215 20% 65%;
    --popover: 224 71% 4%;
    --popover-foreground: 213 31% 91%;
    --card: 224 71% 4%;
    --card-foreground: 213 31% 91%;
    --border: 216 34% 17%;
    --input: 216 34% 17%;
    --primary: 210 40% 98%;
    --primary-foreground: 222 47% 11%;
    --secondary: 222 47% 11%;
    --secondary-foreground: 210 40% 98%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --ring: 216 34% 17%;
}
*, *::before, *::after { box-sizing: border-box; }
html { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
.fb-page { min-height: 100vh; display: flex; flex-direction: column; }
.fb-button { display: inline-flex; align-items: center; justify-content: center; }
.fb-heading { margin: 0; }
.fb-heading-1 { font-size: 2.25rem; font-weight: 700; }
.fb-heading-2 { font-size: 1.875rem; font-weight: 600; }
.fb-heading-3 { font-size: 1.5rem; font-weight: 600; }
.fb-loading { opacity: 0.7; pointer-events: none; }
.fb-skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: skeleton 1.5s infinite; }
@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
.logo-marquee-container { overflow: hidden; width: 100%; mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
.logo-marquee-track { display: flex; width: max-content; animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; }
.logo-marquee-pause-on-hover:hover .logo-marquee-track { animation-play-state: paused; }
.logo-marquee-item { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.logo-marquee-mobile-only .logo-marquee-track { animation: none; flex-wrap: wrap; justify-content: center; gap: 2rem; width: 100%; }
.logo-marquee-mobile-only .logo-marquee-container { mask-image: none; -webkit-mask-image: none; }
/* Hide duplicate logos on desktop (duplicates are for seamless marquee on mobile) */
.logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: none; }
@media (max-width: 640px) {
    .logo-marquee-mobile-only .logo-marquee-track { animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; flex-wrap: nowrap; justify-content: flex-start; gap: 0; width: max-content; }
    .logo-marquee-mobile-only .logo-marquee-container { mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
    /* Show all logos (including duplicates) on mobile for seamless marquee */
    .logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: flex; }
}
/* Dark mode: invert raster images in Navbar and LogoCloud */
.dark .fb-navbar img:not(.no-invert),
.dark .fb-logo-cloud img:not(.no-invert) { filter: invert(1) brightness(1.1); }
`;
