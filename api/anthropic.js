export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    // Read raw body and parse it ourselves
    let body;
    if (typeof req.body === 'object' && req.body !== null) {
      body = JSON.stringify(req.body);
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      body = req.body;
      // Validate it's valid JSON
      JSON.parse(body);
    } else {
      return res.status(400).json({ error: 'Empty or invalid request body', received: typeof req.body });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: body,
    });

    const text = await response.text();

    // Log for debugging
    console.log('Anthropic status:', response.status);
    console.log('Anthropic response:', text.slice(0, 500));

    try {
      return res.status(response.status).json(JSON.parse(text));
    } catch {
      return res.status(response.status).send(text);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
