// pages/api/nominations.js
import { connectToDatabase } from '../../lib/database.js';
import { User } from '../../lib/models.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle non-GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Nominations API called');

  try {
    // Check if format=carrd is specified
    const formatForCarrd = req.query.format === 'carrd';
    console.log(`Format for Carrd: ${formatForCarrd}`);

    // If there's a database error, we'll still return mock data
    let allNominations = [];
    
    try {
      console.log('Connecting to database...');
      await connectToDatabase();
      console.log('Database connected successfully');
      
      // Get all users
      const users = await User.find({});
      console.log(`Found ${users.length} users`);
      
      // Get all current nominations
      for (const user of users) {
        // Check if user has nominations property
        if (!user.nominations || !Array.isArray(user.nominations)) {
          continue;
        }
        
        // Get current nominations
        const nominations = getCurrentNominations(user);
        
        // Map nominations to include username
        if (nominations.length > 0) {
          allNominations.push(...nominations.map(nom => ({
            gameId: nom.gameId,
            gameTitle: nom.gameTitle || nom.gameId,
            consoleName: nom.consoleName || "Unknown Console",
            discordUsername: user.raUsername,
            discordId: user.discordId,
            nominatedAt: nom.nominatedAt
          })));
        }
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue with empty nominations array
    }

    if (formatForCarrd) {
      // If no real nominations, use mock data
      if (allNominations.length === 0) {
        allNominations = [
          {
            gameId: "12345",
            gameTitle: "Chrono Trigger",
            consoleName: "SNES",
            discordUsername: "User1",
            discordId: "123456789"
          },
          {
            gameId: "67890",
            gameTitle: "Final Fantasy VII",
            consoleName: "PlayStation",
            discordUsername: "User2",
            discordId: "987654321"
          },
          {
            gameId: "12345", // Same game, different user
            gameTitle: "Chrono Trigger",
            consoleName: "SNES",
            discordUsername: "User3",
            discordId: "456123789"
          }
        ];
      }
      
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
    console.error('Error in nominations API:', error);
    
    // Return mock data for Carrd format
    if (req.query.format === 'carrd') {
      return res.status(200).json({ 
        totalNominations: 3,
        uniqueGames: 2,
        nominations: [
          {
            title: "Chrono Trigger",
            gameId: "12345",
            achievementCount: 42,
            imageUrl: "https://media.retroachievements.org/Images/061127.png",
            nominationCount: 2,
            nominatedBy: ["User1", "User3"]
          },
          {
            title: "Final Fantasy VII",
            gameId: "67890",
            achievementCount: 50,
            imageUrl: "https://media.retroachievements.org/Images/061127.png",
            nominationCount: 1,
            nominatedBy: ["User2"]
          }
        ],
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

// Helper function to get current month's nominations
function getCurrentNominations(user) {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    if (!user.nominations || !Array.isArray(user.nominations)) {
      return [];
    }
    
    return user.nominations.filter(nom => {
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
