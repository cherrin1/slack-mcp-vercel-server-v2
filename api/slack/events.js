export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Slack events endpoint is alive.');
  }

  if (req.method === 'POST') {
    const { type, challenge } = req.body;

    if (type === 'url_verification') {
      return res.status(200).json({ challenge });
    }

    return res.status(200).end();
  }

  res.status(405).send('Method Not Allowed');
}
