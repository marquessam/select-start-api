// --- lib/models.js ---
// MongoDB models based on your Discord bot's schema

import mongoose from 'mongoose';

// Define schemas only if they don't exist already
let User, Challenge;

if (mongoose.models.User) {
  User = mongoose.model('User');
} else {
  const communityAwardSchema = new mongoose.Schema({
    title: {
      type: String,
      required: true
    },
    points: {
      type: Number,
      required: true,
      min: 1
    },
    awardedAt: {
      type: Date,
      default: Date.now
    },
    awardedBy: {
      type: String,
      required: true
    }
  });

  const nominationSchema = new mongoose.Schema({
    gameId: {
      type: String,
      required: true
    },
    gameTitle: {
      type: String
    },
    consoleName: {
      type: String
    },
    nominatedAt: {
      type: Date,
      default: Date.now
    }
  });

  const userSchema = new mongoose.Schema({
    raUsername: {
      type: String,
      required: true,
      unique: true
    },
    discordId: {
      type: String,
      required: true,
      sparse: true
    },
    monthlyChallenges: {
      type: Map,
      of: {
        progress: Number
      },
      default: () => new Map()
    },
    shadowChallenges: {
      type: Map,
      of: {
        progress: Number
      },
      default: () => new Map()
    },
    announcedAchievements: {
      type: [{ type: Object }],
      default: []
    },
    communityAwards: [communityAwardSchema],
    nominations: [nominationSchema],
    // New field to track if historical data has been processed
    historicalDataProcessed: {
      type: Boolean,
      default: false
    }
  }, {
    timestamps: true,
    strict: false // Allow additional fields to be added
  });

  User = mongoose.model('User', userSchema);
}

if (mongoose.models.Challenge) {
  Challenge = mongoose.model('Challenge');
} else {
  const challengeSchema = new mongoose.Schema({
    date: {
      type: Date,
      unique: true,
      required: true
    },
    monthly_challange_gameid: {
      type: String,
      required: true
    },
    monthly_challange_achievement_ids: {
      type: [String],
      required: true,
      default: []
    },
    monthly_challange_game_total: {
      type: Number,
      required: true
    },
    monthly_challange_progression_achievements: {
      type: [String],
      required: false,
      default: []
    },
    monthly_challange_win_achievements: {
      type: [String],
      required: false,
      default: []
    },
    shadow_challange_gameid: {
      type: String,
      required: false
    },
    shadow_challange_achievement_ids: {
      type: [String],
      required: false,
      default: []
    },
    shadow_challange_game_total: {
      type: Number,
      required: false
    },
    shadow_challange_progression_achievements: {
      type: [String],
      required: false,
      default: []
    },
    shadow_challange_win_achievements: {
      type: [String],
      required: false,
      default: []
    },
    shadow_challange_revealed: {
      type: Boolean,
      required: true
    },
  });

  Challenge = mongoose.model('Challenge', challengeSchema);
}

export { User, Challenge };
