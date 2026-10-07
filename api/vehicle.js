// Vercel Function: liefert Ladestand, Ladeziel und km-Stand vom Škoda-Server (offizielle MyŠkoda Public API).
// Anmeldung per Firebase-Token (Header "Authorization: Bearer <Token>"). Welcher API-Schlüssel und welche VIN gelten,
// steht in der Vercel-Variable SKODA_ACCOUNTS (siehe lib/auth.js). Die Schlüssel verlassen den Server nie.
//   GET /api/vehicle?check=1  -> { enabled, keyExpires }   (keine Škoda-Abfrage, zählt nicht gegen das Limit)
//   GET /api/vehicle          -> Fahrzeugdaten (Limit der Škoda-API: 20 Anfragen/Stunde/Fahrzeug -> 60 s Cache je Konto)
import { verifyUser, accountFor } from '../lib/auth.js';

const cache = new Map();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET erlaubt' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const acc = accountFor(user.email);

  if (req.query && req.query.check) return res.status(200).json({ enabled: !!acc, keyExpires: acc?.expires ?? null });
  if (!acc) return res.status(403).json({ error: 'Für dieses Konto sind keine Fahrzeugdaten hinterlegt' });

  const hit = cache.get(user.email);
  if (hit && Date.now() - hit.at < 60_000) return res.status(200).json(hit.body);

  try {
    const url = 'https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(acc.vin) + '?include=charging,odometer';
    const r = await fetch(url, { headers: { 'X-API-Key': acc.key, Accept: 'application/json' } });
    if (!r.ok) {
      const msg = { 401: 'Škoda-API-Schlüssel abgelaufen oder ungültig', 403: 'Schlüssel gilt nicht für dieses Fahrzeug', 429: 'Abfrage-Limit erreicht, bitte später erneut versuchen' }[r.status] || ('Škoda-API Fehler ' + r.status);
      return res.status(502).json({ error: msg });
    }
    const data = await r.json();
    const v = data.vehicle || {}, ch = v.charging || {};
    const body = {                                          // fehlende Felder bleiben null (= unbekannt)
      soc: ch.status?.battery?.stateOfChargeInPercent ?? null,
      targetSoc: ch.settings?.targetStateOfChargeInPercent ?? null,
      chargePowerKw: ch.status?.chargePowerInKw ?? null,
      odometerKm: v.odometer?.mileageInKm ?? null,
      capturedAt: ch.carCapturedTimestamp ?? v.odometer?.carCapturedTimestamp ?? null,
      keyExpiresAt: r.headers.get('x-api-key-expires-at') ?? acc.expires ?? null
    };
    cache.set(user.email, { at: Date.now(), body });
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({ error: 'Škoda-Server nicht erreichbar' });
  }
}
