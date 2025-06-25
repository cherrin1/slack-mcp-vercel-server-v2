import { SlackClient } from '../../lib/slack-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });

    const slackClient = new SlackClient(token);
    const { limit = 100 } = req.query;
    
    const data = await slackClient.makeRequest('users.list', {
      limit: parseInt(limit)
    });

    const users = data.members
      .filter(user => !user.deleted)
      .map(user => ({
        id: user.id,
        name: user.name,
        real_name: user.real_name,
        email: user.profile?.email,
        is_bot: user.is_bot
      }));

    return res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
