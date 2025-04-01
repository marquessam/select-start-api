// --- api/leaderboard.js ---
// This endpoint fetches the current monthly challenge and user rankings

import { connectToDatabase } from '../lib/database.js';
import { Challenge, User } from '../lib/models.js';

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
    
    // Get current date for finding current challenge
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get current challenge
    const currentChallenge = await Challenge.findOne({
      date: {
        $gte: currentMonthStart,
        $lt: nextMonthStart
      }
    });

    if (!currentChallenge) {
      return res.status(404).json({ error: 'No active challenge found for the current month' });
    }

    // Get all users
    const users = await User.find({});

    // Calculate user progress and rankings
    const userProgress = [];
    
    for (const user of users) {
      // Check if user has participated in the current challenge
      const monthKey = formatDateKey(currentChallenge.date);
      const monthlyProgress = user.monthlyChallenges.get(monthKey);
      
      if (monthlyProgress && monthlyProgress.progress > 0) {
        // Determine award type based on progress value
        let award = '';
        
        if (monthlyProgress.progress === 3) {
          award = '✨'; // Mastery or Beaten
        } else if (monthlyProgress.progress === 2) {
          award = '⭐'; // Beaten (older format)
        } else if (monthlyProgress.progress === 1) {
          award = '🏁'; // Participation
        }
        
        // Get achievement count (this is a simplified approach without API calls)
        // For a real implementation, you might want to store this data in your MongoDB
        const achieved = Math.floor(currentChallenge.monthly_challange_game_total * (monthlyProgress.progress > 1 ? 0.8 : 0.3));
        const percentage = ((achieved / currentChallenge.monthly_challange_game_total) * 100).toFixed(2);
        
        userProgress.push({
          username: user.raUsername,
          achieved,
          percentage,
          award,
          points: monthlyProgress.progress
        });
      }
    }

    // Sort by points (descending) and then by achievements (descending)
    const sortedProgress = userProgress.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return b.achieved - a.achieved;
    });

    // Calculate challenge end date and time remaining
    const challengeEndDate = new Date(nextMonthStart);
    challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
    challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
    
    // Format the end date and time remaining
    const endDateFormatted = `${now.toLocaleString('default', { month: 'long' })} ${challengeEndDate.getDate()}${getDaySuffix(challengeEndDate.getDate())}, ${challengeEndDate.getFullYear()} at 11:59 PM`;
    const timeRemaining = formatTimeRemaining(challengeEndDate, now);
    
    // Build the response
    const response = {
      monthName: now.toLocaleString('default', { month: 'long' }),
      year: now.getFullYear(),
      game: {
        title: currentChallenge.monthly_challange_gameid, // Ideally, this would be the game name from the RetroAchievements API
        totalAchievements: currentChallenge.monthly_challange_game_total,
        imageUrl: "/api/placeholder/80/80", // This would ideally come from the RetroAchievements API
        endDate: endDateFormatted,
        timeRemaining
      },
      rankings: sortedProgress
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to format date key (matches your User model)
function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

// Helper function to get day suffix (st, nd, rd, th)
function getDaySuffix(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Helper function to format time remaining
function formatTimeRemaining(end, now) {
  const diffMs = end - now;
  if (diffMs <= 0) return 'Challenge has ended';
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (diffDays === 0) {
    return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} and ${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
  }
}
