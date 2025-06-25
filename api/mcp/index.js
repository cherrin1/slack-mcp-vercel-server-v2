import { SlackClient } from '../../lib/slack-client.js';

// This replaces your existing /api/mcp/index.js file
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get token - try Authorization header first, then env
  let token = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = process.env.SLACK_BOT_TOKEN;
  }

  if (!token) {
    return res.status(500).json({ 
      error: 'SLACK_BOT_TOKEN not configured' 
    });
  }

  const slackClient = new SlackClient(token);
  const path = req.url || '/';

  try {
    // SERVER DISCOVERY - This is what ChatGPT calls first
    if (req.method === 'GET' && (path === '/' || path === '/api/mcp')) {
      return res.status(200).json({
        name: "Slack MCP Server",
        description: "Search and retrieve information from Slack workspace for ChatGPT deep research",
        version: "1.0.0",
        tools: [
          {
            name: "search",
            description: "Search for messages across Slack channels using keywords, user mentions (@username), or channel references (#channel). Returns relevant messages with context.",
            input_schema: {
              type: "object",
              properties: {
                query: {
                  type: "string", 
                  description: "Search query - keywords, phrases, @mentions, or #channels"
                }
              },
              required: ["query"]
            },
            output_schema: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "Message ID" },
                      title: { type: "string", description: "Message context" },
                      text: { type: "string", description: "Message content" },
                      url: { type: "string", description: "Slack message URL" }
                    },
                    required: ["id", "title", "text"]
                  }
                }
              },
              required: ["results"]
            }
          },
          {
            name: "fetch",
            description: "Get detailed information about a specific Slack message, channel, or user by ID",
            input_schema: {
              type: "object",
              properties: {
                id: { 
                  type: "string", 
                  description: "Resource ID (message, channel, or user ID)" 
                }
              },
              required: ["id"]
            },
            output_schema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Resource ID" },
                title: { type: "string", description: "Resource title" },
                text: { type: "string", description: "Complete content" },
                url: { type: "string", description: "Slack URL" },
                metadata: { 
                  type: "object", 
                  description: "Additional context" 
                }
              },
              required: ["id", "title", "text"]
            }
          }
        ]
      });
    }

    // MCP TOOL CALLS - This is what ChatGPT uses for search/fetch
    if (req.method === 'POST') {
      const body = req.body;
      
      // Handle MCP-style tool calls from ChatGPT
      if (body.tool === 'search') {
        return await handleMCPSearch(slackClient, body.arguments, res);
      }

      if (body.tool === 'fetch') {
        return await handleMCPFetch(slackClient, body.arguments, res);
      }

      // Handle legacy REST calls for testing
      if (path === '/search/messages' && body.query) {
        return await handleMCPSearch(slackClient, { query: body.query }, res);
      }
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('MCP Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

async function handleMCPSearch(slackClient, args, res) {
  const { query } = args;
  
  if (!query) {
    return res.status(400).json({ 
      error: 'Query parameter is required' 
    });
  }

  try {
    // Try Slack's search.messages API first
    try {
      const searchData = await slackClient.makeRequest('search.messages', {
        query,
        count: 20
      });

      const results = searchData.messages.matches.map(match => ({
        id: `msg-${match.channel.id}-${match.ts}`,
        title: `Message in #${match.channel.name}`,
        text: match.text || 'No text content',
        url: match.permalink || `https://slack.com/app_redirect?channel=${match.channel.id}&message_ts=${match.ts}`
      }));

      return res.status(200).json({ results });
      
    } catch (searchError) {
      if (searchError.message.includes('not_allowed_token_type')) {
        // Use fallback search method
        return await fallbackSearch(slackClient, query, res);
      }
      throw searchError;
    }

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Search failed', 
      message: error.message,
      results: [] // Return empty results instead of failing
    });
  }
}

