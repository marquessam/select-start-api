// api/nominations.js - Updated to properly format data for Carrd

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

  console.log('Nominations API called');

  try {
    console.log('Connecting to database...');
    // Connect to MongoDB
    await connectToDatabase();
    console.log('Database connected successfully');
    
    // Get all users
    console.log('Fetching users...');
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    // Check if format=carrd is specified
    const formatForCarrd = req.query.format === 'carrd';
    console.log(`Format for Carrd: ${formatForCarrd}`);

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
      
      // Map nominations to include username
      if (nominations.length > 0) {
        allNominations.push(...nominations.map(nom => ({
          gameId: nom.gameId,
          gameTitle: nom.gameTitle || nom.gameId, // Use title if available
          consoleName: nom.consoleName || "Unknown Console",
          discordUsername: user.raUsername,
          discordId: user.discordId,
          nominatedAt: nom.nominatedAt
        })));
      }
    }

    console.log(`Total nominations found: ${allNominations.length}`);
    
    if (formatForCarrd) {
      // Format for Carrd site
      // Group nominations by game to count them and collect nominators
      const gameGroups = {};
      allNominations.forEach(nom => {
        const gameKey = nom.gameTitle || nom.gameId;
        if (!gameGroups[gameKey]) {
          gameGroups[gameKey] = {
            title: gameKey,
            gameId: nom.gameId,
            platform: nom.consoleName,
            nominatedBy: [],
            count: 0
          };
        }
        
        if (!gameGroups[gameKey].nominatedBy.includes(nom.discordUsername)) {
          gameGroups[gameKey].nominatedBy.push(nom.discordUsername);
          gameGroups[gameKey].count++;
        }
      });
      
      // Transform to Carrd format
      const formattedNominations = Object.values(gameGroups).map(group => ({
        title: group.title,
        gameId: group.gameId,
        achievementCount: 42, // Placeholder value
        imageUrl: "https://media.retroachievements.org/Images/061127.png", // Placeholder image
        nominationCount: group.count,
        nominatedBy: group.nominatedBy
      }));
      
      // Sort by nomination count (highest first)
      formattedNominations.sort((a, b) => b.nominationCount - a.nominationCount);
      
      return res.status(200).json({
        totalNominations: allNominations.length,
        uniqueGames: formattedNominations.length,
        nominations: formattedNominations,
        lastUpdated: new Date().toISOString()
      });
    } else {
      // Original format for other clients
      return res.status(200).json({
        nominations: allNominations,
        isOpen: true,
        lastUpdated: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching nominations:', error);
    
    // Return a valid response even on error
    if (req.query.format === 'carrd') {
      return res.status(200).json({ 
        totalNominations: 0, 
        uniqueGames: 0, 
        nominations: [],
        lastUpdated: new Date().toISOString()
      });
    } else {
      return res.status(200).json({
        nominations: [],
        isOpen: true,
        lastUpdated: new Date().toISOString()
      });
    }
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
