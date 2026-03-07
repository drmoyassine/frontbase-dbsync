/** Cloudflare Workers Full — uses tsupConfigNode shared factory */
import { tsupConfigNode } from './tsup.shared.js';
export default tsupConfigNode('src/adapters/cloudflare.ts');
