/** Vercel Edge Functions Full */
import { tsupConfigVercel } from './tsup.shared.js';

const base = tsupConfigVercel('src/adapters/vercel-edge.ts');

// Merge onSuccess to fix Vercel's export detection after build
export default {
    ...base,
    onSuccess: 'node scripts/fix-vercel-exports.mjs dist/vercel-edge.js',
};
