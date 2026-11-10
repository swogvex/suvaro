import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';

export const prerender = false;

/** Every Better Auth endpoint (sign-in, codes, passkeys, sessions) lives under /api/auth. */
export const ALL: APIRoute = ({ request }) => getAuth().handler(request);
