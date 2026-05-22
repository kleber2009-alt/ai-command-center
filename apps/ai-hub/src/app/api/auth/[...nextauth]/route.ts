// Auth.js v5 Route Handler. Mounts /api/auth/* endpoints
// (signin, callback, signout, csrf, providers, session).
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
