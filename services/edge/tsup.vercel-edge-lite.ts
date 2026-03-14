/** Vercel Edge Functions Lite */
import { tsupConfigVercel } from './tsup.shared.js';

const base = tsupConfigVercel('src/adapters/vercel-edge-lite.ts');

// Merge onSuccess to fix Vercel's export detection after build
export default {
    ...base,
    onSuccess: 'node scripts/fix-vercel-exports.mjs dist/vercel-edge-lite.js',
};
