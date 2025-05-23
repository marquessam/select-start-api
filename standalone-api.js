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

// COMPLETELY REVISED Monthly leaderboard endpoint
app.get('/api/leaderboard/monthly', apiKeyAuth, async (req, res) => {
    try {
        console.log('Monthly leaderboard request received');
        
        // Get current month's challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        console.log(`Finding challenge between ${currentMonthStart.toISOString()} and ${nextMonthStart.toISOString()}`);
        
        // Get current challenge without using lean() for safety
        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });
        
        if (!currentChallenge) {
            console.log('No challenge found for current month');
            return res.status(404).json({
                error: 'No current challenge found'
            });
        }

        console.log(`Found challenge for game ID: ${currentChallenge.monthly_challange_gameid}`);
        
        // Get the month key
        const monthKey = User.formatDateKey(currentChallenge.date);
        console.log(`Using month key: ${monthKey}`);
        
        // Get all users without using lean() for safety
        const users = await User.find({});
        console.log(`Found ${users.length} users`);
        
        // Build leaderboard with data directly from the database
        const leaderboard = [];
        
        for (const user of users) {
            try {
                // Get monthly data with full details
                let monthlyPoints = 0;
                let monthlyData = {};
                
                if (user.monthlyChallenges && user.monthlyChallenges instanceof Map && user.monthlyChallenges.has(monthKey)) {
                    monthlyData = user.monthlyChallenges.get(monthKey) || {};
                    monthlyPoints = monthlyData.progress || 0;
                }
                
                // Get shadow data with full details if revealed
                let shadowPoints = 0;
                let shadowAchievements = 0;
                
                if (currentChallenge.shadow_challange_revealed && 
                    user.shadowChallenges && 
                    user.shadowChallenges instanceof Map && 
                    user.shadowChallenges.has(monthKey)) {
                    const shadowData = user.shadowChallenges.get(monthKey) || {};
                    shadowPoints = shadowData.progress || 0;
                    shadowAchievements = shadowData.achievements || 0;
                }
                
                const totalPoints = monthlyPoints + shadowPoints;
                
                // Skip users with no points - no need to include them
                if (totalPoints === 0) {
                    continue;
                }
                
                // Add this user to the leaderboard with full details
                leaderboard.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    monthlyPoints,
                    shadowPoints,
                    totalPoints,
                    // Use the stored percentage directly from the bot
                    percentage: monthlyData.percentage || 0,
                    // Use the actual achievement counts from the bot
                    achieved: monthlyData.achievements || 0,
                    achievements: monthlyData.achievements || 0, // Duplicate for different frontend usages
                    totalAchievements: monthlyData.totalAchievements || currentChallenge.monthly_challange_game_total,
                    gameTitle: monthlyData.gameTitle || "Unknown Game",
                    gameIconUrl: monthlyData.gameIconUrl || null
                });
            } catch (userError) {
                console.error(`Error processing user ${user.raUsername}:`, userError);
                // Continue with next user
            }
        }
        
        console.log(`Processed ${leaderboard.length} users with points`);
        
        // Sort by total points
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
        
        // Calculate challenge end date and time remaining
        const challengeEndDate = new Date(nextMonthStart);
        challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
        challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
        
        // Format the end date
        const monthName = now.toLocaleString('default', { month: 'long' });
        const endDateFormatted = `${monthName} ${challengeEndDate.getDate()}${getDaySuffix(challengeEndDate.getDate())}, ${challengeEndDate.getFullYear()} at 11:59 PM`;
        
        // Calculate time remaining
        const timeRemaining = formatTimeRemaining(challengeEndDate, now);
        
        // Prepare response with enhanced game information
        const data = {
            leaderboard: leaderboard,
            challenge: {
                monthYear: new Date(currentChallenge.date).toLocaleString('default', { month: 'long', year: 'numeric' }),
                monthlyGame: currentChallenge.monthly_challange_gameid,
                gameTitle: currentChallenge.monthly_game_title || "Pokémon Snap",
                gameIconUrl: currentChallenge.monthly_game_icon_url || "https://media.retroachievements.org/Images/064539.png",
                totalAchievements: currentChallenge.monthly_challange_game_total,
                endDate: endDateFormatted,
                timeRemaining: timeRemaining,
                shadowGame: currentChallenge.shadow_challange_revealed ? currentChallenge.shadow_challange_gameid : null,
                shadowRevealed: currentChallenge.shadow_challange_revealed,
                consoleName: currentChallenge.monthly_game_console || "N64"
            },
            lastUpdated: new Date().toISOString()
        };
        
        console.log(`Sending response with ${leaderboard.length} users`);
        
        // Update cache
        cache.monthly.data = data;
        cache.monthly.lastUpdated = new Date();
        
        try {
            // Save to disk
            fs.writeFileSync(
                join(CACHE_DIR, 'monthly-leaderboard.json'),
                JSON.stringify(data, null, 2)
            );
            console.log('Monthly leaderboard saved to disk cache');
        } catch (cacheError) {
            console.error('Error saving monthly cache to disk:', cacheError);
            // Continue sending response even if cache save fails
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching monthly leaderboard:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// COMPLETELY REVISED Yearly leaderboard endpoint
app.get('/api/leaderboard/yearly', apiKeyAuth, async (req, res) => {
    try {
        console.log('Yearly leaderboard request received');
        
        const currentYear = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
        console.log(`Fetching yearly leaderboard for year: ${currentYear}`);
        
        // Get all users without using lean() for safety
        const users = await User.find({});
        console.log(`Found ${users.length} users`);
        
        // Get all challenges for the year
        const yearStart = new Date(currentYear, 0, 1);
        const yearEnd = new Date(currentYear + 1, 0, 1);
        
        const challenges = await Challenge.find({
            date: {
                $gte: yearStart,
                $lt: yearEnd
            }
        }).sort({ date: 1 });
        
        console.log(`Found ${challenges.length} challenges for ${currentYear}`);
        
        // Build enhanced leaderboard with detailed stats
        const leaderboard = [];
        
        for (const user of users) {
            try {
                // Track detailed stats
                let yearlyPoints = 0;
                let masteryCount = 0;
                let beatenCount = 0;
                let participationCount = 0;
                let shadowBeatenCount = 0;
                let shadowParticipationCount = 0;
                
                // Process monthly challenges for this year
                if (user.monthlyChallenges && user.monthlyChallenges instanceof Map) {
                    // Convert Map to Array of entries for safe iteration
                    const entries = Array.from(user.monthlyChallenges.entries());
                    
                    for (const [key, value] of entries) {
                        // Only count challenges from the selected year
                        if (key.startsWith(currentYear.toString())) {
                            const progress = value.progress || 0;
                            yearlyPoints += progress;
                            
                            // Track achievement types
                            if (progress === 3) masteryCount++;
                            else if (progress === 2) beatenCount++;
                            else if (progress === 1) participationCount++;
                        }
                    }
                }
                
                // Process shadow challenges for this year
                if (user.shadowChallenges && user.shadowChallenges instanceof Map) {
                    // Convert Map to Array of entries for safe iteration
                    const entries = Array.from(user.shadowChallenges.entries());
                    
                    for (const [key, value] of entries) {
                        // Only count challenges from the selected year
                        if (key.startsWith(currentYear.toString())) {
                            const progress = value.progress || 0;
                            yearlyPoints += progress;
                            
                            // Track shadow achievement types
                            if (progress === 2) shadowBeatenCount++;
                            else if (progress === 1) shadowParticipationCount++;
                        }
                    }
                }
                
                // Add community awards from the current year
                if (user.communityAwards && Array.isArray(user.communityAwards)) {
                    const communityPoints = user.communityAwards
                        .filter(award => award.awardedAt && new Date(award.awardedAt).getFullYear() === currentYear)
                        .reduce((total, award) => total + (award.points || 0), 0);
                    
                    yearlyPoints += communityPoints;
                }
                
                // Skip users with no points
                if (yearlyPoints <= 0) continue;
                
                leaderboard.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    yearlyPoints,
                    stats: {
                        mastery: masteryCount,
                        beaten: beatenCount,
                        participation: participationCount,
                        shadowBeaten: shadowBeatenCount,
                        shadowParticipation: shadowParticipationCount
                    }
                });
            } catch (userError) {
                console.error(`Error processing yearly data for user ${user.raUsername}:`, userError);
                // Continue with next user
            }
        }
        
        console.log(`Processed ${leaderboard.length} users with yearly points`);
        
        // Sort by yearly points
        leaderboard.sort((a, b) => b.yearlyPoints - a.yearlyPoints);
        
        // Add ranking information
        let lastPoints = -1;
        let lastRank = 0;
        
        const rankedLeaderboard = leaderboard.map((entry, index) => {
            // If points are the same as previous entry, use the same rank
            if (entry.yearlyPoints === lastPoints) {
                entry.rank = lastRank;
            } else {
                entry.rank = index + 1;
                lastRank = index + 1;
                lastPoints = entry.yearlyPoints;
            }
            return entry;
        });
        
        // Prepare response with enhanced data
        const data = {
            leaderboard: rankedLeaderboard,
            year: currentYear,
            challengeCount: challenges.length,
            pointSystem: {
                mastery: 7, // 3 for monthly + 3 for beaten + 1 for participation
                beaten: 4,  // 3 for beaten + 1 for participation
                participation: 1,
                shadowBeaten: 4, // Same as regular beaten
                shadowParticipation: 1
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Update cache
        cache.yearly.data = data;
        cache.yearly.lastUpdated = new Date();
        
        try {
            // Save to disk
            fs.writeFileSync(
                join(CACHE_DIR, 'yearly-leaderboard.json'),
                JSON.stringify(data, null, 2)
            );
            console.log('Yearly leaderboard saved to disk cache');
        } catch (cacheError) {
            console.error('Error saving yearly cache to disk:', cacheError);
            // Continue sending response even if cache save fails
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching yearly leaderboard:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Nominations endpoint - presumably working
app.get('/api/nominations', apiKeyAuth, async (req, res) => {
    try {
        // Force refresh if requested
        const forceRefresh = req.query.refresh === 'true';
        if (forceRefresh) {
            cache.nominations.data = null;
            cache.nominations.lastUpdated = null;
            console.log('Nominations cache cleared by request parameter');
        }
        
        // Check if we have fresh cache
        if (!forceRefresh && cache.nominations.data && cache.nominations.lastUpdated && 
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
            const userNominations = (user.nominations || []).filter(nom => {
                const nomDate = new Date(nom.nominatedAt);
                const nomMonth = nomDate.getMonth();
                const nomYear = nomDate.getFullYear();
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
