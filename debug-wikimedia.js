import axios from 'axios';

const APP_USER_AGENT = 'StoicUltra/1.0 (https://stoic.app; contact@stoic.app)';

async function run() {
  try {
    const res = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch: 'intitle:"kendall jenner" filetype:bitmap',
        gsrnamespace: 6,
        gsrlimit: 5,
        prop: 'imageinfo',
        iiprop: 'url',
        format: 'json',
      },
      headers: {
        'User-Agent': APP_USER_AGENT,
      },
      timeout: 8000,
    });
    console.log('OK, status:', res.status);
    console.log(JSON.stringify(res.data, null, 2).slice(0, 1000));
  } catch (err) {
    console.log('STATUS:', err.response?.status);
    console.log('STATUS TEXT:', err.response?.statusText);
    console.log('BODY:', JSON.stringify(err.response?.data));
    console.log('RESPONSE HEADERS:', JSON.stringify(err.response?.headers, null, 2));
    console.log('ERROR MESSAGE:', err.message);
  }
}

run();