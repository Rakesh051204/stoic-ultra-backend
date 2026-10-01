// connectors/authorizedClient.js
import axios from 'axios'
import { getConnector } from '../lib/connectorsStore.js'

/**
 * Fetches the decrypted access_token for a user+provider using your
 * existing connectorsStore, then builds an authorized axios client.
 */
export async function getClient(userId, provider, baseURL, extraHeaders = {}) {
  const connector = await getConnector(userId, provider)
  if (!connector) {
    throw new Error(`No ${provider} connection found for this user`)
  }
  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${connector.access_token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    timeout: 15000,
  })
}

