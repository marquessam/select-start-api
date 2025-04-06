// pages/api/test.js
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Return a simple response
  res.status(200).json({
    status: 'success',
    message: 'Test API is working!',
    timestamp: new Date().toISOString()
  });
}
