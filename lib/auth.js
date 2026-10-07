// Prüft das Firebase-Anmelde-Token (ID-Token) einer Anfrage und ordnet dem Konto Škoda-Zugangsdaten zu.
// Das Token ist von Firebase signiert und kann nicht gefälscht werden. Geprüft wird die Signatur gegen die öffentlichen Google-Schlüssel.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT_ID = 'daily-companion-24975';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

// gmail.com und googlemail.com sind dasselbe Postfach -> beim Vergleich vereinheitlichen
const norm = (e) => String(e || '').trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');

/** Gibt { uid, email } zurück, wenn die Anfrage ein gültiges Token mit bestätigter E-Mail trägt, sonst null. */
export async function verifyUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: 'https://securetoken.google.com/' + PROJECT_ID, audience: PROJECT_ID });
    if (!payload.sub || !payload.email || payload.email_verified !== true) return null;
    return { uid: payload.sub, email: norm(payload.email) };
  } catch {
    return null;
  }
}

/** Zugangsdaten des Kontos aus der Vercel-Variable SKODA_ACCOUNTS:
 *  {"mail@gmail.com": {"key": "...", "vin": "...", "expires": "2027-04-03"}, "papa@gmail.com": {...}} */
export function accountFor(email) {
  let all;
  try { all = JSON.parse(process.env.SKODA_ACCOUNTS || '{}'); } catch { return null; }
  for (const [mail, acc] of Object.entries(all)) {
    if (norm(mail) === norm(email) && acc && acc.key && acc.vin) return acc;
  }
  return null;
}
