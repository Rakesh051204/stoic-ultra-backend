// connectors/toolDefinitions.js
// Pass this array into your Anthropic API call as `tools`.
// Names are prefixed by service so the executor can route them.

module.exports = [
  // ---- Slack ----
  {
    name: 'slack_list_channels',
    description: 'List Slack channels the connected account can see.',
    input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'slack_get_recent_messages',
    description: 'Get recent messages from a Slack channel.',
    input_schema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['channelId'],
    },
  },
  {
    name: 'slack_send_message',
    description: 'Send a message to a Slack channel.',
    input_schema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['channelId', 'text'],
    },
  },
  {
    name: 'slack_list_users',
    description: 'List users in the connected Slack workspace.',
    input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
  },

  // ---- Notion ----
  {
    name: 'notion_search_pages',
    description: 'Search Notion pages the connected account can access.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
    },
  },
  {
    name: 'notion_get_page',
    description: 'Get the title and content blocks of a Notion page.',
    input_schema: {
      type: 'object',
      properties: { pageId: { type: 'string' } },
      required: ['pageId'],
    },
  },
  {
    name: 'notion_create_page',
    description: 'Create a new Notion page under a parent page.',
    input_schema: {
      type: 'object',
      properties: {
        parentPageId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['parentPageId', 'title'],
    },
  },
  {
    name: 'notion_append_block',
    description: 'Append a text paragraph block to an existing Notion page.',
    input_schema: {
      type: 'object',
      properties: { pageId: { type: 'string' }, text: { type: 'string' } },
      required: ['pageId', 'text'],
    },
  },

  // ---- GitHub ----
  {
    name: 'github_list_repos',
    description: "List the connected user's GitHub repos, most recently updated first.",
    input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'github_get_repo_issues',
    description: 'Get issues from a GitHub repo.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'] },
        limit: { type: 'number' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repo.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'github_create_comment',
    description: 'Comment on a GitHub issue.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        issueNumber: { type: 'number' },
        body: { type: 'string' },
      },
      required: ['owner', 'repo', 'issueNumber', 'body'],
    },
  },
];

