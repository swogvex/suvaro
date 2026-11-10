import type { Session } from './lib/auth';
import type { Profile } from './lib/profile';

declare global {
  namespace App {
    interface Locals {
      /** Set on `/app`, own `/api` endpoints and the sign-in page when a valid session exists. */
      user?: Session['user'];
      session?: Session['session'];
      /** Set on `/app` and own `/api` endpoints (always present there: the middleware guards them). */
      profile?: Profile;
    }
  }
}

export {};
