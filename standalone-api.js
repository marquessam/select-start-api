// standalone-api.js
// This is a standalone API server that connects to your MongoDB database
// and provides endpoints for your leaderboard and nominations data.

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Setup directories
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/select-start';
const API_KEY = process.env.API_KEY || 'dev-key';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-key';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    });

// Define schemas based on your existing models
const userSchema = new mongoose.Schema({
    raUsername: String,
    discordId: String,
    monthlyChallenges: Map,
    shadowChallenges: Map,
    announcedAchievements: [String],
    communityAwards: [{
        title: String,
        points: Number,
        awardedAt: Date,
        awardedBy: String
    }],
    nominations: [{
        gameId: String,
        gameTitle: String,
        consoleName: String,
        nominatedAt: Date
    }]
});

// Static method to find user by RetroAchievements username (case insensitive)
userSchema.statics.findByRAUsername = function(username) {
    return this.findOne({ raUsername: username });
};

// Helper method for consistent date key formatting
userSchema.statics.formatDateKey = function(date) {
    return date.toISOString().split('T')[0];
};

// Method to get user's community awards for a specific year
userSchema.methods.getCommunityAwardsForYear = function(year) {
    return this.communityAwards.filter(award => 
        award.awardedAt.getFullYear() === year
    );
};

// Method to get total community points for a specific year
userSchema.methods.getCommunityPointsForYear = function(year) {
    return this.getCommunityAwardsForYear(year)
        .reduce((total, award) => total + award.points, 0);
};

const challengeSchema = new mongoose.Schema({
    date: Date,
    monthly_challange_gameid: String,
    monthly_challange_achievement_ids: [String],
    monthly_challange_game_total: Number,
    monthly_challange_progression_achievements: [String],
    monthly_challange_win_achievements: [String],
    shadow_challange_gameid: String,
    shadow_challange_achievement_ids: [String],
    shadow_challange_game_total: Number,
    shadow_challange_progression_achievements: [String],
    shadow_challange_win_achievements: [String],
    shadow_challange_revealed: Boolean
});

// Define models
const User = mongoose.model('User', userSchema);
const Challenge = mongoose.model('Challenge', challengeSchema);

// Configure middleware
app.use(cors({
    origin: '*', // You should limit this to your Carrd site in production
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-api-key']
}));
app.use(express.json());

// API key authentication middleware
const apiKeyAuth = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    
    if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({
            error: 'Unauthorized - Invalid API key'
        });
    }
    
    next();
};

// Admin API key authentication
const adminApiKeyAuth = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    
    if (!providedKey || providedKey !== ADMIN_API_KEY) {
        return res.status(403).json({
            error: 'Forbidden - Admin API key required'
        });
    }
    
    next();
};

// Cache management
let cache = {
    monthly: {
        data: null,
        lastUpdated: null
    },
    yearly: {
        data: null,
        lastUpdated: null
    },
    nominations: {
        data: null,
        lastUpdated: null
    }
};

// Try to load from disk if available
try {
    const monthlyPath = join(CACHE_DIR, 'monthly-leaderboard.json');
    if (fs.existsSync(monthlyPath)) {
        cache.monthly.data = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));
        cache.monthly.lastUpdated = new Date(cache.monthly.data.lastUpdated);
        console.log('Loaded monthly leaderboard from disk');
    }
    
    const yearlyPath = join(CACHE_DIR, 'yearly-leaderboard.json');
    if (fs.existsSync(yearlyPath)) {
        cache.yearly.data = JSON.parse(fs.readFileSync(yearlyPath, 'utf8'));
        cache.yearly.lastUpdated = new Date(cache.yearly.data.lastUpdated);
        console.log('Loaded yearly leaderboard from disk');
    }
    
    const nominationsPath = join(CACHE_DIR, 'nominations.json');
    if (fs.existsSync(nominationsPath)) {
        cache.nominations.data = JSON.parse(fs.readFileSync(nominationsPath, 'utf8'));
        cache.nominations.lastUpdated = new Date(cache.nominations.data.lastUpdated);
        console.log('Loaded nominations from disk');
    }
} catch (error) {
    console.error('Error loading cache from disk:', error);
}

