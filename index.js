// Simple handler to help debug routing
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  res.status(200).json({
    message: 'API is working!',
    endpoints: [
      '/api/test',
      '/api/nominations',
      '/api/leaderboard'
    ],
    timestamp: new Date().toISOString()
  });
}
