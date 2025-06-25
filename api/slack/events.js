export default function handler(req, res) {
  console.log('Method:', req.method);
  console.log('Body:', req.body);
  
  if (req.method === 'GET') {
    return res.status(200).send('Slack events endpoint is alive.');
  }

  if (req.method === 'POST') {
    const { type, challenge } = req.body;
    
    console.log('Type:', type);
    console.log('Challenge:', challenge);

    if (type === 'url_verification') {
      console.log('Sending challenge back:', challenge);
      return res.status(200).send(challenge);
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).send('Method Not Allowed');
}
