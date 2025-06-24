export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { type, challenge } = req.body;

    if (type === 'url_verification') {
      return res.status(200).json({ challenge });
    }

    // Handle other event types (e.g., message, app_mention, etc.)
    return res.status(200).end();
  }

  res.status(405).send('Method Not Allowed');
}
