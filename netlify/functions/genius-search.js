exports.handler = async function (event) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const q = event.queryStringParameters?.q;
  if (!q || !q.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing search query' }) };
  }

  const token = process.env.GENIUS_CLIENT_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Genius API token not configured. Add GENIUS_CLIENT_TOKEN to your Netlify environment variables.' }),
    };
  }

  try {
    const url = `https://api.genius.com/search?q=${encodeURIComponent(q.trim())}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Genius API error: ${text}` }),
      };
    }

    const data = await response.json();

    // Return only the hits array — keeps the response lean
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // cache results for 5 min
      },
      body: JSON.stringify({ hits: data.response?.hits || [] }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Search failed: ' + err.message }),
    };
  }
};
