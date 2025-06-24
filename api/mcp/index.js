import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SlackClient } from '../../lib/slack-client.js';

class SlackMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'slack-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.slackClient = null;
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'slack_list_channels',
            description: 'List all channels in the Slack workspace with their details',
            inputSchema: {
              type: 'object',
              properties: {
                types: {
                  type: 'string',
                  description: 'Channel types to include (public_channel, private_channel, mpim, im)',
                  default: 'public_channel,private_channel'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of channels to return (1-1000)',
                  default: 100,
                  minimum: 1,
                  maximum: 1000
                },
                exclude_archived: {
                  type: 'boolean',
                  description: 'Exclude archived channels',
                  default: true
                }
              }
            }
          },
          {
            name: 'slack_search_messages',
            description: 'Search for messages across all Slack channels',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (can include from:@user, in:#channel, etc.)'
                },
                count: {
                  type: 'number',
                  description: 'Number of results to return (1-100)',
                  default: 20,
                  minimum: 1,
                  maximum: 100
                },
                sort: {
                  type: 'string',
                  description: 'Sort results by timestamp or relevance score',
                  enum: ['timestamp', 'score'],
                  default: 'timestamp'
                },
                sort_dir: {
                  type: 'string',
                  description: 'Sort direction',
                  enum: ['asc', 'desc'],
                  default: 'desc'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'slack_channel_history',
            description: 'Get message history from a specific channel',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID or name (with # prefix for names)'
                },
                limit: {
                  type: 'number',
                  description: 'Number of messages to retrieve (1-1000)',
                  default: 50,
                  minimum: 1,
                  maximum: 1000
                },
                oldest: {
                  type: 'string',
                  description: 'Start of time range (Unix timestamp)'
                },
                latest: {
                  type: 'string',
                  description: 'End of time range (Unix timestamp)'
                },
                include_all_metadata: {
                  type: 'boolean',
                  description: 'Include all message metadata',
                  default: false
                }
              },
              required: ['channel']
            }
          },
          {
            name: 'slack_send_message',
            description: 'Send a message to a Slack channel or user',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID, channel name (with #), or user ID'
                },
                text: {
                  type: 'string',
                  description: 'Message text (supports Slack markdown)'
                },
                thread_ts: {
                  type: 'string',
                  description: 'Thread timestamp to reply to a thread'
                },
                unfurl_links: {
                  type: 'boolean',
                  description: 'Unfurl links in the message',
                  default: true
                }
              },
              required: ['channel', 'text']
            }
          },
          {
            name: 'slack_get_users',
            description: 'Get list of users in the Slack workspace',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of users to return',
                  default: 100,
                  minimum: 1,
                  maximum: 1000
                },
                include_locale: {
                  type: 'boolean',
                  description: 'Include user locale information',
                  default: false
                }
              }
            }
          },
          {
            name: 'slack_get_user_info',
            description: 'Get detailed information about a specific user',
            inputSchema: {
              type: 'object',
              properties: {
                user: {
                  type: 'string',
                  description: 'User ID, username, or email address'
                },
                include_locale: {
                  type: 'boolean',
                  description: 'Include locale information',
                  default: false
                }
              },
              required: ['user']
            }
          },
          {
            name: 'slack_get_channel_info',
            description: 'Get detailed information about a specific channel',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID or name (with # prefix)'
                },
                include_locale: {
                  type: 'boolean',
                  description: 'Include locale information',
                  default: false
                }
              },
              required: ['channel']
            }
          },
          {
            name: 'slack_get_thread_replies',
            description: 'Get replies to a specific message thread',
            inputSchema: {
              type: 'object',
              properties: {
                channel: {
                  type: 'string',
                  description: 'Channel ID or name (with # prefix)'
                },
                ts: {
                  type: 'string',
                  description: 'Thread timestamp'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of replies to return',
                  default: 100,
                  minimum: 1,
                  maximum: 1000
                }
              },
              required: ['channel', 'ts']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.slackClient) {
        throw new Error('Slack client not initialized. Please check SLACK_BOT_TOKEN.');
      }

      try {
        switch (name) {
          case 'slack_list_channels':
            return await this.listChannels(args);
          case 'slack_search_messages':
            return await this.searchMessages(args);
          case 'slack_channel_history':
            return await this.getChannelHistory(args);
          case 'slack_send_message':
            return await this.sendMessage(args);
          case 'slack_get_users':
            return await this.getUsers(args);
          case 'slack_get_user_info':
            return await this.getUserInfo(args);
          case 'slack_get_channel_info':
            return await this.getChannelInfo(args);
          case 'slack_get_thread_replies':
            return await this.getThreadReplies(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async listChannels(args) {
    const data = await this.slackClient.makeRequest('conversations.list', {
      types: args.types || 'public_channel,private_channel',
      limit: args.limit || 100,
      exclude_archived: args.exclude_archived !== false
    });

    const channels = data.channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      is_member: channel.is_member,
      is_archived: channel.is_archived,
      topic: channel.topic?.value || 'No topic set',
      purpose: channel.purpose?.value || 'No purpose set',
      member_count: channel.num_members,
      created: new Date(channel.created * 1000).toISOString(),
      creator: channel.creator
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${channels.length} channels:\n\n${JSON.stringify(channels, null, 2)}`
        }
      ]
    };
  }

  async searchMessages(args) {
    const data = await this.slackClient.makeRequest('search.messages', {
      query: args.query,
      count: args.count || 20,
      sort: args.sort || 'timestamp',
      sort_dir: args.sort_dir || 'desc'
    });

    const messages = data.messages.matches.map(match => ({
      channel: match.channel.name,
      channel_id: match.channel.id,
      user: match.username,
      user_id: match.user,
      text: match.text,
      timestamp: match.ts,
      date: new Date(parseFloat(match.ts) * 1000).toISOString(),
      permalink: match.permalink,
      score: match.score
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${messages.length} messages matching "${args.query}":\n\n${JSON.stringify(messages, null, 2)}`
        }
      ]
    };
  }

  async getChannelHistory(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.makeRequest('conversations.history', {
      channel: channel,
      limit: args.limit || 50,
      oldest: args.oldest,
      latest: args.latest,
      include_all_metadata: args.include_all_metadata || false
    });

    const messages = data.messages.map(message => ({
      user: message.user,
      text: message.text,
      timestamp: message.ts,
      date: new Date(parseFloat(message.ts) * 1000).toISOString(),
      type: message.type,
      subtype: message.subtype,
      thread_ts: message.thread_ts,
      reply_count: message.reply_count || 0,
      reactions: message.reactions || []
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Channel history for ${args.channel} (${messages.length} messages):\n\n${JSON.stringify(messages, null, 2)}`
        }
      ]
    };
  }

  async sendMessage(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.postMessage(channel, args.text, {
      thread_ts: args.thread_ts,
      unfurl_links: args.unfurl_links !== false
    });

    return {
      content: [
        {
          type: 'text',
          text: `Message sent successfully to ${args.channel}. Message timestamp: ${data.ts}`
        }
      ]
    };
  }

  async getUsers(args) {
    const data = await this.slackClient.makeRequest('users.list', {
      limit: args.limit || 100,
      include_locale: args.include_locale || false
    });

    const users = data.members
      .filter(user => !user.deleted)
      .map(user => ({
        id: user.id,
        name: user.name,
        real_name: user.real_name,
        display_name: user.profile?.display_name || user.real_name,
        email: user.profile?.email,
        title: user.profile?.title,
        phone: user.profile?.phone,
        is_bot: user.is_bot,
        is_admin: user.is_admin,
        is_owner: user.is_owner,
        is_primary_owner: user.is_primary_owner,
        timezone: user.tz,
        status: user.profile?.status_text || 'No status',
        presence: user.presence
      }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${users.length} users:\n\n${JSON.stringify(users, null, 2)}`
        }
      ]
    };
  }

  async getUserInfo(args) {
    const data = await this.slackClient.makeRequest('users.info', {
      user: args.user,
      include_locale: args.include_locale || false
    });

    const user = {
      id: data.user.id,
      name: data.user.name,
      real_name: data.user.real_name,
      display_name: data.user.profile?.display_name || data.user.real_name,
      email: data.user.profile?.email,
      phone: data.user.profile?.phone,
      title: data.user.profile?.title,
      department: data.user.profile?.fields?.department?.value,
      manager: data.user.profile?.fields?.manager?.value,
      is_bot: data.user.is_bot,
      is_admin: data.user.is_admin,
      is_owner: data.user.is_owner,
      is_primary_owner: data.user.is_primary_owner,
      timezone: data.user.tz,
      locale: data.user.locale,
      status: data.user.profile?.status_text || 'No status',
      avatar: data.user.profile?.image_512,
      presence: data.user.presence
    };

    return {
      content: [
        {
          type: 'text',
          text: `User information for ${args.user}:\n\n${JSON.stringify(user, null, 2)}`
        }
      ]
    };
  }

  async getChannelInfo(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.makeRequest('conversations.info', {
      channel: channel,
      include_locale: args.include_locale || false
    });

    const channelInfo = {
      id: data.channel.id,
      name: data.channel.name,
      is_private: data.channel.is_private,
      is_archived: data.channel.is_archived,
      is_general: data.channel.is_general,
      is_member: data.channel.is_member,
      topic: data.channel.topic?.value || 'No topic set',
      purpose: data.channel.purpose?.value || 'No purpose set',
      member_count: data.channel.num_members,
      created: new Date(data.channel.created * 1000).toISOString(),
      creator: data.channel.creator,
      locale: data.channel.locale
    };

    return {
      content: [
        {
          type: 'text',
          text: `Channel information for ${args.channel}:\n\n${JSON.stringify(channelInfo, null, 2)}`
        }
      ]
    };
  }

  async getThreadReplies(args) {
    let channel = args.channel;
    
    // Handle channel names with # prefix
    if (channel.startsWith('#')) {
      const channelsData = await this.slackClient.makeRequest('conversations.list', {
        types: 'public_channel,private_channel'
      });
      const foundChannel = channelsData.channels.find(c => c.name === channel.slice(1));
      if (foundChannel) {
        channel = foundChannel.id;
      }
    }

    const data = await this.slackClient.makeRequest('conversations.replies', {
      channel: channel,
      ts: args.ts,
      limit: args.limit || 100
    });

    const replies = data.messages.map(message => ({
      user: message.user,
      text: message.text,
      timestamp: message.ts,
      date: new Date(parseFloat(message.ts) * 1000).toISOString(),
      type: message.type,
      subtype: message.subtype,
      thread_ts: message.thread_ts,
      parent_user_id: message.parent_user_id,
      reactions: message.reactions || []
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Thread replies for message ${args.ts} in ${args.channel} (${replies.length} replies):\n\n${JSON.stringify(replies, null, 2)}`
        }
      ]
    };
  }

  async run() {
    const token = process.env.SLACK_BOT_TOKEN;
    
    if (!token) {
      console.error('ERROR: SLACK_BOT_TOKEN environment variable is required');
      process.exit(1);
    }

    this.slackClient = new SlackClient(token);

    // Test connection
    try {
      const authData = await this.slackClient.makeRequest('auth.test');
      console.error('✅ Slack API connection successful!');
      console.error(`Connected to: ${authData.team} as ${authData.user}`);
    } catch (error) {
      console.error('❌ Slack API connection failed:', error.message);
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Slack MCP server running for ChatGPT Source Connection');
  }
}

// For Vercel serverless function
export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ 
      message: 'Slack MCP Server for ChatGPT Source Connection',
      status: 'running',
      tools: [
        'slack_list_channels',
        'slack_search_messages', 
        'slack_channel_history',
        'slack_send_message',
        'slack_get_users',
        'slack_get_user_info',
        'slack_get_channel_info',
        'slack_get_thread_replies'
      ],
      version: '0.1.0'
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// For local development and MCP
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = new SlackMCPServer();
  server.run().catch(console.error);
}