// Routes
// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Monthly leaderboard
app.get('/api/leaderboard/monthly', apiKeyAuth, async (req, res) => {
    try {
        // Check if we have fresh cache
        if (cache.monthly.data && cache.monthly.lastUpdated && 
            (new Date() - cache.monthly.lastUpdated) < (15 * 60 * 1000)) { // 15 minutes
            return res.json(cache.monthly.data);
        }
        
        // Get current month's challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });
        
        if (!currentChallenge) {
            return res.status(404).json({
                error: 'No current challenge found'
            });
        }

        // Get game info for icon URL and other metadata
        let gameInfo = null;
        try {
            // Import the retroAPI service - adapt this based on your setup
            // This is just a placeholder - modify to match your actual retroAPI import
            const retroAPI = (await import('./services/retroAPI.js')).default;
            gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
        } catch (error) {
            console.error('Error fetching game info:', error);
            // Continue even if game info fetch fails
        }
        
        // Get all users
        const users = await User.find({});
        
        // Get the month key
        const monthKey = User.formatDateKey(currentChallenge.date);
        
        // Build leaderboard
        const leaderboard = users.map(user => {
            // Get monthly points
            const monthlyPoints = user.monthlyChallenges.get(monthKey)?.progress || 0;
            
            // Get shadow points if revealed
            let shadowPoints = 0;
            if (currentChallenge.shadow_challange_revealed) {
                shadowPoints = user.shadowChallenges.get(monthKey)?.progress || 0;
            }
            
            const totalPoints = monthlyPoints + shadowPoints;
            
            // Calculate percentage completion
            const totalAchievements = currentChallenge.monthly_challange_game_total || 0;
            const percentage = totalAchievements > 0 
                ? Math.round((totalPoints / 3) * 100) // Rough percentage based on points (0-3)
                : 0;
            
            return {
                username: user.raUsername,
                discordId: user.discordId,
                monthlyPoints,
                shadowPoints,
                totalPoints,
                percentage,
                achieved: Math.floor(totalPoints * totalAchievements / 3), // Estimate achievements based on points
                total: totalAchievements
            };
        });
        
        // Filter out users with no progress
        const filteredLeaderboard = leaderboard.filter(entry => entry.totalPoints > 0);
        
        // Sort by total points
        filteredLeaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
        
        // Calculate challenge end date and time remaining
        const challengeEndDate = new Date(nextMonthStart);
        challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
        challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
        
        // Format the end date
        const monthName = now.toLocaleString('default', { month: 'long' });
        const endDateFormatted = `${monthName} ${challengeEndDate.getDate()}${getDaySuffix(challengeEndDate.getDate())}, ${challengeEndDate.getFullYear()} at 11:59 PM`;
        
        // Calculate time remaining
        const timeRemaining = formatTimeRemaining(challengeEndDate, now);
        
        // Prepare response
        const data = {
            leaderboard: filteredLeaderboard,
            challenge: {
                monthYear: new Date(currentChallenge.date).toLocaleString('default', { month: 'long', year: 'numeric' }),
                monthlyGame: currentChallenge.monthly_challange_gameid,
                gameTitle: gameInfo?.title || 'Unknown Game',
                gameIconUrl: gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null,
                totalAchievements: currentChallenge.monthly_challange_game_total,
                endDate: endDateFormatted,
                timeRemaining: timeRemaining,
                shadowGame: currentChallenge.shadow_challange_revealed ? currentChallenge.shadow_challange_gameid : null,
                shadowRevealed: currentChallenge.shadow_challange_revealed
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Update cache
        cache.monthly.data = data;
        cache.monthly.lastUpdated = new Date();
        
        // Save to disk
        fs.writeFileSync(
            join(CACHE_DIR, 'monthly-leaderboard.json'),
            JSON.stringify(data, null, 2)
        );
        
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching monthly leaderboard:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Yearly leaderboard
app.get('/api/leaderboard/yearly', apiKeyAuth, async (req, res) => {
    try {
        // Check if we have fresh cache
        if (cache.yearly.data && cache.yearly.lastUpdated && 
            (new Date() - cache.yearly.lastUpdated) < (30 * 60 * 1000)) { // 30 minutes
            return res.json(cache.yearly.data);
        }
        
        const currentYear = new Date().getFullYear();
        
        // Get all users
        const users = await User.find({});
        
        // Build leaderboard
        const leaderboard = users.map(user => {
            // Calculate yearly points from monthly challenges
            let yearlyPoints = 0;
            
            // Go through monthly challenges
            for (const [key, value] of user.monthlyChallenges.entries()) {
                // Only count challenges from current year
                if (key.startsWith(currentYear.toString())) {
                    yearlyPoints += value.progress || 0;
                }
            }
            
            // Add shadow challenges
            for (const [key, value] of user.shadowChallenges.entries()) {
                // Only count challenges from current year
                if (key.startsWith(currentYear.toString())) {
                    yearlyPoints += value.progress || 0;
                }
            }
            
            // Add community awards from current year
            const communityPoints = user.getCommunityPointsForYear(currentYear);
            yearlyPoints += communityPoints;
            
            return {
                username: user.raUsername,
                discordId: user.discordId,
                yearlyPoints,
                communityPoints,
                challengePoints: yearlyPoints - communityPoints
            };
        });
        
        // Sort by yearly points
        leaderboard.sort((a, b) => b.yearlyPoints - a.yearlyPoints);
        
        // Prepare response
        const data = {
            leaderboard,
            year: currentYear,
            lastUpdated: new Date().toISOString()
        };
        
        // Update cache
        cache.yearly.data = data;
        cache.yearly.lastUpdated = new Date();
        
        // Save to disk
        fs.writeFileSync(
            join(CACHE_DIR, 'yearly-leaderboard.json'),
            JSON.stringify(data, null, 2)
        );
        
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching yearly leaderboard:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Nominations
app.get('/api/nominations', apiKeyAuth, async (req, res) => {
    try {
        // Check if we have fresh cache
        if (cache.nominations.data && cache.nominations.lastUpdated && 
            (new Date() - cache.nominations.lastUpdated) < (10 * 60 * 1000)) { // 10 minutes
            return res.json(cache.nominations.data);
        }
        
        // Get all users
        const users = await User.find({});
        
        // Get current month/year
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Build nominations list
        const nominations = [];
        const nominationsByGame = new Map();
        
        for (const user of users) {
            // Get current nominations
            const userNominations = user.nominations.filter(nom => {
                const nomMonth = nom.nominatedAt.getMonth();
                const nomYear = nom.nominatedAt.getFullYear();
                return nomMonth === currentMonth && nomYear === currentYear;
            });
            
            for (const nomination of userNominations) {
                // Add to nominations list
                nominations.push({
                    username: user.raUsername,
                    gameId: nomination.gameId,
                    gameTitle: nomination.gameTitle || 'Unknown Game',
                    consoleName: nomination.consoleName || 'Unknown Console',
                    nominatedAt: nomination.nominatedAt
                });
                
                // Track games for popularity counting
                if (!nominationsByGame.has(nomination.gameId)) {
                    nominationsByGame.set(nomination.gameId, {
                        gameId: nomination.gameId,
                        gameTitle: nomination.gameTitle || 'Unknown Game',
                        consoleName: nomination.consoleName || 'Unknown Console',
                        count: 0,
                        nominatedBy: []
                    });
                }
                
                const gameNomination = nominationsByGame.get(nomination.gameId);
                gameNomination.count++;
                if (!gameNomination.nominatedBy.includes(user.raUsername)) {
                    gameNomination.nominatedBy.push(user.raUsername);
                }
            }
        }
        
        // Convert map to array and sort by popularity
        const gamesList = Array.from(nominationsByGame.values())
            .sort((a, b) => b.count - a.count);
        
        // Prepare response
        const data = {
            nominations,
            gamesList,
            monthYear: `${now.toLocaleString('default', { month: 'long' })} ${currentYear}`,
            lastUpdated: new Date().toISOString()
        };
        
        // Update cache
        cache.nominations.data = data;
        cache.nominations.lastUpdated = new Date();
        
        // Save to disk
        fs.writeFileSync(
            join(CACHE_DIR, 'nominations.json'),
            JSON.stringify(data, null, 2)
        );
        
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching nominations:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Force update endpoint (admin only)
app.post('/api/admin/force-update', adminApiKeyAuth, async (req, res) => {
    try {
        // Determine what to update
        const { target } = req.body;
        
        if (!target || (target !== 'all' && target !== 'leaderboards' && target !== 'nominations')) {
            return res.status(400).json({
                error: 'Invalid target. Must be "all", "leaderboards", or "nominations"'
            });
        }
        
        // Clear appropriate cache entries
        if (target === 'all' || target === 'leaderboards') {
            cache.monthly.data = null;
            cache.monthly.lastUpdated = null;
            cache.yearly.data = null;
            cache.yearly.lastUpdated = null;
        }
        
        if (target === 'all' || target === 'nominations') {
            cache.nominations.data = null;
            cache.nominations.lastUpdated = null;
        }
        
        res.json({
            status: 'success',
            message: `Cleared cache for ${target}. Data will be refreshed on next request.`
        });
        
    } catch (error) {
        console.error('Error in force update:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

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

// Start the server
app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
});
