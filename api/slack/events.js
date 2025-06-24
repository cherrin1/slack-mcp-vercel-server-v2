export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { type, challenge } = req.body;

    if (type === 'url_verification') {
      return res.status(200).json({ challenge });
    }

    return res.status(200).end(); // Handle other Slack events here
  }

  res.status(405).send('Method Not Allowed');
}
