// ../utils/habitUtils.js

const getDatesForPeriod = (days) => {
    const dates = new Set();
    // Start from 0 to include today
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // Normalize date format for consistent logging/comparison
        dates.add(d.toDateString()); 
    }
    return dates;
};

const calculateCompletionRate = (habits, days) => {
    if (!habits || habits.length === 0) return { percentage: 100, totalExpected: 0 };
    
    const activeHabits = habits.filter(h => h.isActive);
    if (activeHabits.length === 0) return { percentage: 100, totalExpected: 0 };

    // Expected total is active habits * number of days in the period
    const expectedTotal = activeHabits.length * days;
    let actualTotal = 0;
    const dates = getDatesForPeriod(days);

    activeHabits.forEach(habit => {
        dates.forEach(date => {
            // Check for existence of a log on the specific date
            const isCompleted = habit.logs?.some(log => log.date === date);
            if (isCompleted) {
                actualTotal++;
            }
        });
    });

    if (expectedTotal === 0) return { percentage: 100, totalExpected: 0 };
    const percentage = (actualTotal / expectedTotal) * 100;
    
    return { 
        percentage: Math.round(percentage), 
        totalExpected: expectedTotal,
        totalCompleted: actualTotal
    };
};

/**
 * Calculates the max consecutive streak.
 */
function calculateMaxConsecutive(logs) {
    if (!logs || logs.length === 0) return 0;
    
    // Convert logs to unique, sorted, date-only strings (YYYY-MM-DD)
    const normalizedLogs = logs
        .map(log => new Date(log.date).toISOString().slice(0, 10))
        .filter((value, index, self) => self.indexOf(value) === index) // Unique dates
        .sort(); 
        
    let maxStreak = 0;
    let currentStreak = 0;
    const isLogged = (dateString) => normalizedLogs.includes(dateString);

    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 90; i++) { // Check up to 90 days
        const dateString = checkDate.toISOString().slice(0, 10);
        
        if (isLogged(dateString)) {
            currentStreak++;
        } else {
            break;
        }
        maxStreak = Math.max(maxStreak, currentStreak);
        checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return { maxConsecutive: maxStreak, currentStreak }; // Returning an object for full info
}


/**
 * Calculates today's progress against the goal. (New Definition)
 */
function calculateProgress(logs, frequency = 'daily', goalValue = 1) {
    const today = new Date().toDateString();
    const logForToday = logs?.find(log => log.date === today);
    const valueCompleted = logForToday ? logForToday.value : 0;
    
    const totalExpected = goalValue;
    const completedCount = valueCompleted;
    
    // Ensure goalValue is positive to prevent division by zero or negative progress
    const percentage = goalValue > 0 ? (valueCompleted / goalValue) * 100 : 0;
    
    return { 
        progressPercentage: percentage, 
        totalExpected, 
        completedCount 
    };
}


/**
 * Provides a short, contextual message based on habit performance. (New Definition)
 */
function deriveInsight(habit) {
    const today = new Date().toDateString();
    const logForToday = habit.logs?.find(log => log.date === today);
    const isCompleted = !!logForToday;
    const nowHour = new Date().getHours();
    
    const { currentStreak } = calculateMaxConsecutive(habit.logs || []);
    
    if (!habit.isActive) {
        return { message: "Habit is currently paused.", icon: "pause-circle-outline" };
    }

    if (currentStreak >= 7) {
        return { 
            message: `🔥 You're on a ${currentStreak}-day streak! Keep going.`, 
            icon: "flame" 
        };
    }

    if (isCompleted) {
        // If it's a quantifiable goal and not fully met
        if (habit.goalValue > 1 && logForToday.value < habit.goalValue) {
             return { 
                message: `You've logged progress, but still aiming for ${habit.goalValue}.`, 
                icon: "trending-up" 
            };
        }
        return { message: "✅ Completed for today. Well done!", icon: "checkmark-circle-outline" };
    }
    
    // Incomplete, check for reminder time or late hour
    if (habit.reminderTime && nowHour > parseInt(habit.reminderTime.split(':')[0]) + 1) {
        return { message: "⏳ Reminder time passed. Finish strong!", icon: "time-outline" };
    }
    
    // Default insight
    return { message: "Start your day with this habit!", icon: "bulb-outline" };
}


/**
 * Calculates the overall percentage of user habits completed today.
 */
function calculateDailyCompletion(habits) {
    if (!habits || habits.length === 0) return 0;

    const today = new Date().toDateString();
    const activeHabits = habits.filter(h => h.isActive);

    if (activeHabits.length === 0) return 100; 

    let completedCount = 0;
    activeHabits.forEach(habit => {
        const logForToday = habit.logs?.find(log => log.date === today);
        if (logForToday) {
            completedCount++;
        }
    });

    const dailyPercentage = (completedCount / activeHabits.length) * 100;
    
    return Math.round(dailyPercentage);
}

/**
 * Calculates the average daily completion over the last 7 days.
 */
function calculateWeeklyCompletion(habits) {
    const result = calculateCompletionRate(habits, 7);
    return result.percentage;
}

/**
 * Calculates the all-time completion rate (capped at 90 days).
 */
function calculateOverallCompletion(habits) {
    const result = calculateCompletionRate(habits, 90); 
    return result.percentage;
}


// Final Export Block
export {
    calculateDailyCompletion, calculateMaxConsecutive, calculateOverallCompletion, calculateProgress, calculateWeeklyCompletion, deriveInsight
};

