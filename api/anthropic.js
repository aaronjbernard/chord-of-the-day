export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    let parsed;
    if (typeof req.body === 'object' && req.body !== null) {
      parsed = req.body;
    } else if (typeof req.body === 'string') {
      parsed = JSON.parse(req.body);
    } else {
      return res.status(400).json({ error: 'Invalid body', type: typeof req.body });
    }

    // Use a publicly available model
    parsed.model = 'claude-3-5-haiku-20241022';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(parsed),
    });

    const text = await response.text();
    console.log('Status:', response.status, 'Body:', text.slice(0, 300));

    return res.status(response.status).json(JSON.parse(text));
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
