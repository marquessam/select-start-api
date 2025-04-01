// --- api/nominations.js ---
// This endpoint fetches the current month's game nominations

import { connectToDatabase } from '../lib/database';
import { User } from '../lib/models';

export default async function handler(req, res) {
  // Set CORS headers to allow your Carrd site to access this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Connect to MongoDB
    await connectToDatabase();
    
    // Get all users
    const users = await User.find({});

    // Get all current nominations
    let allNominations = [];
    for (const user of users) {
      const nominations = getCurrentNominations(user);
      if (nominations.length > 0) {
        allNominations.push(...nominations.map(nom => ({
          gameId: nom.gameId,
          nominatedBy: user.raUsername,
          nominatedAt: nom.nominatedAt
        })));
      }
    }

    if (allNominations.length === 0) {
      return res.status(200).json({ 
        totalNominations: 0, 
        uniqueGames: 0, 
        nominations: [] 
      });
    }

    // Count nominations per game
    const nominationCounts = {};
    allNominations.forEach(nom => {
      if (!nominationCounts[nom.gameId]) {
        nominationCounts[nom.gameId] = {
          count: 0,
          nominatedBy: []
        };
      }
      nominationCounts[nom.gameId].count++;
      nominationCounts[nom.gameId].nominatedBy.push(nom.nominatedBy);
    });

    // Get unique game IDs
    const uniqueGameIds = [...new Set(allNominations.map(nom => nom.gameId))];

    // Format the response
    // In a real implementation, you would fetch game details from RetroAchievements API
    // For this demo, we'll use placeholder data
    const formattedNominations = uniqueGameIds.map(gameId => {
      return {
        title: `Game ${gameId}`, // This would be fetched from RetroAchievements API
        gameId,
        achievementCount: 30 + Math.floor(Math.random() * 30), // Random count for demo
        imageUrl: "/api/placeholder/250/140", // This would be from RetroAchievements API
        nominationCount: nominationCounts[gameId].count,
        nominatedBy: nominationCounts[gameId].nominatedBy
      };
    });

    // Sort by nomination count (descending)
    formattedNominations.sort((a, b) => b.nominationCount - a.nominationCount);

    const response = {
      totalNominations: allNominations.length,
      uniqueGames: uniqueGameIds.length,
      nominations: formattedNominations
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching nominations:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to get current month's nominations (matches your User model logic)
function getCurrentNominations(user) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  return user.nominations.filter(nom => {
    const nomMonth = nom.nominatedAt.getMonth();
    const nomYear = nom.nominatedAt.getFullYear();
    return nomMonth === currentMonth && nomYear === currentYear;
  });
}
