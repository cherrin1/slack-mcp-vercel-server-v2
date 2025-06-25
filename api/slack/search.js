import { SlackClient } from '../../lib/slack-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });

    const { query, count = 20 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const slackClient = new SlackClient(token);
    const data = await slackClient.makeRequest('search.messages', {
      query,
      count: parseInt(count)
    });

    const messages = data.messages.matches.map(match => ({
      channel: match.channel.name,
      user: match.username,
      text: match.text,
      timestamp: match.ts,
      permalink: match.permalink
    }));

    return res.status(200).json({
      success: true,
      query,
      count: messages.length,
      messages
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
