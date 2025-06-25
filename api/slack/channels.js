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
    const { types = 'public_channel,private_channel', limit = 100 } = req.query;
    
    const data = await slackClient.makeRequest('conversations.list', {
      types,
      limit: parseInt(limit)
    });

    const channels = data.channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      topic: channel.topic?.value || 'No topic',
      member_count: channel.num_members
    }));

    return res.status(200).json({
      success: true,
      count: channels.length,
      channels
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
