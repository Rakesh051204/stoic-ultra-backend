// connectors/toolExecutor.js
import * as slack from './slack.js'
import * as notion from './notion.js'
import * as github from './github.js'

const ROUTES = {
  slack_list_channels: [slack, 'listChannels'],
  slack_get_recent_messages: [slack, 'getRecentMessages'],
  slack_send_message: [slack, 'sendMessage'],
  slack_list_users: [slack, 'listUsers'],

  notion_search_pages: [notion, 'searchPages'],
  notion_get_page: [notion, 'getPage'],
  notion_create_page: [notion, 'createPage'],
  notion_append_block: [notion, 'appendBlock'],

  github_list_repos: [github, 'listRepos'],
  github_get_repo_issues: [github, 'getRepoIssues'],
  github_create_issue: [github, 'createIssue'],
  github_create_comment: [github, 'createComment'],
}

async function executeTool(userId, name, input) {
  const route = ROUTES[name]
  if (!route) return { error: `Unknown tool: ${name}` }
  const [mod, fnName] = route
  try {
    return await mod[fnName](userId, input || {})
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Runs Groq/OpenAI-style tool_calls and returns {role:'tool', tool_call_id, content}
 * messages ready to append to the conversation before the follow-up call.
 */
export async function executeOpenAIToolCalls(userId, toolCalls = []) {
  const results = await Promise.all(
    toolCalls.map(async tc => {
      let args = {}
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch {
        // malformed args from the model — pass empty object through
      }
      const result = await executeTool(userId, tc.function.name, args)
      return { tool_call_id: tc.id, content: JSON.stringify(result) }
    })
  )
  return results.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }))
}

