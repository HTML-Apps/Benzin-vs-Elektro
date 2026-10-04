// Vercel Serverless Function: nimmt ein Foto entgegen, fragt OpenAI und gibt die Antwort zurück.
// Benötigte Umgebungsvariablen (Vercel > Settings > Environment Variables):
//   OPENAI_API_KEY  – Key eines eigenen OpenAI-Projekts mit Budget-Limit
//   APP_PIN         – frei gewählte PIN, die du in der App einträgst

const PROMPT = 'Dies ist ein Bild eines Stromzählers. Antworte ausschließlich mit der abgelesenen Zahl in kWh als reinen Zahlenwert (z.B. 1452.5). Keine weiteren Wörter.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });
  if (!process.env.APP_PIN || req.headers['x-app-pin'] !== process.env.APP_PIN) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const image = req.body?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,') || image.length > 3_000_000) {
    return res.status(400).json({ error: 'Ungültiges Bild' });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 20, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: image, detail: 'high' } }
        ]}]
      })
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'OpenAI nicht erreichbar' });
  }
}