async function fallbackSearch(slackClient, query, res) {
  try {
    console.log('Using fallback search for:', query);
    
    // Get channels we can access
    const channelsData = await slackClient.makeRequest('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 50
    });

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    let allResults = [];

    // Search through recent messages in accessible channels
    for (const channel of channelsData.channels.slice(0, 15)) {
      if (!channel.is_member) continue;
      
      try {
        const history = await slackClient.makeRequest('conversations.history', {
          channel: channel.id,
          limit: 50
        });

        const matchingMessages = history.messages
          .filter(msg => {
            const text = (msg.text || '').toLowerCase();
            return searchTerms.some(term => text.includes(term));
          })
          .map(msg => ({
            id: `msg-${channel.id}-${msg.ts}`,
            title: `Message in #${channel.name}`,
            text: (msg.text || 'No text content').substring(0, 300) + (msg.text?.length > 300 ? '...' : ''),
            url: `https://slack.com/app_redirect?channel=${channel.id}&message_ts=${msg.ts}`
          }));

        allResults.push(...matchingMessages);

        // Stop if we have enough results
        if (allResults.length >= 20) break;
        
      } catch (channelError) {
        // Skip channels we can't access
        continue;
      }
    }

    // Sort by relevance
    allResults.sort((a, b) => {
      const aMatches = searchTerms.filter(term => 
        a.text.toLowerCase().includes(term)
      ).length;
      const bMatches = searchTerms.filter(term => 
        b.text.toLowerCase().includes(term)
      ).length;
      return bMatches - aMatches;
    });

    const results = allResults.slice(0, 20);

    return res.status(200).json({ 
      results
    });

  } catch (error) {
    console.error('Fallback search error:', error);
    return res.status(200).json({ 
      results: [],
      error: `Search failed: ${error.message}`
    });
  }
}

async function handleMCPFetch(slackClient, args, res) {
  const { id } = args;
  
  if (!id) {
    return res.status(400).json({ 
      error: 'ID parameter is required' 
    });
  }

  try {
    // Handle different ID formats
    if (id.startsWith('msg-')) {
      // Message ID format: msg-{channel}-{timestamp}
      const parts = id.split('-');
      if (parts.length >= 3) {
        const channelId = parts[1];
        const timestamp = parts.slice(2).join('-');
        
        try {
          // Get channel info
          const channelInfo = await slackClient.makeRequest('conversations.info', {
            channel: channelId
          });

          // Get the specific message
          const history = await slackClient.makeRequest('conversations.history', {
            channel: channelId,
            latest: timestamp,
            inclusive: true,
            limit: 1
          });

          const message = history.messages[0];
          if (message) {
            return res.status(200).json({
              id,
              title: `Message in #${channelInfo.channel.name}`,
              text: message.text || 'No text content',
              url: `https://slack.com/app_redirect?channel=${channelId}&message_ts=${timestamp}`,
              metadata: {
                channel: channelInfo.channel.name,
                user: message.user,
                timestamp: message.ts,
                date: new Date(parseFloat(message.ts) * 1000).toISOString()
              }
            });
          }
        } catch (msgError) {
          console.error('Message fetch error:', msgError);
        }
      }
    }

    // Handle direct channel/user IDs
    if (id.startsWith('C') || id.startsWith('G')) {
      // Channel ID
      const channelInfo = await slackClient.makeRequest('conversations.info', {
        channel: id
      });

      return res.status(200).json({
        id,
        title: `#${channelInfo.channel.name}`,
        text: channelInfo.channel.topic?.value || channelInfo.channel.purpose?.value || 'Slack channel',
        url: `https://slack.com/app_redirect?channel=${id}`,
        metadata: {
          name: channelInfo.channel.name,
          is_private: channelInfo.channel.is_private,
          member_count: channelInfo.channel.num_members
        }
      });
    }

    if (id.startsWith('U')) {
      // User ID
      const userInfo = await slackClient.makeRequest('users.info', {
        user: id
      });

      return res.status(200).json({
        id,
        title: userInfo.user.real_name || userInfo.user.name,
        text: userInfo.user.profile?.title || 'Slack user',
        url: `https://slack.com/app_redirect?team=${userInfo.user.team_id}&id=${id}`,
        metadata: {
          name: userInfo.user.name,
          email: userInfo.user.profile?.email,
          timezone: userInfo.user.tz
        }
      });
    }

    return res.status(404).json({ 
      error: 'Resource not found',
      id 
    });

  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).json({ 
      error: 'Fetch failed', 
      message: error.message 
    });
  }
}
