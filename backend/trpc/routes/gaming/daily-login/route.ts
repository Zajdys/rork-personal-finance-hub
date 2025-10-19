import { protectedProcedure } from "../../../create-context";
import { z } from "zod";
import { getDb } from "../../utils/db";

interface DailyLoginData {
  lastLoginDate: string;
  loginStreak: number;
  totalXp: number;
  level: number;
}

function calculateXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function calculateLevelFromXp(xp: number): number {
  let level = 1;
  let totalXpNeeded = 0;
  
  while (totalXpNeeded + calculateXpForLevel(level) <= xp) {
    totalXpNeeded += calculateXpForLevel(level);
    level++;
  }
  
  return level;
}

function getStreakBonus(streak: number): number {
  if (streak >= 30) return 100;
  if (streak >= 14) return 50;
  if (streak >= 7) return 30;
  if (streak >= 3) return 15;
  return 10;
}

export const dailyLoginProcedure = protectedProcedure
  .input(z.object({
    userId: z.string(),
  }))
  .mutation(async ({ input }) => {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];
    
    const existing = await db.get<DailyLoginData>(
      'SELECT lastLoginDate, loginStreak, totalXp, level FROM daily_login WHERE userId = ?',
      [input.userId]
    );

    if (!existing) {
      const baseXp = 10;
      const level = 1;
      
      await db.run(
        'INSERT INTO daily_login (userId, lastLoginDate, loginStreak, totalXp, level, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [input.userId, today, 1, baseXp, level, new Date().toISOString()]
      );
      
      return {
        awarded: true,
        xpGained: baseXp,
        newStreak: 1,
        totalXp: baseXp,
        level: level,
        streakBonus: 0,
        message: 'První den! +10 XP'
      };
    }

    if (existing.lastLoginDate === today) {
      return {
        awarded: false,
        xpGained: 0,
        newStreak: existing.loginStreak,
        totalXp: existing.totalXp,
        level: existing.level,
        streakBonus: 0,
        message: 'Dnes už jste dostali odměnu!'
      };
    }

    const lastLogin = new Date(existing.lastLoginDate);
    const todayDate = new Date(today);
    const daysDiff = Math.floor((todayDate.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));

    let newStreak = existing.loginStreak;
    if (daysDiff === 1) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    const baseXp = 10;
    const streakBonus = getStreakBonus(newStreak);
    const totalXpGained = baseXp + streakBonus;
    const newTotalXp = existing.totalXp + totalXpGained;
    const newLevel = calculateLevelFromXp(newTotalXp);

    await db.run(
      'UPDATE daily_login SET lastLoginDate = ?, loginStreak = ?, totalXp = ?, level = ?, updatedAt = ? WHERE userId = ?',
      [today, newStreak, newTotalXp, newLevel, new Date().toISOString(), input.userId]
    );

    let message = `+${totalXpGained} XP`;
    if (newStreak > 1) {
      message += ` (${newStreak} dní v řadě!)`;
    }
    if (newLevel > existing.level) {
      message += ` 🎉 Level ${newLevel}!`;
    }

    return {
      awarded: true,
      xpGained: totalXpGained,
      newStreak,
      totalXp: newTotalXp,
      level: newLevel,
      streakBonus,
      leveledUp: newLevel > existing.level,
      message
    };
  });