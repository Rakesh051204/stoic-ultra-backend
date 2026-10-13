const fs = require('fs');
const f = 'lib/jobBoards.json';
const b = JSON.parse(fs.readFileSync(f, 'utf8'));
const add = {
  greenhouse: ['airtable','dropbox','robinhood','squarespace','toast','carta','chime','clickhouse','cockroachlabs','confluent','fivetran','grafanalabs','hashicorp','jfrog','lattice','mixpanel','newrelic','pagerduty','postman','retool','sentry','snyk','webflow','zapier','sumup','bolt','getyourguide','trivago','zalando','checkout','monzo','revolut','wise','deliveryhero','gorillas','taxfix','personio','mambu','contentful','typeform','miro','elevenlabs','dataiku','algolia','criteo','doctolib','qonto','alan','ledger'],
  lever: ['netflix','shopify','binance','crypto','palantir','wealthsimple','attentive','highspot','matchgroup'],
  ashby: ['openai','character','together','cursor','vapi','clay','airtable','mistral','hebbia','glean','fal','baseten','weights-biases','scale','imbue','adept','cognition','physicalintelligence']
};
for (const k of Object.keys(add)) b[k] = Array.from(new Set([...(b[k] || []), ...add[k]]));
fs.writeFileSync(f, JSON.stringify(b, null, 1));
console.log('boards:', Object.entries(b).map(([k, v]) => k + '=' + v.length).join(' '));
