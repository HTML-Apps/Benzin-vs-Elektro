// Vercel Function: liefert Ladestand, Ladeziel und km-Stand vom Škoda-Server (offizielle MyŠkoda Public API).
// Umgebungsvariablen (Vercel > Settings > Environment Variables):
//   SKODA_API_KEY  – in der MyŠkoda-App erzeugter API-Schlüssel (läuft ab, rechtzeitig erneuern)
//   VIN_NUMBER     – Fahrgestellnummer des Fahrzeugs
//   APP_PIN        – dieselbe PIN wie bei read-meter.js
// Die Schlüssel verlassen den Server nie. Limit der Škoda-API: derzeit 20 Anfragen/Stunde/Fahrzeug -> kurzer Cache.

let cache = { at: 0, body: null };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET erlaubt' });
  if (!process.env.APP_PIN || req.headers['x-app-pin'] !== process.env.APP_PIN) return res.status(401).json({ error: 'PIN falsch' });
  if (!process.env.SKODA_API_KEY || !process.env.VIN_NUMBER) return res.status(500).json({ error: 'SKODA_API_KEY oder VIN_NUMBER fehlt in Vercel' });

  if (cache.body && Date.now() - cache.at < 60_000) return res.status(200).json(cache.body);   // 60 s Cache

  try {
    const url = 'https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(process.env.VIN_NUMBER) + '?include=charging,odometer';
    const r = await fetch(url, { headers: { 'X-API-Key': process.env.SKODA_API_KEY, Accept: 'application/json' } });
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
      keyExpiresAt: r.headers.get('x-api-key-expires-at')
    };
    cache = { at: Date.now(), body };
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({ error: 'Škoda-Server nicht erreichbar' });
  }
}
