// api/nominations.js - Updated with better error handling and empty data handling

import { connectToDatabase } from '../lib/database.js';
import { User } from '../lib/models.js';

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
    console.log('Connecting to database...');
    // Connect to MongoDB
    await connectToDatabase();
    console.log('Database connected successfully');
    
    // Get all users
    console.log('Fetching users...');
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    // Get all current nominations
    let allNominations = [];
    
    console.log('Processing nominations...');
    for (const user of users) {
      // Check if user has nominations property
      if (!user.nominations || !Array.isArray(user.nominations)) {
        console.log(`User ${user.raUsername} has no nominations array`);
        continue;
      }
      
      const nominations = getCurrentNominations(user);
      console.log(`User ${user.raUsername} has ${nominations.length} current nominations`);
      
      if (nominations.length > 0) {
        allNominations.push(...nominations.map(nom => ({
          gameId: nom.gameId,
          nominatedBy: user.raUsername,
          nominatedAt: nom.nominatedAt
        })));
      }
    }

    console.log(`Total nominations found: ${allNominations.length}`);
    
    // Always return a valid response even if no nominations
    if (allNominations.length === 0) {
      console.log('No nominations found, returning empty array');
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
    console.log(`Unique games: ${uniqueGameIds.length}`);

    // Format the response
    // In a real implementation, you would fetch game details from RetroAchievements API
    // For this demo, we'll use placeholder data
    const formattedNominations = uniqueGameIds.map(gameId => {
      return {
        title: gameId, // Using game ID as title for now
        gameId,
        achievementCount: 30 + Math.floor(Math.random() * 30), // Random count for demo
        imageUrl: "https://media.retroachievements.org/Images/061127.png", // Default image
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
    
    console.log('Successfully returning nominations data');
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching nominations:', error);
    // Return a valid response even on error
    return res.status(200).json({ 
      error: 'Error processing nominations',
      totalNominations: 0, 
      uniqueGames: 0, 
      nominations: [] 
    });
  }
}

// Helper function to get current month's nominations (matches your User model logic)
function getCurrentNominations(user) {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Check if user has nominations array
    if (!user.nominations || !Array.isArray(user.nominations)) {
      return [];
    }
    
    return user.nominations.filter(nom => {
      // Skip if nominatedAt is not a valid date
      if (!nom.nominatedAt || !(nom.nominatedAt instanceof Date)) {
        return false;
      }
      
      const nomMonth = nom.nominatedAt.getMonth();
      const nomYear = nom.nominatedAt.getFullYear();
      return nomMonth === currentMonth && nomYear === currentYear;
    });
  } catch (error) {
    console.error('Error getting current nominations:', error);
    return [];
  }
}
